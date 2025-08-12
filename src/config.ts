import 'dotenv/config';
export const CFG = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  CHAT_MODEL: process.env.CHAT_MODEL || 'gpt-4o',
  EMBED_MODEL: process.env.EMBED_MODEL || 'text-embedding-3-small',
  TIMEOUT_MS: Number(process.env.REQUEST_TIMEOUT_MS || 30000),
  MAX_RETRIES: Number(process.env.MAX_RETRIES || 1),
  
  // Calibrated thresholds (more lenient based on your data)
  RELEVANCE_THRESH: Number(process.env.RELEVANCE_THRESH || 0.45), // Lowered from 0.65
  DISTINCTNESS_MAX_COS: Number(process.env.DISTINCTNESS_MAX_COS || 0.8), // Raised from 0.75
  
  // New V2 settings
  OVERSAMPLE_COUNT: Number(process.env.OVERSAMPLE_COUNT || 5),
  USE_LLM_SPECIFICITY: process.env.USE_LLM_SPECIFICITY !== 'false', // Default true
  MAX_REPAIR_ATTEMPTS: Number(process.env.MAX_REPAIR_ATTEMPTS || 1),
  SIMILARITY_THRESHOLD: Number(process.env.SIMILARITY_THRESHOLD || 0.8) // For avoiding duplicate answers
};
