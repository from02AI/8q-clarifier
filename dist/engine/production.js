"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductionClarifier = exports.productionClarifier = void 0;
const generateV2_1 = require("./generateV2");
const summarizer_1 = require("../state/summarizer");
class ProductionClarifier {
    constructor() {
        this.circuitBreaker = {
            templateUsageHistory: [],
            maxHistorySize: 100,
            warningThreshold: 0.10 // 10%
        };
    }
    async generateQuestion(state, questionNumber, questionText) {
        try {
            // Ensure state is summarized
            const summarizedState = await (0, summarizer_1.summarizeState)(state);
            // Generate question with full telemetry
            const { payload, score, repaired, metrics, telemetry } = await (0, generateV2_1.generateQuestionV2)(summarizedState, questionNumber, questionText);
            // Update circuit breaker state
            this.updateCircuitBreaker(telemetry.templateUsed);
            // Check circuit breaker
            this.checkCircuitBreaker();
            const result = {
                options: payload.options,
                fillerUsed: telemetry.batchFillerUsed,
                templateUsed: telemetry.templateUsed,
                telemetry,
                success: telemetry.finalPass
            };
            return result;
        }
        catch (error) {
            console.error(`[PRODUCTION] Error generating Q${questionNumber}:`, error);
            // Return failure result with minimal telemetry
            return {
                options: [],
                fillerUsed: false,
                templateUsed: false,
                telemetry: {
                    bestRel: 0,
                    relativeFloorUsed: 0.45,
                    absFloorUsed: 0.45,
                    selectedRel: [0, 0, 0],
                    spec: [false, false, false],
                    maxPairCos: 1.0,
                    repaired: false,
                    batchFillerUsed: false,
                    templateUsed: false,
                    finalPass: false,
                    qLatencyMs: 0
                },
                success: false
            };
        }
    }
    updateCircuitBreaker(templateUsed) {
        this.circuitBreaker.templateUsageHistory.push(templateUsed);
        // Keep only the last N entries
        if (this.circuitBreaker.templateUsageHistory.length > this.circuitBreaker.maxHistorySize) {
            this.circuitBreaker.templateUsageHistory.shift();
        }
    }
    checkCircuitBreaker() {
        const history = this.circuitBreaker.templateUsageHistory;
        if (history.length < 10) {
            return; // Not enough data
        }
        const templateUsageRate = history.filter(used => used).length / history.length;
        if (templateUsageRate > this.circuitBreaker.warningThreshold) {
            console.warn(`[PRODUCTION CIRCUIT BREAKER] Template usage rate: ${(templateUsageRate * 100).toFixed(1)}% over last ${history.length} questions (threshold: ${(this.circuitBreaker.warningThreshold * 100).toFixed(1)}%)`);
            console.warn('[PRODUCTION CIRCUIT BREAKER] Possible model drift or configuration issue detected');
            // Could add additional actions here:
            // - Send alerts
            // - Switch to backup model
            // - Throttle requests
            // - etc.
        }
    }
    getCircuitBreakerStatus() {
        const history = this.circuitBreaker.templateUsageHistory;
        const templateUsageRate = history.length > 0
            ? history.filter(used => used).length / history.length
            : 0;
        return {
            templateUsageRate,
            samplesCount: history.length,
            isHealthy: templateUsageRate <= this.circuitBreaker.warningThreshold
        };
    }
    resetCircuitBreaker() {
        this.circuitBreaker.templateUsageHistory = [];
        console.log('[PRODUCTION] Circuit breaker reset');
    }
}
exports.ProductionClarifier = ProductionClarifier;
// Export singleton instance for production use
exports.productionClarifier = new ProductionClarifier();
