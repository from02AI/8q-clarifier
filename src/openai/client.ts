import OpenAI from 'openai';
import { CFG } from '../config';

export const openai = new OpenAI({ apiKey: CFG.OPENAI_API_KEY });

export async function embed(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: CFG.EMBED_MODEL,
    input: texts
  });
  return res.data.map(d => d.embedding);
}
