"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateQuestion = generateQuestion;
const client_1 = require("../openai/client");
const tools_1 = require("../openai/tools");
const buildMessages_1 = require("./buildMessages");
const sanitize_1 = require("./sanitize");
const evaluate_1 = require("./evaluate");
const repair_1 = require("./repair");
const config_1 = require("../config");
const metrics_1 = require("./metrics");
async function generateQuestion(state, qNum, qText) {
    const messages = (0, buildMessages_1.buildMessages)(state, qNum, qText);
    // Primary call
    const res = await client_1.openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools: tools_1.tools,
        tool_choice: { type: 'function', function: { name: 'suggest_options' } }
    });
    const tc = res.choices[0].message.tool_calls?.[0];
    let payload = (0, sanitize_1.sanitize)(tc ? JSON.parse(tc.function.arguments) : {});
    (0, sanitize_1.validate)(payload); // soft check
    const ideaCtx = `${(0, metrics_1.anchorForQuestion)(qNum, state.idea, state.features)}\n${state.features.summary || ''}`.trim();
    let s = await (0, evaluate_1.score)(ideaCtx, payload.options);
    if (s.pass)
        return { payload: payload, score: s, repaired: false };
    // Build failing set
    const failingIds = [];
    payload.options.forEach((o, i) => {
        const relOk = s.rel[i] >= config_1.CFG.RELEVANCE_THRESH;
        const specOk = s.spec[i];
        if (!(relOk && specOk))
            failingIds.push(['A', 'B', 'C'][i]);
    });
    // If only distinctness failed, replace B and C
    if (failingIds.length === 0 && s.maxPairCos > config_1.CFG.DISTINCTNESS_MAX_COS) {
        failingIds.push('B', 'C');
    }
    // Targeted repair once
    if (failingIds.length > 0) {
        const reasons = `rel: ${s.rel.map(n => n.toFixed(2)).join(',')} | distinctMaxCos: ${s.maxPairCos.toFixed(2)} | spec: ${s.spec}`;
        const patch = await (0, repair_1.repair)(messages, failingIds, reasons);
        if (patch?.options) {
            for (const p of patch.options) {
                const idx = ['A', 'B', 'C'].indexOf(p.id);
                if (idx >= 0)
                    payload.options[idx] = p;
            }
            payload = (0, sanitize_1.sanitize)(payload);
            s = await (0, evaluate_1.score)(ideaCtx, payload.options);
        }
    }
    return { payload: payload, score: s, repaired: true };
}
