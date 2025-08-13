import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { QuestionOutput, ConversationState } from '../types';
import { CFG } from '../config';

export interface SessionState {
  sessionId: string;
  seed?: number;
  startTime: number;
  lastSaveTime: number;
  currentQuestion: number;
  totalQuestions: number;
  state: ConversationState;
  completed: boolean;
  questionResults: QuestionResult[];
  telemetry: SessionTelemetry;
}

export interface QuestionResult {
  questionNumber: number;
  questionText: string;
  payload: QuestionOutput;
  score: any;
  metrics: any;
  telemetry: any;
  timestamp: number;
  success: boolean;
}

export interface SessionTelemetry {
  tokensUsed: {
    input: number;
    output: number;
    embedding: number;
  };
  requestCounts: {
    chat: number;
    embedding: number;
  };
  errorCounts: {
    rateLimited: number;
    failed: number;
    repaired: number;
  };
  timing: {
    totalMs: number;
    averageQuestionMs: number;
  };
}

export class SessionManager {
  private basePath: string;
  private manifestPath: string;
  private sessions: Map<string, SessionState> = new Map();

  constructor(basePath: string = './runs') {
    this.basePath = basePath;
    this.manifestPath = join(basePath, 'manifest.json');
    this.ensureDirectoryExists();
    this.loadManifest();
  }

