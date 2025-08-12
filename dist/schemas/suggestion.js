"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuestionOutputSchema = exports.SuggestionSchema = void 0;
const zod_1 = require("zod");
exports.SuggestionSchema = zod_1.z.object({
    id: zod_1.z.enum(['A', 'B', 'C', 'D', 'E']),
    text: zod_1.z.string().min(8).max(140),
    why: zod_1.z.string().min(8).max(200),
    assumptions: zod_1.z.array(zod_1.z.string()).min(1).max(3),
    tags: zod_1.z.array(zod_1.z.string()).optional().default([])
});
exports.QuestionOutputSchema = zod_1.z.object({
    questionNumber: zod_1.z.number().int().min(1).max(8),
    notes: zod_1.z.object({
        distinctAxes: zod_1.z.array(zod_1.z.string()).min(2),
        differentiationStrategy: zod_1.z.string().optional()
    }),
    options: zod_1.z.array(exports.SuggestionSchema).min(3).max(5) // Allow 3-5 options for flexibility
});
