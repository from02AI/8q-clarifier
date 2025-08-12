import { openai } from '../openai/client';
import { tools } from '../openai/tools';
import { buildMessages } from './buildMessages';
import { sanitize, validate } from './sanitize';
import { score } from './evaluate';
import { repair } from './repair';
import { ConversationState, QuestionOutput } from '../types';
import { CFG } from '../config';
import { anchorForQuestion } from './metrics';

export async function generateQuestion(state: ConversationState, qNum: number, qText: string) {
  const messages = buildMessages(state, qNum, qText);

  // Primary call
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    tools,
    tool_choice: { type: 'function', function: { name: 'suggest_options' } }
  });
  const tc = res.choices[0].message.tool_calls?.[0];
  let payload = sanitize(tc ? JSON.parse(tc.function.arguments) : {});
  validate(payload); // soft check

  const ideaCtx = `${anchorForQuestion(qNum, state.idea, state.features)}\n${state.features.summary || ''}`.trim();
  let s = await score(ideaCtx, payload.options);

  if (s.pass) return { payload: payload as QuestionOutput, score: s, repaired: false };

  // Build failing set
  const failingIds: string[] = [];
  payload.options.forEach((o: any, i: number) => {
    const relOk = s.rel[i] >= CFG.RELEVANCE_THRESH;
    const specOk = s.spec[i];
    if (!(relOk && specOk)) failingIds.push(['A', 'B', 'C'][i]);
  });

  // If only distinctness failed, replace B and C
  if (failingIds.length === 0 && s.maxPairCos > CFG.DISTINCTNESS_MAX_COS) {
    failingIds.push('B', 'C');
  }

  // Targeted repair once
  if (failingIds.length > 0) {
    const reasons = `rel: ${s.rel.map(n => n.toFixed(2)).join(',')} | distinctMaxCos: ${s.maxPairCos.toFixed(2)} | spec: ${s.spec}`;
    const patch = await repair(messages, failingIds, reasons);
    if (patch?.options) {
      for (const p of patch.options) {
        const idx = ['A', 'B', 'C'].indexOf(p.id);
        if (idx >= 0) payload.options[idx] = p;
      }
      payload = sanitize(payload);
      s = await score(ideaCtx, payload.options);
    }
  }

  return { payload: payload as QuestionOutput, score: s, repaired: true };
}
