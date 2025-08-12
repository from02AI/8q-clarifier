"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openai = void 0;
exports.embed = embed;
const openai_1 = __importDefault(require("openai"));
const config_1 = require("../config");
exports.openai = new openai_1.default({ apiKey: config_1.CFG.OPENAI_API_KEY });
async function embed(texts) {
    const res = await exports.openai.embeddings.create({
        model: config_1.CFG.EMBED_MODEL,
        input: texts
    });
    return res.data.map(d => d.embedding);
}
