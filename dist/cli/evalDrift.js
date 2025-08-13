"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDriftEvaluation = runDriftEvaluation;
const evalFinal_1 = require("./evalFinal");
const fileCache_1 = require("../util/fileCache");
const fs = __importStar(require("fs"));
async function runDriftEvaluation() {
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
    await (0, evalFinal_1.runFinalEvaluation)();
    // Load current results
    const currentRun = JSON.parse(fs.readFileSync('./runs/summary.json', 'utf-8'));
    // Compare metrics
    const overallPassRateDelta = currentRun.overallPassRate - baseline.overallPassRate;
    const questionPassRateDeltas = {};
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
    const driftComparison = {
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
    (0, fileCache_1.saveJSON)('./runs', 'drift_comparison', driftComparison);
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
    }
    else {
        console.log('\nNO SIGNIFICANT DRIFT DETECTED');
    }
    console.log(`\nDrift comparison saved to ./runs/drift_comparison.json`);
}
function findMostRecentBaseline() {
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
