import { SYSTEM_PROMPT } from '../prompts/system';
import { FEW_SHOT } from '../prompts/examples';
import { RUBRICS } from '../prompts/rubrics';
import { ConversationState } from '../types';

export function buildMessages(state: ConversationState, qNum: number, qText: string) {
  const rubric = RUBRICS[qNum];
  const preCommit = `Before calling the tool: ensure A,B,C are mutually distinct along: ${rubric.axes.join(', ')}. If any two share a value, rewrite them.`;
  return [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...FEW_SHOT,
    { role: 'user' as const, content: JSON.stringify({ state, questionNumber: qNum, question: qText, guidance: rubric.guidance, preCommit }) }
  ];
}
