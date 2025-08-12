import { z } from 'zod';
import { QuestionOutputSchema } from '../schemas/suggestion';

export function sanitize(raw: any, maxOptions: number = 5): any {
  // Trim to maxOptions, normalize ids if needed
  if (Array.isArray(raw?.options)) {
    const ids = ['A','B','C','D','E','F','G','H'];
    raw.options = raw.options.filter((o: any) => o).slice(0, maxOptions).map((o: any, i: number) => ({ ...o, id: ids[i] }));
  }
  // Ensure notes exists
  if (!raw?.notes?.distinctAxes) raw.notes = { distinctAxes: ['customer','mechanism'] };
  return raw;
}

export function validate(raw: any) {
  return QuestionOutputSchema.safeParse(raw);
}
