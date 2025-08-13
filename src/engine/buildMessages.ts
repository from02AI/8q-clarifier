import { SYSTEM_PROMPT, QUESTION_PROMPTS, Q7_EDGE_ASSET_EXAMPLES } from '../prompts/system';
import { FEW_SHOT } from '../prompts/examples';
import { RUBRICS } from '../prompts/rubrics';
import { ConversationState } from '../types';

export function buildMessages(state: ConversationState, qNum: number, qText: string) {
  const rubric = RUBRICS[qNum];
  const preCommit = `Before calling the tool: ensure A,B,C are mutually distinct along: ${rubric.axes.join(', ')}. If any two share a value, rewrite them.`;
  
  // Use question-specific prompt patches for enhanced pass rates
  let guidance: string;
  if (QUESTION_PROMPTS[qNum]) {
    guidance = QUESTION_PROMPTS[qNum];
  } else if (qNum === 7) {
    guidance = `${rubric.guidance}\n${Q7_EDGE_ASSET_EXAMPLES}`;
  } else {
    guidance = rubric.guidance;
  }
  
  return [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...FEW_SHOT,
    { role: 'user' as const, content: JSON.stringify({ state, questionNumber: qNum, question: qText, guidance, preCommit }) }
  ];
}
