## Setup
1) `cp .env.example .env` and put your `OPENAI_API_KEY`.
2) `npm install`

## Run demo
`npm run demo`
- Generates 3 suggestions per question across 8 questions for a sample idea.
- Writes cache to `./cache/demo/q*/` so you can inspect payloads and scores.

## Tune
- Adjust thresholds in `.env` (RELEVANCE_THRESH, DISTINCTNESS_MAX_COS).
- Adjust few-shot examples in `src/prompts/examples.ts` and per-question hints in `src/prompts/rubrics.ts`.
- Re-run `npm run demo` to see impact quickly.
