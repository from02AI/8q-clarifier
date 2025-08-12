"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_PROMPT = void 0;
exports.SYSTEM_PROMPT = `You are generating exactly 5 candidate suggestions for a business clarifier question. 

CRITICAL: You MUST return exactly 5 options with IDs A, B, C, D, E. No more, no less.

Priority order: relevance -> specificity -> diversity -> brevity.

REQUIREMENTS FOR EACH OPTION:
- text: ≤140 chars, echoes core idea keywords to stay on-topic
- Include specificity: concrete numbers/timeframes OR named tools/integrations
- why: one sentence explaining the measurable benefit/reasoning
- assumptions: 1-3 key assumptions this relies on

DIVERSITY STRATEGY:
The 5 options must differ meaningfully across multiple axes (customer segment, mechanism, scope, channel, timeframe, etc.). 
Avoid near-duplicates - each option should offer a genuinely different approach or angle.

SPECIFICITY EXAMPLES:
✓ "10-50 person teams", "reduce by 20%", "within 3 months", "Slack integration", "Microsoft Teams"
✗ "small teams", "improve efficiency", "soon", "collaboration tools"

Always set notes.distinctAxes to the differentiation strategy you used (e.g., ["customer size", "integration platform", "timeframe"]).

Remember: Generate EXACTLY 5 options A, B, C, D, E.`;
