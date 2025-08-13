import { EFFECTIVE_CHAT_MODEL } from '../config';

import { openai } from '../openai/client';
import { tools } from '../openai/tools';

export async function repair(messages: any[], failingIds: string[], reasons: string) {
  const user = {
    role: 'user',
    content:
      `Failing IDs: ${failingIds.join(', ')}. Reasons: ${reasons}. ` +
      `Replace ONLY those IDs. Make them more relevant/distinct/specific by changing customer/mechanism/channel, ` +
      `and include either a number+unit OR a named integration. Keep schema and ids A,B,C.`
  } as const;

  const res = await openai.chat.completions.create({
  model: EFFECTIVE_CHAT_MODEL,
    messages: [...messages, user],
    tools,
    tool_choice: { type: 'function', function: { name: 'suggest_options' } }
  });

  const tc = res.choices[0].message.tool_calls?.[0];
  return tc ? JSON.parse(tc.function.arguments) : null;
}
