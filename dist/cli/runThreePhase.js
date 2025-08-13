"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runThreePhaseEvaluation = runThreePhaseEvaluation;
exports.printFinalReport = printFinalReport;
const config_1 = require("../config");
const runBatch_1 = require("./runBatch");
async function runThreePhaseEvaluation(baseIdea = 'AI copilot for remote creative teams') {
    const results = [];
    console.log('\n[8Q] ===== THREE-PHASE EVALUATION PLAN =====');
    console.log(`Base idea: "${baseIdea}"`);
    console.log('Phase 0: Calibration (1 session)');
    console.log('Phase 1: Smoke test (10 sessions)');
    console.log('Phase 2: Sample test (25 sessions)');
    console.log('Phase 3: Full evaluation (50 sessions)');
    console.log('==========================================\n');
    // Phase 0: Calibration
    console.log('[8Q] Starting Phase 0: Calibration (1 session)...');
    const phase0 = await (0, runBatch_1.runEvaluationBatch)({
        sessionCount: 1,
        baseIdea,
        sessionPrefix: 'phase0-cal',
        continueFromLastSession: false
    });
    const phase0Result = {
        phase: 'Phase 0: Calibration',
        sessionCount: 1,
        ...phase0,
        passed: phase0.completedSessions === 1 && phase0.passRate >= 0.95 && phase0.averageLatency <= 20000,
        reason: phase0.completedSessions < 1 ? 'Session failed to complete' :
            phase0.passRate < 0.95 ? `Pass rate ${(phase0.passRate * 100).toFixed(1)}% < 95%` :
                phase0.averageLatency > 20000 ? `Latency ${phase0.averageLatency.toFixed(0)}ms > 20s` : undefined
    };
    results.push(phase0Result);
    console.log(`[8Q] Phase 0 result: ${phase0Result.passed ? 'PASS' : 'FAIL'} - ${phase0Result.reason || 'All criteria met'}`);
    if (!phase0Result.passed) {
        console.log('[8Q] Phase 0 failed. Please fix issues before proceeding to larger batches.');
        return results;
    }
    // Phase 1: Smoke test (10 sessions)
    console.log('\n[8Q] Starting Phase 1: Smoke test (10 sessions)...');
    const phase1 = await (0, runBatch_1.runEvaluationBatch)({
        sessionCount: 10,
        baseIdea,
        sessionPrefix: 'phase1-smoke',
        continueFromLastSession: true
    });
    const phase1Result = {
        phase: 'Phase 1: Smoke test',
        sessionCount: 10,
        ...phase1,
        passed: phase1.completedSessions >= 9 && phase1.passRate >= 0.95 && phase1.averageLatency <= 18000,
        reason: phase1.completedSessions < 9 ? `Only ${phase1.completedSessions}/10 sessions completed` :
            phase1.passRate < 0.95 ? `Pass rate ${(phase1.passRate * 100).toFixed(1)}% < 95%` :
                phase1.averageLatency > 18000 ? `Latency ${phase1.averageLatency.toFixed(0)}ms > 18s` : undefined
    };
    results.push(phase1Result);
    console.log(`[8Q] Phase 1 result: ${phase1Result.passed ? 'PASS' : 'FAIL'} - ${phase1Result.reason || 'All criteria met'}`);
    if (!phase1Result.passed) {
        console.log('[8Q] Phase 1 failed. Investigate issues before proceeding to Phase 2.');
        return results;
    }
    // Phase 2: Sample test (25 sessions)
    console.log('\n[8Q] Starting Phase 2: Sample test (25 sessions)...');
    const phase2 = await (0, runBatch_1.runEvaluationBatch)({
        sessionCount: 25,
        baseIdea,
        sessionPrefix: 'phase2-sample',
        continueFromLastSession: true
    });
    // Calculate 95% confidence interval for pass rate
    const n = phase2.completedSessions * 8; // Total questions
    const p = phase2.passRate;
    const se = Math.sqrt(p * (1 - p) / n);
    const marginOfError = 1.96 * se;
    const lowerBound = p - marginOfError;
    const upperBound = p + marginOfError;
    const phase2Result = {
        phase: 'Phase 2: Sample test',
        sessionCount: 25,
        ...phase2,
        passed: phase2.completedSessions >= 23 && lowerBound >= 0.93, // Lower bound of CI ≥ 93%
        reason: phase2.completedSessions < 23 ? `Only ${phase2.completedSessions}/25 sessions completed` :
            lowerBound < 0.93 ? `95% CI lower bound ${(lowerBound * 100).toFixed(1)}% < 93%` :
                `95% CI: ${(lowerBound * 100).toFixed(1)}% - ${(upperBound * 100).toFixed(1)}%`
    };
    results.push(phase2Result);
    console.log(`[8Q] Phase 2 result: ${phase2Result.passed ? 'PASS' : 'FAIL'} - ${phase2Result.reason || 'All criteria met'}`);
    // Early stop decision
    if (phase2Result.passed && lowerBound >= 0.95) {
        console.log(`[8Q] Early stop: 95% CI lower bound (${(lowerBound * 100).toFixed(1)}%) ≥ 95%. No need for Phase 3.`);
        return results;
    }
    if (!phase2Result.passed) {
        console.log('[8Q] Phase 2 failed. Consider fixing issues before Phase 3, or proceed for tighter confidence bands.');
    }
    // Phase 3: Full evaluation (50 sessions) - only if requested or needed for precision
    console.log('\n[8Q] Starting Phase 3: Full evaluation (50 sessions)...');
    const phase3 = await (0, runBatch_1.runEvaluationBatch)({
        sessionCount: 50,
        baseIdea,
        sessionPrefix: 'phase3-full',
        continueFromLastSession: true
    });
    // Calculate final 95% confidence interval
    const n3 = phase3.completedSessions * 8;
    const p3 = phase3.passRate;
    const se3 = Math.sqrt(p3 * (1 - p3) / n3);
    const marginOfError3 = 1.96 * se3;
    const lowerBound3 = p3 - marginOfError3;
    const upperBound3 = p3 + marginOfError3;
    const phase3Result = {
        phase: 'Phase 3: Full evaluation',
        sessionCount: 50,
        ...phase3,
        passed: phase3.completedSessions >= 47 && phase3.passRate >= 0.95,
        reason: phase3.completedSessions < 47 ? `Only ${phase3.completedSessions}/50 sessions completed` :
            phase3.passRate < 0.95 ? `Pass rate ${(phase3.passRate * 100).toFixed(1)}% < 95%` :
                `95% CI: ${(lowerBound3 * 100).toFixed(1)}% - ${(upperBound3 * 100).toFixed(1)}%`
    };
    results.push(phase3Result);
    console.log(`[8Q] Phase 3 result: ${phase3Result.passed ? 'PASS' : 'FAIL'} - ${phase3Result.reason || 'All criteria met'}`);
    return results;
}
function printFinalReport(results) {
    console.log('\n[8Q] ===== FINAL EVALUATION REPORT =====');
    let totalTokens = 0;
    let totalSessions = 0;
    let totalCompleted = 0;
    results.forEach(result => {
        totalTokens += result.totalTokens;
        totalSessions += result.sessionCount;
        totalCompleted += result.completedSessions;
        console.log(`\n${result.phase}:`);
        console.log(`  Sessions: ${result.completedSessions}/${result.sessionCount} (${((result.completedSessions / result.sessionCount) * 100).toFixed(1)}%)`);
        console.log(`  Pass rate: ${(result.passRate * 100).toFixed(1)}%`);
        console.log(`  Avg latency: ${result.averageLatency.toFixed(0)}ms`);
        console.log(`  Tokens used: ${result.totalTokens.toLocaleString()}`);
        console.log(`  Result: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);
        if (result.reason) {
            console.log(`  Reason: ${result.reason}`);
        }
    });
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total sessions completed: ${totalCompleted}/${totalSessions}`);
    console.log(`Total tokens used: ${totalTokens.toLocaleString()}`);
    console.log(`All phases passed: ${results.every(r => r.passed) ? '✅ YES' : '❌ NO'}`);
    // Estimate cost (using model rates: $1/M input, $2/M output)
    // Rough estimate: ~60% output tokens based on typical patterns
    const estimatedInputTokens = totalTokens * 0.4;
    const estimatedOutputTokens = totalTokens * 0.6;
    const estimatedCost = (estimatedInputTokens / 1000000) * 1 + (estimatedOutputTokens / 1000000) * 2;
    console.log(`Estimated cost: $${estimatedCost.toFixed(2)} (assuming 60% output tokens at ${config_1.EFFECTIVE_CHAT_MODEL} rates)`);
    console.log('=====================================\n');
}
async function main() {
    const baseIdea = process.argv[2] || 'AI copilot for remote creative teams';
    try {
        console.log('[8Q] Starting three-phase evaluation...');
        const results = await runThreePhaseEvaluation(baseIdea);
        printFinalReport(results);
        // Exit with appropriate code
        const allPassed = results.every(r => r.passed);
        process.exit(allPassed ? 0 : 1);
    }
    catch (error) {
        console.error('[8Q] Three-phase evaluation failed:', error);
        process.exit(1);
    }
}
if (require.main === module) {
    main().catch(e => {
        console.error(e);
        process.exit(1);
    });
}
