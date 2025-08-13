"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openai = void 0;
exports.startTokenTracking = startTokenTracking;
exports.getTokenUsage = getTokenUsage;
exports.resetTokenTracking = resetTokenTracking;
exports.embed = embed;
exports.createChatCompletion = createChatCompletion;
const openai_1 = __importDefault(require("openai"));
const config_1 = require("../config");
exports.openai = new openai_1.default({
    apiKey: config_1.CFG.OPENAI_API_KEY,
    timeout: config_1.CFG.TIMEOUT_MS
});
// Rate limiting state
let lastRequestTime = 0;
const embedCache = new Map();
let currentTokenTracker = null;
function startTokenTracking() {
    currentTokenTracker = {
        inputTokens: 0,
        outputTokens: 0,
        embeddingTokens: 0,
        requestCounts: { chat: 0, embedding: 0 }
    };
}
function getTokenUsage() {
    return currentTokenTracker;
}
function resetTokenTracking() {
    currentTokenTracker = null;
}
// Exponential backoff with jitter for 429 handling
async function withRetryAndBackoff(operation, context = 'operation') {
    for (let attempt = 0; attempt <= config_1.CFG.MAX_RETRIES; attempt++) {
        try {
            // Rate limiting: ensure minimum time between requests
            const now = Date.now();
            const timeSinceLastRequest = now - lastRequestTime;
            if (timeSinceLastRequest < config_1.CFG.REQUEST_THROTTLE_MS) {
                await new Promise(resolve => setTimeout(resolve, config_1.CFG.REQUEST_THROTTLE_MS - timeSinceLastRequest));
            }
            lastRequestTime = Date.now();
            const result = await operation();
            // Reset on success
            if (attempt > 0) {
                console.log(`[OpenAI] ${context} succeeded after ${attempt} retries`);
            }
            return result;
        }
        catch (error) {
            const isRateLimit = error?.status === 429 || error?.code === 'rate_limit_exceeded';
            const isRetryable = isRateLimit || error?.status >= 500;
            if (!isRetryable || attempt >= config_1.CFG.MAX_RETRIES) {
                console.error(`[OpenAI] ${context} failed after ${attempt} attempts:`, error?.message || error);
                throw error;
            }
            // Exponential backoff with jitter
            const baseDelay = config_1.CFG.BACKOFF_BASE_MS * Math.pow(2, attempt);
            const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
            const delay = Math.min(baseDelay + jitter, config_1.CFG.BACKOFF_MAX_MS);
            console.warn(`[OpenAI] ${context} attempt ${attempt + 1} failed (${error?.status || 'unknown'}), retrying in ${delay.toFixed(0)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error(`${context} failed after all retries`);
}
async function embed(texts) {
    // Check cache first
    const cacheKeys = texts.map(t => `embed:${t}`);
    const cached = cacheKeys.map(key => embedCache.get(key) || null);
    const uncachedIndices = [];
    const uncachedTexts = [];
    cached.forEach((cachedResult, i) => {
        if (cachedResult === null) {
            uncachedIndices.push(i);
            uncachedTexts.push(texts[i]);
        }
    });
    // Batch request for uncached texts
    let newEmbeddings = [];
    if (uncachedTexts.length > 0) {
        newEmbeddings = await withRetryAndBackoff(async () => {
            const res = await exports.openai.embeddings.create({
                model: config_1.EFFECTIVE_EMBED_MODEL,
                input: uncachedTexts
            });
            // Track embedding tokens if tracking is active
            if (currentTokenTracker && res.usage) {
                currentTokenTracker.embeddingTokens += res.usage.total_tokens;
                currentTokenTracker.requestCounts.embedding += 1;
            }
            return res.data.map(d => d.embedding);
        }, `embedding ${uncachedTexts.length} texts`);
        // Cache new embeddings
        uncachedIndices.forEach((originalIndex, newIndex) => {
            embedCache.set(cacheKeys[originalIndex], newEmbeddings[newIndex]);
        });
    }
    // Combine cached and new results
    const results = [];
    let newEmbeddingIndex = 0;
    cached.forEach((cachedResult, i) => {
        if (cachedResult !== null) {
            results[i] = cachedResult;
        }
        else {
            results[i] = newEmbeddings[newEmbeddingIndex++];
        }
    });
    console.log(`[OpenAI] Embeddings: ${cached.filter(c => c !== null).length} cached, ${uncachedTexts.length} new`);
    return results;
}
// Wrapper for chat completions with retry logic
async function createChatCompletion(params) {
    return withRetryAndBackoff(async () => {
        const result = await exports.openai.chat.completions.create({
            ...params,
            stream: false // Ensure we get a ChatCompletion, not a stream
        });
        // Track tokens if tracking is active
        if (currentTokenTracker && result.usage) {
            currentTokenTracker.inputTokens += result.usage.prompt_tokens;
            currentTokenTracker.outputTokens += result.usage.completion_tokens;
            currentTokenTracker.requestCounts.chat += 1;
            console.log(`[OpenAI] Tokens - Input: ${result.usage.prompt_tokens}, Output: ${result.usage.completion_tokens}, Total: ${result.usage.total_tokens}`);
        }
        return result;
    }, `chat completion (${params.model})`);
}
