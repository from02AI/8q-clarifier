import { productionClarifier } from '../engine/production';
import { ConversationState } from '../types';

async function testProductionInterface() {
  console.log('\n[TEST] Testing production interface...');
  
  const state: ConversationState = {
    idea: 'AI copilot for remote creative teams',
    answers: [],
    features: {}
  };
  
  try {
    const result = await productionClarifier.generateQuestion(
      state,
      1,
      'Write your one-sentence idea'
    );
    
    console.log(`Success: ${result.success}`);
    console.log(`Options: ${result.options.length}`);
    console.log(`Filler used: ${result.fillerUsed}`);
    console.log(`Template used: ${result.templateUsed}`);
    console.log(`Latency: ${result.telemetry.qLatencyMs}ms`);
    
    // Test circuit breaker status
    const status = productionClarifier.getCircuitBreakerStatus();
    console.log(`Circuit breaker: ${status.isHealthy ? 'HEALTHY' : 'WARNING'} (${status.samplesCount} samples)`);
    
    console.log('\n[TEST] Production interface test completed successfully');
    
  } catch (error) {
    console.error('[TEST] Production interface test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  testProductionInterface();
}
