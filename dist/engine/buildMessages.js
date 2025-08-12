"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMessages = buildMessages;
const system_1 = require("../prompts/system");
const examples_1 = require("../prompts/examples");
const rubrics_1 = require("../prompts/rubrics");
function buildMessages(state, qNum, qText) {
    const rubric = rubrics_1.RUBRICS[qNum];
    const preCommit = `Before calling the tool: ensure A,B,C are mutually distinct along: ${rubric.axes.join(', ')}. If any two share a value, rewrite them.`;
    return [
        { role: 'system', content: system_1.SYSTEM_PROMPT },
        ...examples_1.FEW_SHOT,
        { role: 'user', content: JSON.stringify({ state, questionNumber: qNum, question: qText, guidance: rubric.guidance, preCommit }) }
    ];
}
