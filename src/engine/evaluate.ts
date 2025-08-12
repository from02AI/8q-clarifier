import { CFG } from '../config';
import { relevanceScores, distinctnessScores, specificityFlags } from './metrics';
import type { Suggestion } from '../types';

export async function score(ideaCtx: string, options: Pick<Suggestion, 'text' | 'why'>[]) {
  const texts = options.map(o => o.text);
  const [rel, [maxPairCos]] = await Promise.all([
    relevanceScores(ideaCtx, options),
    distinctnessScores(texts)
  ]);
  const spec = specificityFlags(options);
  const distinctPass = maxPairCos <= CFG.DISTINCTNESS_MAX_COS;
  const relPass = rel.every(r => r >= CFG.RELEVANCE_THRESH);
  const specPass = spec.every(Boolean);
  return { rel, maxPairCos, spec, pass: distinctPass && relPass && specPass };
}
