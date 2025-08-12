export type SuggestionID = 'A'|'B'|'C'|'D'|'E';
export interface Suggestion {
  id: SuggestionID;
  text: string; // ≤140 chars
  why: string;  // 1 sentence, measurable
  assumptions: string[]; // 1–3
  tags: string[];
}

export interface ScoredSuggestion extends Suggestion {
  relevance: number;
  specificity: boolean;
  selected?: boolean;
  failureReasons?: string[];
}
export interface QuestionOutput {
  questionNumber: number;
  notes: { distinctAxes: string[] };
  options: Suggestion[];
}
export interface AnswerChoice { q: number; chosen: SuggestionID; summary: string }
export interface ConversationState {
  idea: string;
  answers: AnswerChoice[];
  features: Record<string,string>; // compact summary fields
}
