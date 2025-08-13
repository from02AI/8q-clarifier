import { ConversationState, QuestionOutput } from '../types';
import { generateQuestionV2 } from './generateV2';
import { summarizeState } from '../state/summarizer';

interface ProductionTelemetry {
  bestRel: number;
  relativeFloorUsed: number;
  absFloorUsed: number;
  selectedRel: number[];
  spec: boolean[];
  maxPairCos: number;
  repaired: boolean;
  batchFillerUsed: boolean;
  templateUsed: boolean;
  finalPass: boolean;
  qLatencyMs: number;
}

interface ProductionResult {
  options: any[];
  fillerUsed: boolean;
  templateUsed: boolean;
  telemetry: ProductionTelemetry;
  success: boolean;
}

interface CircuitBreakerState {
  templateUsageHistory: boolean[];
  maxHistorySize: number;
  warningThreshold: number;
}

class ProductionClarifier {
  private circuitBreaker: CircuitBreakerState = {
    templateUsageHistory: [],
    maxHistorySize: 100,
    warningThreshold: 0.10 // 10%
  };

  async generateQuestion(
    state: ConversationState,
    questionNumber: number,
    questionText: string
  ): Promise<ProductionResult> {
    try {
      // Ensure state is summarized
      const summarizedState = await summarizeState(state);
      
      // Generate question with full telemetry
      const { payload, score, repaired, metrics, telemetry } = await generateQuestionV2(
        summarizedState,
        questionNumber,
        questionText
      );

      // Update circuit breaker state
      this.updateCircuitBreaker(telemetry.templateUsed);

      // Check circuit breaker
      this.checkCircuitBreaker();

      const result: ProductionResult = {
        options: payload.options,
        fillerUsed: telemetry.batchFillerUsed,
        templateUsed: telemetry.templateUsed,
        telemetry,
        success: telemetry.finalPass
      };

      return result;
    } catch (error) {
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

  private updateCircuitBreaker(templateUsed: boolean): void {
    this.circuitBreaker.templateUsageHistory.push(templateUsed);
    
    // Keep only the last N entries
    if (this.circuitBreaker.templateUsageHistory.length > this.circuitBreaker.maxHistorySize) {
      this.circuitBreaker.templateUsageHistory.shift();
    }
  }

  private checkCircuitBreaker(): void {
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

  getCircuitBreakerStatus(): {
    templateUsageRate: number;
    samplesCount: number;
    isHealthy: boolean;
  } {
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

  resetCircuitBreaker(): void {
    this.circuitBreaker.templateUsageHistory = [];
    console.log('[PRODUCTION] Circuit breaker reset');
  }
}

// Export singleton instance for production use
export const productionClarifier = new ProductionClarifier();

// Export class for testing or multiple instances
export { ProductionClarifier, ProductionResult, ProductionTelemetry };
