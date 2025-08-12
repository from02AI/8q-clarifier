"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.score = score;
const config_1 = require("../config");
const metrics_1 = require("./metrics");
async function score(ideaCtx, options) {
    const texts = options.map(o => o.text);
    const [rel, [maxPairCos]] = await Promise.all([
        (0, metrics_1.relevanceScores)(ideaCtx, options),
        (0, metrics_1.distinctnessScores)(texts)
    ]);
    const spec = (0, metrics_1.specificityFlags)(options);
    const distinctPass = maxPairCos <= config_1.CFG.DISTINCTNESS_MAX_COS;
    const relPass = rel.every(r => r >= config_1.CFG.RELEVANCE_THRESH);
    const specPass = spec.every(Boolean);
    return { rel, maxPairCos, spec, pass: distinctPass && relPass && specPass };
}
