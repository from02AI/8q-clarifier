"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.anchorForQuestion = anchorForQuestion;
exports.cosine = cosine;
exports.relevanceScores = relevanceScores;
exports.distinctnessScores = distinctnessScores;
exports.specificityFlags = specificityFlags;
const client_1 = require("../openai/client");
function anchorForQuestion(qNum, idea, features = {}) {
    const base = idea;
    switch (qNum) {
        case 1: return `One-sentence idea for: ${base}`;
        case 2: return `Target audience for: ${base}`;
        case 3: return `Problems faced for: ${base}`;
        case 4: return `Solution mechanisms for: ${base}`;
        case 5: return `Success metrics for: ${base}`;
        case 6: return `Common alternatives to ${base} are tool names and workflows (e.g., email chains, Zoom meetings, Trello/Asana boards, Google Docs/Sheets, Dropbox). Stay on 'what they use today.'`;
        case 7: return `Hard-to-copy edge for: ${base} (concrete asset: dataset size, exclusive partner, distribution lock, model fine-tune scale)`;
        case 8: return `Biggest unknown risk for: ${base}`;
        default: return base;
    }
}
function cosine(a, b) {
    let s = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        s += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return s / (Math.sqrt(na) * Math.sqrt(nb));
}
async function relevanceScores(ideaCtx, options) {
    const full = options.map(o => `${o.text} ${o.why ?? ''}`.trim());
    const vecs = await (0, client_1.embed)([ideaCtx, ...full]);
    const base = vecs[0];
    return vecs.slice(1).map(v => cosine(base, v));
}
async function distinctnessScores(optionTexts) {
    const vecs = await (0, client_1.embed)(optionTexts);
    const cos = (i, j) => cosine(vecs[i], vecs[j]);
    // return [maxPairCos]
    const ab = cos(0, 1), ac = cos(0, 2), bc = cos(1, 2);
    return [Math.max(ab, ac, bc)];
}
function specificityFlags(options) {
    const num = /\b\d+(\s?[-–]\s?\d+)?\s?(%|p|people|persons|person|staff|employees|users?|teams?|days?|weeks?|months?|minutes?|mins?|hrs?|hours?)\b/i;
    const tool = /\b(slack|microsoft\s?teams|teams|figma|trello|asana|notion|jira|salesforce|shopify|google\s?workspace|google\s?sheets|google\s?docs|monday\.com|airtable|zoom|adobe|adobe\s?creative\s?suite|adobe\s?creative\s?cloud|miro|loom|canva|clickup|basecamp|github|gitlab|bitbucket|dropbox|google\s?drive|onedrive|sharepoint|email\s?chains|excel|word|powerpoint|outlook|gmail)\b/i;
    return options.map(o => {
        const s = `${o.text} ${o.why ?? ''}`;
        return num.test(s) || tool.test(s);
    });
}
