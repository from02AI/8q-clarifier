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
exports.runFinalEvaluation = runFinalEvaluation;
const summarizer_1 = require("../state/summarizer");
const generateV2_1 = require("../engine/generateV2");
const fileCache_1 = require("../util/fileCache");
const config_1 = require("../config");
const fs = __importStar(require("fs"));
const QUESTIONS = [
    'Write your one-sentence idea',
    'Who exactly is this for?',
    'What problem are they facing?',
    'How does your idea solve the problem?',
    'How will you measure success?',
    'Who / what do they use instead?',
    'What\'s your hard-to-copy edge?',
    'Biggest unknown risk in one line'
];
const IDEAS = [
    'AI copilot for remote creative teams',
    'Smart scheduling assistant for freelancers',
    'Automated code review tool with AI suggestions',
    'Voice-to-text meeting notes with action items',
    'AI-powered email prioritization for executives',
    'Smart inventory management for small retailers',
    'Personalized learning paths for corporate training',
    'AI design feedback tool for UI/UX teams',
    'Automated social media content calendar',
    'Smart expense tracking for distributed teams'
];
async function runFinalEvaluation() {
    console.log('\n[8Q EVAL] Starting final evaluation: 10 seeds × 5 trials (50 sessions)');
    console.log(`[8Q EVAL] Model: ${config_1.EFFECTIVE_CHAT_MODEL}, Embeddings: ${config_1.EFFECTIVE_EMBED_MODEL}`);
    console.log(`[8Q EVAL] Production mode: ${config_1.CFG.PRODUCTION_MODE ? 'ENABLED' : 'DISABLED'}`);
    (0, fileCache_1.ensureDir)('./runs');
    const allTelemetry = [];
    const allOptions = [];
    const failedSessions = [];
    let sessionCount = 0;
    const startTime = Date.now();
    // Run 10 seeds × 5 trials = 50 sessions
    for (let seed = 0; seed < 10; seed++) {
        for (let trial = 0; trial < 5; trial++) {
            sessionCount++;
            console.log(`\n[8Q EVAL] === Session ${sessionCount}/50 (seed=${seed}, trial=${trial}) ===`);
            const idea = IDEAS[seed % IDEAS.length];
            let state = { idea, answers: [], features: {} };
            const failedQuestions = [];
            for (let i = 0; i < QUESTIONS.length; i++) {
                state = await (0, summarizer_1.summarizeState)(state);
                const qNum = i + 1;
                const qText = QUESTIONS[i];
                const qStartTime = Date.now();
                try {
                    const { payload, score, repaired, metrics } = await (0, generateV2_1.generateQuestionV2)(state, qNum, qText);
                    const qLatencyMs = Date.now() - qStartTime;
                    // Extract telemetry data
                    const telemetry = {
                        questionNumber: qNum,
                        seed,
                        trial,
                        bestRel: Math.max(...score.rel),
                        relativeFloorUsed: Math.max(...score.rel) * 0.9, // This is how we calculate it in generateV2
                        absFloorUsed: config_1.CFG.RELEVANCE_THRESH,
                        selectedRel: score.rel,
                        spec: score.spec,
                        maxPairCos: score.maxPairCos,
                        repaired,
                        batchFillerUsed: false, // TODO: Extract from generateV2 if we add this flag
                        templateUsed: false, // TODO: Extract from generateV2 if we add this flag
                        finalPass: score.pass,
                        qLatencyMs,
                        failureReasons: score.pass ? undefined : extractFailureReasons(score)
                    };
                    allTelemetry.push(telemetry);
                    // Record options
                    payload.options.forEach((option, optIndex) => {
                        allOptions.push({
                            seed,
                            trial,
                            questionNumber: qNum,
                            optionId: option.id,
                            text: option.text,
                            why: option.why,
                            relevance: score.rel[optIndex],
                            specificity: score.spec[optIndex],
                            finalSelected: true
                        });
                    });
                    if (!score.pass) {
                        failedQuestions.push(qNum);
                    }
                    // Simulate user choosing A
                    state.answers.push({ q: qNum, chosen: 'A', summary: payload.options[0].text });
                    console.log(`Q${qNum}: ${score.pass ? 'PASS' : 'FAIL'} (${qLatencyMs}ms)`);
                }
                catch (error) {
                    console.error(`Q${qNum} ERROR:`, error);
                    failedQuestions.push(qNum);
                    const qLatencyMs = Date.now() - qStartTime;
                    allTelemetry.push({
                        questionNumber: qNum,
                        seed,
                        trial,
                        bestRel: 0,
                        relativeFloorUsed: config_1.CFG.RELEVANCE_THRESH,
                        absFloorUsed: config_1.CFG.RELEVANCE_THRESH,
                        selectedRel: [0, 0, 0],
                        spec: [false, false, false],
                        maxPairCos: 1.0,
                        repaired: false,
                        batchFillerUsed: false,
                        templateUsed: false,
                        finalPass: false,
                        qLatencyMs,
                        failureReasons: ['generation_error']
                    });
                }
            }
            if (failedQuestions.length > 0) {
                failedSessions.push({ seed, trial, failedQuestions });
            }
            console.log(`Session ${sessionCount}: ${8 - failedQuestions.length}/8 questions passed`);
        }
    }
    // Calculate summary statistics
    const totalQuestions = allTelemetry.length;
    const passedQuestions = allTelemetry.filter(t => t.finalPass).length;
    const overallPassRate = passedQuestions / totalQuestions;
    // Per-question pass rates
    const questionPassRates = {};
    for (let qNum = 1; qNum <= 8; qNum++) {
        const qTelemetry = allTelemetry.filter(t => t.questionNumber === qNum);
        const qPassed = qTelemetry.filter(t => t.finalPass).length;
        questionPassRates[qNum] = qPassed / qTelemetry.length;
    }
    // Latency statistics
    const latencies = allTelemetry.map(t => t.qLatencyMs).sort((a, b) => a - b);
    const p95LatencyMs = latencies[Math.floor(latencies.length * 0.95)];
    const avgLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    // Usage rates
    const fillerUsageRate = allTelemetry.filter(t => t.batchFillerUsed).length / totalQuestions;
    const templateUsageRate = allTelemetry.filter(t => t.templateUsed).length / totalQuestions;
    const repairUsageRate = allTelemetry.filter(t => t.repaired).length / totalQuestions;
    // SLO violations
    const sloViolations = {
        latency: p95LatencyMs > 20000, // 20s per question
        passRate: overallPassRate < 0.95, // 95% overall
        questionPassRates: Object.entries(questionPassRates)
            .filter(([_, rate]) => rate < 0.92) // 92% per question
            .map(([qNum, _]) => parseInt(qNum))
    };
    const runSummary = {
        timestamp: new Date().toISOString(),
        modelName: config_1.EFFECTIVE_CHAT_MODEL,
        embeddingModel: config_1.EFFECTIVE_EMBED_MODEL,
        temperature: 0.7, // From generateV2.ts
        config: config_1.CFG,
        totalSessions: 50,
        totalQuestions,
        overallPassRate,
        questionPassRates,
        fillerUsageRate,
        templateUsageRate,
        p95LatencyMs,
        avgLatencyMs,
        repairUsageRate,
        failedSessions,
        thresholdViolations: allTelemetry.filter(t => t.selectedRel.some(rel => rel < t.absFloorUsed && rel < t.relativeFloorUsed)).length,
        sloViolations
    };
    // Save all results
    (0, fileCache_1.saveJSON)('./runs', 'summary', runSummary);
    // Save telemetry as JSONL
    const telemetryPath = './runs/telemetry.jsonl';
    const telemetryLines = allTelemetry.map(t => JSON.stringify(t)).join('\n');
    fs.writeFileSync(telemetryPath, telemetryLines);
    // Save options as CSV
    const optionsCsvPath = './runs/options.csv';
    const optionsHeader = 'seed,trial,questionNumber,optionId,text,why,relevance,specificity,finalSelected\n';
    const optionsRows = allOptions.map(o => `${o.seed},${o.trial},${o.questionNumber},"${o.optionId}","${o.text.replace(/"/g, '""')}","${o.why.replace(/"/g, '""')}",${o.relevance},${o.specificity},${o.finalSelected}`).join('\n');
    fs.writeFileSync(optionsCsvPath, optionsHeader + optionsRows);
    // Save question summary as CSV
    const questionsCsvPath = './runs/questions.csv';
    const questionsHeader = 'questionNumber,totalAttempts,passed,passRate,avgLatencyMs,p95LatencyMs,fillerUsage,templateUsage,repairUsage\n';
    const questionsRows = [];
    for (let qNum = 1; qNum <= 8; qNum++) {
        const qTelemetry = allTelemetry.filter(t => t.questionNumber === qNum);
        const qPassed = qTelemetry.filter(t => t.finalPass).length;
        const qLatencies = qTelemetry.map(t => t.qLatencyMs).sort((a, b) => a - b);
        const qAvgLatency = qLatencies.reduce((a, b) => a + b, 0) / qLatencies.length;
        const qP95Latency = qLatencies[Math.floor(qLatencies.length * 0.95)];
        const qFillerUsage = qTelemetry.filter(t => t.batchFillerUsed).length / qTelemetry.length;
        const qTemplateUsage = qTelemetry.filter(t => t.templateUsed).length / qTelemetry.length;
        const qRepairUsage = qTelemetry.filter(t => t.repaired).length / qTelemetry.length;
        questionsRows.push(`${qNum},${qTelemetry.length},${qPassed},${(qPassed / qTelemetry.length).toFixed(4)},${qAvgLatency.toFixed(0)},${qP95Latency.toFixed(0)},${qFillerUsage.toFixed(4)},${qTemplateUsage.toFixed(4)},${qRepairUsage.toFixed(4)}`);
    }
    fs.writeFileSync(questionsCsvPath, questionsHeader + questionsRows.join('\n'));
    // Print summary
    const duration = Date.now() - startTime;
    console.log('\n[8Q EVAL] === FINAL EVALUATION SUMMARY ===');
    console.log(`Runtime: ${(duration / 1000 / 60).toFixed(1)} minutes`);
    console.log(`Overall pass rate: ${(overallPassRate * 100).toFixed(1)}% (target: ≥95%)`);
    console.log(`P95 latency: ${(p95LatencyMs / 1000).toFixed(1)}s (target: ≤20s)`);
    console.log(`Filler usage: ${(fillerUsageRate * 100).toFixed(1)}% (target: ≤35%)`);
    console.log(`Template usage: ${(templateUsageRate * 100).toFixed(1)}% (target: ≤5%)`);
    console.log(`\nPer-question pass rates (target: ≥92% each):`);
    for (let qNum = 1; qNum <= 8; qNum++) {
        const rate = questionPassRates[qNum];
        const status = rate >= 0.92 ? '✓' : '✗';
        console.log(`  Q${qNum}: ${(rate * 100).toFixed(1)}% ${status}`);
    }
    // SLO status
    console.log('\n[8Q EVAL] SLO STATUS:');
    console.log(`Latency: ${sloViolations.latency ? '✗ VIOLATION' : '✓ PASS'}`);
    console.log(`Overall pass rate: ${sloViolations.passRate ? '✗ VIOLATION' : '✓ PASS'}`);
    console.log(`Question pass rates: ${sloViolations.questionPassRates.length > 0 ? `✗ VIOLATIONS on Q${sloViolations.questionPassRates.join(', Q')}` : '✓ PASS'}`);
    if (sloViolations.latency || sloViolations.passRate || sloViolations.questionPassRates.length > 0) {
        console.log('\n❌ EVALUATION FAILED - SLO violations detected');
        process.exit(1);
    }
    else {
        console.log('\n✅ EVALUATION PASSED - All SLOs met');
    }
    console.log(`\nResults saved to ./runs/`);
}
function extractFailureReasons(score) {
    const reasons = [];
    // Check relevance failures
    score.rel.forEach((rel, i) => {
        if (rel < config_1.CFG.RELEVANCE_THRESH) {
            reasons.push(`option_${['A', 'B', 'C'][i]}_relevance_low`);
        }
    });
    // Check specificity failures
    score.spec.forEach((spec, i) => {
        if (!spec) {
            reasons.push(`option_${['A', 'B', 'C'][i]}_specificity_low`);
        }
    });
    // Check distinctness failure
    if (score.maxPairCos > config_1.CFG.DISTINCTNESS_MAX_COS) {
        reasons.push('distinctness_violation');
    }
    return reasons;
}
if (require.main === module) {
    runFinalEvaluation().catch(e => {
        console.error('Evaluation failed:', e);
        process.exit(1);
    });
}
