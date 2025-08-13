# 8Q Clarifier - Production Ready

An AI-powered business idea clarification system that generates 3 high-quality options for each of 8 critical business questions.

## Setup
1) `cp .env.example .env` and put your `OPENAI_API_KEY`.
2) `npm install`

## Quick Start
```bash
npm run demo          # Single demo run (8 questions)
npm run eval:final    # Full evaluation (50 sessions)
npm run eval:drift    # Check for model drift vs baseline
```

## Production Usage

### Single Question Interface
```typescript
import { productionClarifier } from './src/engine/production';

const result = await productionClarifier.generateQuestion(
  state,           // ConversationState with idea and previous answers
  questionNumber,  // 1-8
  questionText     // The question string
);

// Returns: { options, fillerUsed, templateUsed, telemetry, success }
```

### Circuit Breaker Monitoring
```typescript
const status = productionClarifier.getCircuitBreakerStatus();
// Returns: { templateUsageRate, samplesCount, isHealthy }
```

## Evaluation & Monitoring

### Acceptance Criteria
- **Overall pass rate**: ≥95% of questions pass all gates
- **Per-question pass rate**: ≥92% for each Q1-Q8 individually  
- **P95 latency**: ≤20s per question
- **Filler usage**: ≤35% of questions
- **Template usage**: ≤5% of questions

### Commands
- `npm run eval:final` - Runs 10 seeds × 5 trials (50 sessions) and validates SLOs
- `npm run eval:drift` - Compares current performance against last baseline
- `npm run demo` - Single quick demo for testing

### Output Files
- `./runs/summary.json` - High-level metrics and SLO status
- `./runs/telemetry.jsonl` - Per-question detailed telemetry
- `./runs/options.csv` - All generated options with scores
- `./runs/questions.csv` - Per-question aggregated metrics
- `./runs/drift_comparison.json` - Drift analysis vs baseline

### Telemetry Fields (logged per question)
- `bestRel` - Highest relevance score achieved
- `relativeFloorUsed` - Dynamic threshold (90% of best)
- `absFloorUsed` - Static relevance threshold (0.45)
- `selectedRel[]` - Relevance scores of final 3 options
- `spec[]` - Specificity pass/fail for final 3 options
- `maxPairCos` - Maximum cosine similarity between options
- `repaired` - Whether repair step was used
- `batchFillerUsed` - Whether batch filler was used
- `templateUsed` - Whether template fallback was used
- `finalPass` - Whether question passed all gates
- `qLatencyMs` - Question processing time

## Production Configuration

### Model Pinning
Set `PRODUCTION_MODE=true` to use pinned model versions:
- Chat: `gpt-4o-2024-05-13`
- Embeddings: `text-embedding-3-small`

### Thresholds
Adjust in `.env`:
- `RELEVANCE_THRESH=0.45` - Minimum relevance score
- `DISTINCTNESS_MAX_COS=0.8` - Maximum option similarity
- `MAX_REPAIR_ATTEMPTS=1` - Repair retry limit

## Known Caveats

### Model/Embedding Drift
Future model versions may change relevance scoring behavior. The drift detection system monitors for >3% overall or >5% per-question drops.

### Lexical Anchoring
The system uses question-specific anchor terms ("dataset", "exclusive") to boost relevance. These are surface-level cues but are acceptable because specificity rules also require concrete assets/numbers.

### Edge Cases
If early answers are extremely unusual, the filler system may work harder. The deterministic template fallback provides a safety net.

## Architecture

### Pipeline Stages
1. **Generate** - 5 candidate options with oversample
2. **Score** - Relevance, specificity, distinctness evaluation  
3. **Select** - Greedy selection of top 3 with distinctness
4. **Repair** - Targeted fixes for failing options
5. **Fill** - Batch filler (3 candidates) for remaining slots
6. **Fallback** - Deterministic templates if filler fails
7. **Validate** - Controller invariants enforcement

### Quality Gates
- **Relevance**: ≥0.45 absolute OR ≥90% of best for question
- **Specificity**: Concrete numbers/tools OR edge assets (Q7)
- **Distinctness**: Max cosine similarity ≤0.8 between options

### Safety Mechanisms
- Controller invariants prevent invalid finalizations
- Circuit breaker warns if template usage >10% over 100 questions
- Template fallback guarantees 3 options even in failure modes
- Comprehensive telemetry for debugging and monitoring
