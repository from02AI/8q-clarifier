"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EFFECTIVE_EMBED_MODEL = exports.EFFECTIVE_CHAT_MODEL = exports.CFG = void 0;
require("dotenv/config");
exports.CFG = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    CHAT_MODEL: process.env.CHAT_MODEL || 'gpt-4o',
    EMBED_MODEL: process.env.EMBED_MODEL || 'text-embedding-3-small',
    TIMEOUT_MS: Number(process.env.REQUEST_TIMEOUT_MS || 30000),
    MAX_RETRIES: Number(process.env.MAX_RETRIES || 1),
    // Production model pinning (set PRODUCTION_MODE=true to enforce exact versions)
    PRODUCTION_MODE: process.env.PRODUCTION_MODE === 'true',
    PINNED_CHAT_MODEL: 'gpt-4o-2024-05-13', // Specific version for production
    PINNED_EMBED_MODEL: 'text-embedding-3-small', // Embedding models are generally stable
    // Calibrated thresholds (more lenient based on your data)
    RELEVANCE_THRESH: Number(process.env.RELEVANCE_THRESH || 0.45), // Lowered from 0.65
    DISTINCTNESS_MAX_COS: Number(process.env.DISTINCTNESS_MAX_COS || 0.8), // Raised from 0.75
    // New V2 settings
    OVERSAMPLE_COUNT: Number(process.env.OVERSAMPLE_COUNT || 5),
    USE_LLM_SPECIFICITY: process.env.USE_LLM_SPECIFICITY !== 'false', // Default true
    MAX_REPAIR_ATTEMPTS: Number(process.env.MAX_REPAIR_ATTEMPTS || 1),
    SIMILARITY_THRESHOLD: Number(process.env.SIMILARITY_THRESHOLD || 0.8) // For avoiding duplicate answers
};
// Use pinned models in production mode
exports.EFFECTIVE_CHAT_MODEL = exports.CFG.PRODUCTION_MODE ? exports.CFG.PINNED_CHAT_MODEL : exports.CFG.CHAT_MODEL;
exports.EFFECTIVE_EMBED_MODEL = exports.CFG.PRODUCTION_MODE ? exports.CFG.PINNED_EMBED_MODEL : exports.CFG.EMBED_MODEL;
