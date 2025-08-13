"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repair = repair;
const config_1 = require("../config");
const client_1 = require("../openai/client");
const tools_1 = require("../openai/tools");
async function repair(messages, failingIds, reasons) {
    const user = {
        role: 'user',
        content: `Failing IDs: ${failingIds.join(', ')}. Reasons: ${reasons}. ` +
            `Replace ONLY those IDs. Make them more relevant/distinct/specific by changing customer/mechanism/channel, ` +
            `and include either a number+unit OR a named integration. Keep schema and ids A,B,C.`
    };
    const res = await client_1.openai.chat.completions.create({
        model: config_1.EFFECTIVE_CHAT_MODEL,
        messages: [...messages, user],
        tools: tools_1.tools,
        tool_choice: { type: 'function', function: { name: 'suggest_options' } }
    });
    const tc = res.choices[0].message.tool_calls?.[0];
    return tc ? JSON.parse(tc.function.arguments) : null;
}
