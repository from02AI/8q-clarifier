"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const production_1 = require("../engine/production");
async function testProductionInterface() {
    console.log('\n[TEST] Testing production interface...');
    const state = {
        idea: 'AI copilot for remote creative teams',
        answers: [],
        features: {}
    };
    try {
        const result = await production_1.productionClarifier.generateQuestion(state, 1, 'Write your one-sentence idea');
        console.log(`Success: ${result.success}`);
        console.log(`Options: ${result.options.length}`);
        console.log(`Filler used: ${result.fillerUsed}`);
        console.log(`Template used: ${result.templateUsed}`);
        console.log(`Latency: ${result.telemetry.qLatencyMs}ms`);
        // Test circuit breaker status
        const status = production_1.productionClarifier.getCircuitBreakerStatus();
        console.log(`Circuit breaker: ${status.isHealthy ? 'HEALTHY' : 'WARNING'} (${status.samplesCount} samples)`);
        console.log('\n[TEST] Production interface test completed successfully');
    }
    catch (error) {
        console.error('[TEST] Production interface test failed:', error);
        process.exit(1);
    }
}
if (require.main === module) {
    testProductionInterface();
}
