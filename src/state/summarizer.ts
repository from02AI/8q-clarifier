import OpenAI from 'openai';
import { openai } from '../openai/client';
import { ConversationState, AnswerChoice } from '../types';

export async function summarizeState(state: ConversationState): Promise<ConversationState> {
  // Keep idea, last 2 answers verbatim; others summarized
  const last2 = state.answers.slice(-2);
  const older = state.answers.slice(0, -2);
  let features = { ...state.features };
  if (older.length) {
    const sys = { role: 'system' as const, content: 'Compress the following Q/A pairs into 1–2 sentences per dimension: audience, problem, solution, edge, metric, risk.' };
    const usr = { role: 'user' as const, content: JSON.stringify(older) };
    const msg = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [sys, usr] });
    features = { ...features, summary: msg.choices[0].message.content || '' };
  }
  return { ...state, answers:[...older, ...last2], features };
}
