import { ConversationState } from '../types';
import { summarizeState } from '../state/summarizer';
import { generateQuestionV2 } from '../engine/generateV2';
import { saveJSON } from '../util/fileCache';
import { log } from '../util/logger';
import { SessionManager, SessionState } from '../state/sessionManager';
import { CFG } from '../config';

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

interface RunOptions {
  sessionCount?: number;
  baseIdea?: string;
  sessionPrefix?: string;
  continueFromLastSession?: boolean;
}

async function runEvaluationBatch(options: RunOptions = {}): Promise<{
  completedSessions: number;
  passRate: number;
  averageLatency: number;
  totalTokens: number;
  errors: number;
}> {
  const {
    sessionCount = 1,
    baseIdea = 'AI copilot for remote creative teams',
    sessionPrefix = 'eval',
    continueFromLastSession = true
  } = options;

  const sessionManager = new SessionManager('./runs');
  let completedCount = 0;
  let totalQuestions = 0;
  let successfulQuestions = 0;
  
  console.log(`[8Q] === STARTING EVALUATION BATCH ===`);
  console.log(`Target sessions: ${sessionCount}`);
  console.log(`Base idea: "${baseIdea}"`);
  console.log(`Concurrency: ${CFG.MAX_CONCURRENT_SESSIONS}`);
  console.log(`Model: ${CFG.CHAT_MODEL} (cost optimized)`);
  console.log(`Resume enabled: ${CFG.RESUME_FROM_CACHE}`);
  console.log(`Save after each Q: ${CFG.SAVE_AFTER_EACH_QUESTION}`);

  // Check for incomplete session to resume
  let startingSession = 1;
  if (continueFromLastSession && CFG.RESUME_FROM_CACHE) {
    const incompleteSession = sessionManager.getIncompleteSession(QUESTIONS.length);
    if (incompleteSession) {
      console.log(`[8Q] Resuming from session: ${incompleteSession.sessionId} at Q${incompleteSession.currentQuestion}`);
      await continueSession(incompleteSession, sessionManager);
      completedCount++;
      startingSession = extractSessionNumber(incompleteSession.sessionId) + 1;
    }
  }

  // Run remaining sessions
  for (let sessionNum = startingSession; sessionNum <= sessionCount; sessionNum++) {
    const sessionId = `${sessionPrefix}-${sessionNum.toString().padStart(3, '0')}`;
    
    console.log(`\n[8Q] === SESSION ${sessionNum}/${sessionCount}: ${sessionId} ===`);
    
    try {
      await runSingleSession(sessionId, baseIdea, sessionManager);
      completedCount++;
      
      // Log progress
      const stats = sessionManager.getSessionStats();
      console.log(`[8Q] Session ${sessionNum} completed. Progress: ${completedCount}/${sessionCount} (${stats.passRate.toFixed(1)}% pass rate)`);
      
    } catch (error) {
      console.error(`[8Q] Session ${sessionNum} failed:`, error);
      // Continue to next session rather than failing entire batch
    }
    
    // Rate limiting between sessions
    if (sessionNum < sessionCount) {
      console.log(`[8Q] Waiting ${CFG.REQUEST_THROTTLE_MS}ms between sessions...`);
      await new Promise(resolve => setTimeout(resolve, CFG.REQUEST_THROTTLE_MS));
    }
  }

  // Final statistics
  const finalStats = sessionManager.getSessionStats();
  
  console.log(`\n[8Q] === BATCH EVALUATION COMPLETED ===`);
  console.log(`Sessions completed: ${finalStats.completed}/${sessionCount}`);
  console.log(`Overall pass rate: ${(finalStats.passRate * 100).toFixed(1)}%`);
  console.log(`Average latency: ${finalStats.averageLatency.toFixed(0)}ms/question`);
  console.log(`Total tokens used: ${finalStats.totalTokens.toLocaleString()}`);
  console.log(`Incomplete sessions: ${finalStats.incomplete}`);

  return {
    completedSessions: finalStats.completed,
    passRate: finalStats.passRate,
    averageLatency: finalStats.averageLatency,
    totalTokens: finalStats.totalTokens,
    errors: sessionCount - finalStats.completed
  };
}

async function runSingleSession(sessionId: string, baseIdea: string, sessionManager: SessionManager): Promise<void> {
  const initialState: ConversationState = { 
    idea: baseIdea, 
    answers: [], 
    features: {} 
  };
  
  const session = sessionManager.createSession(sessionId, initialState, QUESTIONS.length);
  
  try {
    await continueSession(session, sessionManager);
  } catch (error) {
    console.error(`[8Q] Session ${sessionId} failed:`, error);
    throw error;
  }
}

