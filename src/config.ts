import 'dotenv/config';
export const CFG = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  CHAT_MODEL: process.env.CHAT_MODEL || 'gpt-4o-mini', // Cost optimization: default to mini
  EMBED_MODEL: process.env.EMBED_MODEL || 'text-embedding-3-small', // Keep small for cost
  TIMEOUT_MS: Number(process.env.REQUEST_TIMEOUT_MS || 30000),
  MAX_RETRIES: Number(process.env.MAX_RETRIES || 3), // Increased for 429 handling
  
  // Production model pinning (set PRODUCTION_MODE=true to enforce exact versions)
  PRODUCTION_MODE: process.env.PRODUCTION_MODE === 'true',
  PINNED_CHAT_MODEL: 'gpt-4o-mini-2024-07-18', // Cost-optimized pinned model
  PINNED_EMBED_MODEL: 'text-embedding-3-small', // Embedding models are generally stable
  
  // Controller invariants - hard floors
  RELEVANCE_THRESH: 0.45, // Hard floor - never accept below this
  DISTINCTNESS_MAX_COS: 0.80, // Hard ceiling - never accept above this (updated from 0.85)
  
  // Cost optimization settings
  OVERSAMPLE_COUNT: Number(process.env.OVERSAMPLE_COUNT || 4), // Reduced from 5 to 4
  USE_LLM_SPECIFICITY: process.env.USE_LLM_SPECIFICITY === 'true', // Default false - use rules instead
  MAX_REPAIR_ATTEMPTS: Number(process.env.MAX_REPAIR_ATTEMPTS || 1),
  SIMILARITY_THRESHOLD: Number(process.env.SIMILARITY_THRESHOLD || 0.8),
  
  // Rate limiting and concurrency
  MAX_CONCURRENT_SESSIONS: Number(process.env.MAX_CONCURRENT_SESSIONS || 1), // Conservative start
  REQUEST_THROTTLE_MS: Number(process.env.REQUEST_THROTTLE_MS || 1000), // 1 request per second
  BACKOFF_BASE_MS: Number(process.env.BACKOFF_BASE_MS || 2000), // Exponential backoff base
  BACKOFF_MAX_MS: Number(process.env.BACKOFF_MAX_MS || 60000), // Max 60s backoff
  
  // Session management
  SAVE_AFTER_EACH_QUESTION: process.env.SAVE_AFTER_EACH_QUESTION !== 'false', // Default true
  RESUME_FROM_CACHE: process.env.RESUME_FROM_CACHE !== 'false', // Default true
  
  // Question-specific candidate counts (cost optimization)
  EASY_QUESTION_CANDIDATES: 3, // Q1, Q2, Q5, Q6
  HARD_QUESTION_CANDIDATES: 4, // Q3, Q4, Q7, Q8
  
  // Token optimization
  MAX_WHY_WORDS: Number(process.env.MAX_WHY_WORDS || 12) // Shorter explanations
};

// Use pinned models in production mode
export const EFFECTIVE_CHAT_MODEL = CFG.PRODUCTION_MODE ? CFG.PINNED_CHAT_MODEL : CFG.CHAT_MODEL;
export const EFFECTIVE_EMBED_MODEL = CFG.PRODUCTION_MODE ? CFG.PINNED_EMBED_MODEL : CFG.EMBED_MODEL;
