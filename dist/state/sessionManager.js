"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const config_1 = require("../config");
class SessionManager {
    constructor(basePath = './runs') {
        this.sessions = new Map();
        this.basePath = basePath;
        this.manifestPath = (0, path_1.join)(basePath, 'manifest.json');
        this.ensureDirectoryExists();
        this.loadManifest();
    }
    ensureDirectoryExists() {
        if (!(0, fs_1.existsSync)(this.basePath)) {
            (0, fs_1.mkdirSync)(this.basePath, { recursive: true });
        }
    }
    loadManifest() {
        if ((0, fs_1.existsSync)(this.manifestPath)) {
            try {
                const manifestData = JSON.parse((0, fs_1.readFileSync)(this.manifestPath, 'utf-8'));
                Object.entries(manifestData.sessions || {}).forEach(([sessionId, sessionData]) => {
                    this.sessions.set(sessionId, sessionData);
                });
                console.log(`[SessionManager] Loaded ${this.sessions.size} sessions from manifest`);
            }
            catch (error) {
                console.warn(`[SessionManager] Failed to load manifest:`, error);
            }
        }
    }
    saveManifest() {
        try {
            const manifestData = {
                lastUpdated: new Date().toISOString(),
                sessions: Object.fromEntries(this.sessions.entries())
            };
            (0, fs_1.writeFileSync)(this.manifestPath, JSON.stringify(manifestData, null, 2));
        }
        catch (error) {
            console.error(`[SessionManager] Failed to save manifest:`, error);
        }
    }
    createSession(sessionId, initialState, totalQuestions = 8, seed) {
        const session = {
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
    getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }
    saveQuestionResult(sessionId, questionNumber, questionText, payload, score, metrics, telemetry, success, newState) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        const questionResult = {
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
    markSessionCompleted(sessionId) {
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
    saveSession(session) {
        if (!config_1.CFG.SAVE_AFTER_EACH_QUESTION) {
            return;
        }
        try {
            const sessionPath = (0, path_1.join)(this.basePath, `${session.sessionId}.json`);
            (0, fs_1.writeFileSync)(sessionPath, JSON.stringify(session, null, 2));
            // Update manifest
            this.sessions.set(session.sessionId, session);
            this.saveManifest();
        }
        catch (error) {
            console.error(`[SessionManager] Failed to save session ${session.sessionId}:`, error);
        }
    }
    getIncompleteSession(totalQuestions = 8) {
        if (!config_1.CFG.RESUME_FROM_CACHE) {
            return null;
        }
        // Find the most recent incomplete session
        let mostRecent = null;
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
    getAllSessions() {
        return Array.from(this.sessions.values());
    }
    getCompletedSessions() {
        return Array.from(this.sessions.values()).filter(s => s.completed);
    }
    getSessionStats() {
        const all = this.getAllSessions();
        const completed = this.getCompletedSessions();
        const successfulQuestions = completed.reduce((sum, session) => sum + session.questionResults.filter(q => q.success).length, 0);
        const totalQuestions = completed.reduce((sum, session) => sum + session.questionResults.length, 0);
        const totalTokens = all.reduce((sum, session) => sum + session.telemetry.tokensUsed.input + session.telemetry.tokensUsed.output, 0);
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
    cleanupOldSessions(maxAge = 7 * 24 * 60 * 60 * 1000) {
        const cutoff = Date.now() - maxAge;
        const toDelete = [];
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.lastSaveTime < cutoff) {
                toDelete.push(sessionId);
            }
        }
        toDelete.forEach(sessionId => {
            this.sessions.delete(sessionId);
            try {
                const sessionPath = (0, path_1.join)(this.basePath, `${sessionId}.json`);
                if ((0, fs_1.existsSync)(sessionPath)) {
                    // Could implement actual file deletion here
                }
            }
            catch (error) {
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
exports.SessionManager = SessionManager;