async function continueSession(session: SessionState, sessionManager: SessionManager): Promise<void> {
  let state = session.state;
  const startQuestion = session.currentQuestion;
  
  for (let i = startQuestion - 1; i < QUESTIONS.length; i++) {
    const qNum = i + 1;
    const qText = QUESTIONS[i];
    
    // Skip if this question was already completed
    if (session.questionResults.some(r => r.questionNumber === qNum && r.success)) {
      console.log(`[8Q] Skipping Q${qNum} (already completed successfully)`);
      continue;
    }
    
    console.log(`\n[8Q] === Q${qNum}: ${qText} ===`);
    
    try {
      state = await summarizeState(state);
      
      const { payload, score, repaired, metrics, telemetry } = await generateQuestionV2(state, qNum, qText);
      
      // Enhanced telemetry with real token tracking from generateV2
      const enhancedTelemetry = {
        ...telemetry,
        errorCounts: {
          rateLimited: 0, // Would be tracked in retry logic if needed
          failed: metrics.finalSuccess ? 0 : 1,
          repaired: repaired ? 1 : 0
        }
      };
      
      log(`Q${qNum}`, qText);
      log('Options:', payload.options.map(o=> `${o.id}: ${o.text} — WHY: ${o.why}`).join(' || '));
      log('Scores:', score);
      log('Metrics:', {
        candidates: metrics.candidatesGenerated,
        passing: metrics.candidatesPassingThresholds,
        repaired: repaired,
        success: metrics.finalSuccess
      });
      
      // Save question-level artifacts 
      saveJSON(`./cache/${session.sessionId}/q${qNum}`, 'payload', payload);
      saveJSON(`./cache/${session.sessionId}/q${qNum}`, 'score', score);
      saveJSON(`./cache/${session.sessionId}/q${qNum}`, 'metrics', metrics);
      
      // Save to session manager
      sessionManager.saveQuestionResult(
        session.sessionId,
        qNum,
        qText,
        payload,
        score,
        metrics,
        enhancedTelemetry,
        metrics.finalSuccess,
        { ...state, answers: [...state.answers, { q: qNum, chosen: 'A', summary: payload.options[0].text }] }
      );
      
      // Update state for next question
      state.answers.push({ q: qNum, chosen: 'A', summary: payload.options[0].text });
      
    } catch (error) {
      console.error(`[8Q] Q${qNum} failed:`, error);
      
      // Save failure telemetry
      const failureTelemetry = {
        qLatencyMs: 0,
        finalPass: false,
        errorCounts: {
          rateLimited: 0,
          failed: 1, 
          repaired: 0
        }
      };
      
      sessionManager.saveQuestionResult(
        session.sessionId,
        qNum,
        qText,
        { questionNumber: qNum, notes: { distinctAxes: [] }, options: [] },
        { pass: false },
        { finalSuccess: false },
        failureTelemetry,
        false,
        state
      );
      
      throw error;
    }
  }
  
  sessionManager.markSessionCompleted(session.sessionId);
  console.log(`[8Q] Session ${session.sessionId} completed successfully`);
}

function extractSessionNumber(sessionId: string): number {
  const match = sessionId.match(/-(\d+)$/);
  return match ? parseInt(match[1]) : 0;
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const sessionCount = args[0] ? parseInt(args[0]) : 1;
  const baseIdea = args[1] || 'AI copilot for remote creative teams';
  
  if (sessionCount < 1 || sessionCount > 100) {
    console.error('Session count must be between 1 and 100');
    process.exit(1);
  }
  
  console.log(`Starting evaluation batch: ${sessionCount} sessions with idea "${baseIdea}"`);
  
  try {
    const results = await runEvaluationBatch({
      sessionCount,
      baseIdea,
      sessionPrefix: 'batch',
      continueFromLastSession: true
    });
    
    console.log('\n[8Q] === FINAL RESULTS ===');
    console.log(JSON.stringify(results, null, 2));
    
    // Exit with non-zero if pass rate is below threshold
    if (results.passRate < 0.95) {
      console.warn(`Pass rate ${(results.passRate * 100).toFixed(1)}% is below 95% threshold`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Batch evaluation failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}

export { runEvaluationBatch, runSingleSession };
