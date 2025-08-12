import { z } from 'zod';

export const SuggestionSchema = z.object({
  id: z.enum(['A','B','C','D','E']),
  text: z.string().min(8).max(140),
  why: z.string().min(8).max(200),
  assumptions: z.array(z.string()).min(1).max(3),
  tags: z.array(z.string()).optional().default([])
});

export const QuestionOutputSchema = z.object({
  questionNumber: z.number().int().min(1).max(8),
  notes: z.object({ 
    distinctAxes: z.array(z.string()).min(2),
    differentiationStrategy: z.string().optional()
  }),
  options: z.array(SuggestionSchema).min(3).max(5) // Allow 3-5 options for flexibility
});

export type Suggestion = z.infer<typeof SuggestionSchema>;
export type QuestionOutput = z.infer<typeof QuestionOutputSchema>;
