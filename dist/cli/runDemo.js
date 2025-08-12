"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const summarizer_1 = require("../state/summarizer");
const generateV2_1 = require("../engine/generateV2");
const fileCache_1 = require("../util/fileCache");
const logger_1 = require("../util/logger");
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
async function main() {
    let state = { idea: 'AI copilot for remote creative teams', answers: [], features: {} };
    let totalMetrics = {
        questionsAttempted: 0,
        questionsSuccessful: 0,
        totalCandidatesGenerated: 0,
        totalRepairAttempts: 0,
        averageLatency: 0
    };
    const startTime = Date.now();
    for (let i = 0; i < QUESTIONS.length; i++) {
        state = await (0, summarizer_1.summarizeState)(state);
        const qNum = i + 1;
        const qText = QUESTIONS[i];
        console.log(`\n[8Q] === Q${qNum}: ${qText} ===`);
        const { payload, score, repaired, metrics } = await (0, generateV2_1.generateQuestionV2)(state, qNum, qText);
        // Update aggregate metrics
        totalMetrics.questionsAttempted++;
        if (metrics.finalSuccess)
            totalMetrics.questionsSuccessful++;
        totalMetrics.totalCandidatesGenerated += metrics.candidatesGenerated;
        totalMetrics.totalRepairAttempts += metrics.repairAttempts;
        (0, logger_1.log)(`Q${qNum}`, qText);
        (0, logger_1.log)('Options:', payload.options.map(o => `${o.id}: ${o.text} — WHY: ${o.why}`).join(' || '));
        (0, logger_1.log)('Scores:', score);
        (0, logger_1.log)('Metrics:', {
            candidates: metrics.candidatesGenerated,
            passing: metrics.candidatesPassingThresholds,
            repaired: repaired,
            success: metrics.finalSuccess
        });
        (0, fileCache_1.saveJSON)(`./cache/demo/q${qNum}`, 'payload', payload);
        (0, fileCache_1.saveJSON)(`./cache/demo/q${qNum}`, 'score', score);
        (0, fileCache_1.saveJSON)(`./cache/demo/q${qNum}`, 'metrics', metrics);
        // Simulate user choosing A
        state.answers.push({ q: qNum, chosen: 'A', summary: payload.options[0].text });
    }
    // Final summary
    const totalTime = Date.now() - startTime;
    totalMetrics.averageLatency = totalTime / totalMetrics.questionsAttempted;
    console.log('\n[8Q] === FINAL SUMMARY ===');
    console.log(`Questions successful: ${totalMetrics.questionsSuccessful}/${totalMetrics.questionsAttempted} (${(totalMetrics.questionsSuccessful / totalMetrics.questionsAttempted * 100).toFixed(1)}%)`);
    console.log(`Total candidates generated: ${totalMetrics.totalCandidatesGenerated}`);
    console.log(`Total repair attempts: ${totalMetrics.totalRepairAttempts}`);
    console.log(`Average latency per question: ${totalMetrics.averageLatency.toFixed(0)}ms`);
    console.log(`Total runtime: ${(totalTime / 1000).toFixed(1)}s`);
    (0, fileCache_1.saveJSON)('./cache/demo', 'summary', totalMetrics);
}
main().catch(e => { console.error(e); process.exit(1); });