  private ensureDirectoryExists(): void {
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  private loadManifest(): void {
    if (existsSync(this.manifestPath)) {
      try {
        const manifestData = JSON.parse(readFileSync(this.manifestPath, 'utf-8'));
        Object.entries(manifestData.sessions || {}).forEach(([sessionId, sessionData]) => {
          this.sessions.set(sessionId, sessionData as SessionState);
        });
        console.log(`[SessionManager] Loaded ${this.sessions.size} sessions from manifest`);
      } catch (error) {
        console.warn(`[SessionManager] Failed to load manifest:`, error);
      }
    }
  }

  private saveManifest(): void {
    try {
      const manifestData = {
        lastUpdated: new Date().toISOString(),
        sessions: Object.fromEntries(this.sessions.entries())
      };
      writeFileSync(this.manifestPath, JSON.stringify(manifestData, null, 2));
    } catch (error) {
      console.error(`[SessionManager] Failed to save manifest:`, error);
    }
  }

  createSession(sessionId: string, initialState: ConversationState, totalQuestions: number = 8, seed?: number): SessionState {
    const session: SessionState = {
      sessionId,
      seed,
      startTime: Date.now(),
      lastSaveTime: Date.now(),
      currentQuestion: 1,
      totalQuestions,
      state: initialState,
      completed: false,
      questionResults: [],
      telemetry: {
        tokensUsed: { input: 0, output: 0, embedding: 0 },
        requestCounts: { chat: 0, embedding: 0 },
        errorCounts: { rateLimited: 0, failed: 0, repaired: 0 },
        timing: { totalMs: 0, averageQuestionMs: 0 }
      }
    };

    this.sessions.set(sessionId, session);
    this.saveSession(session);
    console.log(`[SessionManager] Created session: ${sessionId}`);
    return session;
  }

  getSession(sessionId: string): SessionState | null {
    return this.sessions.get(sessionId) || null;
  }

  saveQuestionResult(
    sessionId: string, 
    questionNumber: number,
    questionText: string,
    payload: QuestionOutput,
    score: any,
    metrics: any,
    telemetry: any,
    success: boolean,
    newState: ConversationState
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const questionResult: QuestionResult = {
      questionNumber,
      questionText,
      payload,
      score,
      metrics,
      telemetry,
      timestamp: Date.now(),
      success
    };

    session.questionResults.push(questionResult);
    session.state = newState;
    session.currentQuestion = questionNumber + 1;
    session.lastSaveTime = Date.now();

    // Update session telemetry
    if (telemetry.tokensUsed) {
      session.telemetry.tokensUsed.input += telemetry.tokensUsed.input || 0;
      session.telemetry.tokensUsed.output += telemetry.tokensUsed.output || 0;
      session.telemetry.tokensUsed.embedding += telemetry.tokensUsed.embedding || 0;
    }

    if (telemetry.requestCounts) {
      session.telemetry.requestCounts.chat += telemetry.requestCounts.chat || 0;
      session.telemetry.requestCounts.embedding += telemetry.requestCounts.embedding || 0;
    }

    if (telemetry.errorCounts) {
      session.telemetry.errorCounts.rateLimited += telemetry.errorCounts.rateLimited || 0;
      session.telemetry.errorCounts.failed += telemetry.errorCounts.failed || 0;
      session.telemetry.errorCounts.repaired += telemetry.errorCounts.repaired || 0;
    }

    session.telemetry.timing.totalMs = session.lastSaveTime - session.startTime;
    session.telemetry.timing.averageQuestionMs = session.telemetry.timing.totalMs / session.questionResults.length;

    this.saveSession(session);
    console.log(`[SessionManager] Saved Q${questionNumber} for session ${sessionId} (${success ? 'SUCCESS' : 'FAILED'})`);
  }

  markSessionCompleted(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.completed = true;
    session.lastSaveTime = Date.now();
    session.telemetry.timing.totalMs = session.lastSaveTime - session.startTime;
    
    this.saveSession(session);
    console.log(`[SessionManager] Marked session ${sessionId} as completed`);
  }

  private saveSession(session: SessionState): void {
    if (!CFG.SAVE_AFTER_EACH_QUESTION) {
      return;
    }

    try {
      const sessionPath = join(this.basePath, `${session.sessionId}.json`);
      writeFileSync(sessionPath, JSON.stringify(session, null, 2));
      
      // Update manifest
      this.sessions.set(session.sessionId, session);
      this.saveManifest();
    } catch (error) {
      console.error(`[SessionManager] Failed to save session ${session.sessionId}:`, error);
    }
  }

  getIncompleteSession(totalQuestions: number = 8): SessionState | null {
    if (!CFG.RESUME_FROM_CACHE) {
      return null;
    }

    // Find the most recent incomplete session
    let mostRecent: SessionState | null = null;
    
    for (const session of this.sessions.values()) {
      if (!session.completed && session.currentQuestion <= totalQuestions) {
        if (!mostRecent || session.lastSaveTime > mostRecent.lastSaveTime) {
          mostRecent = session;
        }
      }
    }

    if (mostRecent) {
      console.log(`[SessionManager] Found incomplete session: ${mostRecent.sessionId} (Q${mostRecent.currentQuestion}/${totalQuestions})`);
    }

    return mostRecent;
  }

  getAllSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  getCompletedSessions(): SessionState[] {
    return Array.from(this.sessions.values()).filter(s => s.completed);
  }

  getSessionStats(): {
    total: number;
    completed: number;
    incomplete: number;
    passRate: number;
    averageLatency: number;
    totalTokens: number;
  } {
    const all = this.getAllSessions();
    const completed = this.getCompletedSessions();
    
    const successfulQuestions = completed.reduce((sum, session) => 
      sum + session.questionResults.filter(q => q.success).length, 0
    );
    const totalQuestions = completed.reduce((sum, session) => sum + session.questionResults.length, 0);
    
    const totalTokens = all.reduce((sum, session) => 
      sum + session.telemetry.tokensUsed.input + session.telemetry.tokensUsed.output, 0
    );
    
    const averageLatency = completed.length > 0 
      ? completed.reduce((sum, session) => sum + session.telemetry.timing.averageQuestionMs, 0) / completed.length
      : 0;

    return {
      total: all.length,
      completed: completed.length,
      incomplete: all.length - completed.length,
      passRate: totalQuestions > 0 ? successfulQuestions / totalQuestions : 0,
      averageLatency,
      totalTokens
    };
  }

  cleanupOldSessions(maxAge: number = 7 * 24 * 60 * 60 * 1000): number { // 7 days default
    const cutoff = Date.now() - maxAge;
    const toDelete: string[] = [];
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastSaveTime < cutoff) {
        toDelete.push(sessionId);
      }
    }
    
    toDelete.forEach(sessionId => {
      this.sessions.delete(sessionId);
      try {
        const sessionPath = join(this.basePath, `${sessionId}.json`);
        if (existsSync(sessionPath)) {
          // Could implement actual file deletion here
        }
      } catch (error) {
        console.warn(`Failed to cleanup session file ${sessionId}:`, error);
      }
    });
    
    if (toDelete.length > 0) {
      this.saveManifest();
      console.log(`[SessionManager] Cleaned up ${toDelete.length} old sessions`);
    }
    
    return toDelete.length;
  }
}
