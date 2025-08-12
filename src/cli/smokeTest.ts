import { ConversationState } from '../types';
import { summarizeState } from '../state/summarizer';
import { generateQuestionV2 } from '../engine/generateV2';
import { log } from '../util/logger';

// Fast 2-question smoke test to prove green path
const SMOKE_QUESTIONS = [
  'Write your one-sentence idea',
  'Who exactly is this for?'
];

async function smokeTest() {
  console.log('[SMOKE] Starting fast smoke test...');
  const startTime = Date.now();
  
  let state: ConversationState = { 
    idea: 'AI copilot for remote creative teams', 
    answers: [], 
    features: {} 
  };
  
  let allPassed = true;
  
  for (let i = 0; i < SMOKE_QUESTIONS.length; i++) {
    state = await summarizeState(state);
    const qNum = i + 1;
    const qText = SMOKE_QUESTIONS[i];
    
    console.log(`[SMOKE] Q${qNum}: ${qText}`);
    
    try {
      const { payload, score, metrics } = await generateQuestionV2(state, qNum, qText);
      
      console.log(`[SMOKE] Q${qNum} Result: ${metrics.finalSuccess ? 'PASS' : 'FAIL'} (${metrics.candidatesGenerated} candidates, ${metrics.repairAttempts} repairs)`);
      
      if (!metrics.finalSuccess) {
        allPassed = false;
        console.log(`[SMOKE] Q${qNum} Scores:`, score);
      }
      
      // Simulate choosing A for next question
      state.answers.push({ 
        q: qNum, 
        chosen: 'A', 
        summary: payload.options[0].text 
      });
      
    } catch (error) {
      console.error(`[SMOKE] Q${qNum} ERROR:`, error);
      allPassed = false;
      break;
    }
  }
  
  const duration = Date.now() - startTime;
  
  if (allPassed) {
    console.log(`[SMOKE] ✅ SMOKE TEST PASSED in ${duration}ms`);
    process.exit(0);
  } else {
    console.log(`[SMOKE] ❌ SMOKE TEST FAILED in ${duration}ms`);
    process.exit(1);
  }
}

smokeTest().catch(error => {
  console.error('[SMOKE] FATAL ERROR:', error);
  process.exit(1);
});
