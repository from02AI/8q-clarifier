import OpenAI from 'openai';
import { CFG, EFFECTIVE_EMBED_MODEL, EFFECTIVE_CHAT_MODEL } from '../config';

export const openai = new OpenAI({ 
  apiKey: CFG.OPENAI_API_KEY,
  timeout: CFG.TIMEOUT_MS
});

// Rate limiting state
let lastRequestTime = 0;
const embedCache = new Map<string, number[]>();

// Token tracking for current operation
interface TokenTracker {
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
  requestCounts: {
    chat: number;
    embedding: number;
  };
}

let currentTokenTracker: TokenTracker | null = null;

export function startTokenTracking(): void {
  currentTokenTracker = {
    inputTokens: 0,
    outputTokens: 0,
    embeddingTokens: 0,
    requestCounts: { chat: 0, embedding: 0 }
  };
}

export function getTokenUsage(): TokenTracker | null {
  return currentTokenTracker;
}

export function resetTokenTracking(): void {
  currentTokenTracker = null;
}

// Exponential backoff with jitter for 429 handling
async function withRetryAndBackoff<T>(
  operation: () => Promise<T>,
  context: string = 'operation'
): Promise<T> {
  for (let attempt = 0; attempt <= CFG.MAX_RETRIES; attempt++) {
    try {
      // Rate limiting: ensure minimum time between requests
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      if (timeSinceLastRequest < CFG.REQUEST_THROTTLE_MS) {
        await new Promise(resolve => setTimeout(resolve, CFG.REQUEST_THROTTLE_MS - timeSinceLastRequest));
      }
      lastRequestTime = Date.now();

      const result = await operation();
      
      // Reset on success
      if (attempt > 0) {
        console.log(`[OpenAI] ${context} succeeded after ${attempt} retries`);
      }
      
      return result;
    } catch (error: any) {
      const isRateLimit = error?.status === 429 || error?.code === 'rate_limit_exceeded';
      const isRetryable = isRateLimit || error?.status >= 500;
      
      if (!isRetryable || attempt >= CFG.MAX_RETRIES) {
        console.error(`[OpenAI] ${context} failed after ${attempt} attempts:`, error?.message || error);
        throw error;
      }
      
      // Exponential backoff with jitter
      const baseDelay = CFG.BACKOFF_BASE_MS * Math.pow(2, attempt);
      const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
      const delay = Math.min(baseDelay + jitter, CFG.BACKOFF_MAX_MS);
      
      console.warn(`[OpenAI] ${context} attempt ${attempt + 1} failed (${error?.status || 'unknown'}), retrying in ${delay.toFixed(0)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`${context} failed after all retries`);
}

export async function embed(texts: string[]): Promise<number[][]> {
  // Check cache first
  const cacheKeys = texts.map(t => `embed:${t}`);
  const cached: (number[] | null)[] = cacheKeys.map(key => embedCache.get(key) || null);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];
  
  cached.forEach((cachedResult, i) => {
    if (cachedResult === null) {
      uncachedIndices.push(i);
      uncachedTexts.push(texts[i]);
    }
  });
  
  // Batch request for uncached texts
  let newEmbeddings: number[][] = [];
  if (uncachedTexts.length > 0) {
    newEmbeddings = await withRetryAndBackoff(async () => {
      const res = await openai.embeddings.create({
        model: EFFECTIVE_EMBED_MODEL,
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
  const results: number[][] = [];
  let newEmbeddingIndex = 0;
  cached.forEach((cachedResult, i) => {
    if (cachedResult !== null) {
      results[i] = cachedResult;
    } else {
      results[i] = newEmbeddings[newEmbeddingIndex++];
    }
  });
  
  console.log(`[OpenAI] Embeddings: ${cached.filter(c => c !== null).length} cached, ${uncachedTexts.length} new`);
  return results;
}

// Wrapper for chat completions with retry logic
export async function createChatCompletion(params: OpenAI.Chat.Completions.ChatCompletionCreateParams): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  return withRetryAndBackoff(async () => {
    const result = await openai.chat.completions.create({
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
    
    return result as OpenAI.Chat.Completions.ChatCompletion;
  }, `chat completion (${params.model})`);
}
