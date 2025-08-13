import { runFinalEvaluation } from './evalFinal';
import { saveJSON } from '../util/fileCache';
import * as fs from 'fs';

interface DriftComparison {
  timestamp: string;
  baselineFile: string;
  currentRun: any;
  baseline: any;
  driftDetected: boolean;
  overallPassRateDelta: number;
  questionPassRateDeltas: { [key: number]: number };
  violations: {
    overallDrop: boolean;
    questionDrops: number[];
  };
}

export async function runDriftEvaluation(): Promise<void> {
  console.log('\n[8Q DRIFT] Starting drift evaluation...');
  
  // Find the most recent baseline
  const baselineFile = findMostRecentBaseline();
  if (!baselineFile) {
    console.error('[8Q DRIFT] No baseline found. Run eval:final first to establish baseline.');
    process.exit(1);
  }
  
  console.log(`[8Q DRIFT] Using baseline: ${baselineFile}`);
  const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf-8'));
  
  // Run current evaluation
  console.log('[8Q DRIFT] Running current evaluation...');
  await runFinalEvaluation();
  
  // Load current results
  const currentRun = JSON.parse(fs.readFileSync('./runs/summary.json', 'utf-8'));
  
  // Compare metrics
  const overallPassRateDelta = currentRun.overallPassRate - baseline.overallPassRate;
  const questionPassRateDeltas: { [key: number]: number } = {};
  
  for (let qNum = 1; qNum <= 8; qNum++) {
    questionPassRateDeltas[qNum] = (currentRun.questionPassRates[qNum] || 0) - (baseline.questionPassRates[qNum] || 0);
  }
  
  // Detect violations
  const violations = {
    overallDrop: overallPassRateDelta < -0.03, // 3% drop
    questionDrops: Object.entries(questionPassRateDeltas)
      .filter(([_, delta]) => delta < -0.05) // 5% drop
      .map(([qNum, _]) => parseInt(qNum))
  };
  
  const driftDetected = violations.overallDrop || violations.questionDrops.length > 0;
  
  const driftComparison: DriftComparison = {
    timestamp: new Date().toISOString(),
    baselineFile,
    currentRun,
    baseline,
    driftDetected,
    overallPassRateDelta,
    questionPassRateDeltas,
    violations
  };
  
  // Save drift results
  saveJSON('./runs', 'drift_comparison', driftComparison);
  
  // Print results
  console.log('\n[8Q DRIFT] === DRIFT EVALUATION RESULTS ===');
  console.log(`Baseline: ${baseline.timestamp}`);
  console.log(`Current: ${currentRun.timestamp}`);
  console.log(`\nOverall pass rate: ${(baseline.overallPassRate * 100).toFixed(1)}% → ${(currentRun.overallPassRate * 100).toFixed(1)}% (Delta${overallPassRateDelta > 0 ? '+' : ''}${(overallPassRateDelta * 100).toFixed(1)}%)`);
  
  console.log('\nPer-question pass rate changes:');
  for (let qNum = 1; qNum <= 8; qNum++) {
    const baseRate = baseline.questionPassRates[qNum] || 0;
    const currentRate = currentRun.questionPassRates[qNum] || 0;
    const delta = questionPassRateDeltas[qNum];
    const status = delta < -0.05 ? 'FAIL' : delta < -0.03 ? 'WARN' : 'PASS';
    console.log(`  Q${qNum}: ${(baseRate * 100).toFixed(1)}% → ${(currentRate * 100).toFixed(1)}% (Delta${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}%) ${status}`);
  }
  
  console.log('\nModel/Config Changes:');
  console.log(`Model: ${baseline.modelName} → ${currentRun.modelName} ${baseline.modelName !== currentRun.modelName ? 'CHANGED' : 'SAME'}`);
  console.log(`Embeddings: ${baseline.embeddingModel} → ${currentRun.embeddingModel} ${baseline.embeddingModel !== currentRun.embeddingModel ? 'CHANGED' : 'SAME'}`);
  console.log(`Relevance threshold: ${baseline.config.RELEVANCE_THRESH} → ${currentRun.config.RELEVANCE_THRESH} ${baseline.config.RELEVANCE_THRESH !== currentRun.config.RELEVANCE_THRESH ? 'CHANGED' : 'SAME'}`);
  
  // Drift status
  console.log('\n[8Q DRIFT] DRIFT STATUS:');
  if (violations.overallDrop) {
    console.log(`FAIL Overall pass rate dropped by ${Math.abs(overallPassRateDelta * 100).toFixed(1)}% (threshold: 3%)`);
  }
  if (violations.questionDrops.length > 0) {
    console.log(`FAIL Question-level drops detected: Q${violations.questionDrops.join(', Q')} (threshold: 5%)`);
  }
  
  if (driftDetected) {
    console.log('\nDRIFT DETECTED - Investigation required');
    console.log('Possible causes:');
    console.log('- Model/embedding version change');
    console.log('- Config parameter drift');
    console.log('- Underlying service changes');
    console.log('- Random variance (run again to confirm)');
    process.exit(1);
  } else {
    console.log('\nNO SIGNIFICANT DRIFT DETECTED');
  }
  
  console.log(`\nDrift comparison saved to ./runs/drift_comparison.json`);
}

function findMostRecentBaseline(): string | null {
  const runsDir = './runs';
  if (!fs.existsSync(runsDir)) {
    return null;
  }
  
  const summaryFiles = fs.readdirSync(runsDir)
    .filter(f => f.startsWith('summary') && f.endsWith('.json'))
    .map(f => ({
      file: f,
      path: `${runsDir}/${f}`,
      mtime: fs.statSync(`${runsDir}/${f}`).mtime
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  
  if (summaryFiles.length === 0) {
    return null;
  }
  
  // Return the most recent summary file, or if current run exists, the second most recent
  const currentExists = summaryFiles[0].file === 'summary.json';
  const targetIndex = currentExists ? 1 : 0;
  
  return summaryFiles[targetIndex]?.path || null;
}

if (require.main === module) {
  runDriftEvaluation().catch(e => {
    console.error('Drift evaluation failed:', e);
    process.exit(1);
  });
}
