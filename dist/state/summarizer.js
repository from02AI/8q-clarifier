"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeState = summarizeState;
const config_1 = require("../config");
const client_1 = require("../openai/client");
async function summarizeState(state) {
    // Keep idea, last 2 answers verbatim; others summarized
    const last2 = state.answers.slice(-2);
    const older = state.answers.slice(0, -2);
    let features = { ...state.features };
    if (older.length) {
        const sys = { role: 'system', content: 'Compress the following Q/A pairs into 1–2 sentences per dimension: audience, problem, solution, edge, metric, risk.' };
        const usr = { role: 'user', content: JSON.stringify(older) };
        const msg = await client_1.openai.chat.completions.create({ model: config_1.EFFECTIVE_CHAT_MODEL, messages: [sys, usr] });
        features = { ...features, summary: msg.choices[0].message.content || '' };
    }
    return { ...state, answers: [...older, ...last2], features };
}
