export const SYSTEM_PROMPT = `You are generating exactly 5 candidate suggestions for a business clarifier question. 

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

// Question-specific prompt patches for enhanced pass rates
export const QUESTION_PROMPTS: Record<number, string> = {
  1: `Produce exactly 3 distinct options labeled A:, B:, C:.

Format: {Tool/Integration} for {team size}-{team type} using {primary platform}. — WHY: {numeric impact}

Examples of tools/platforms: Slack, Teams, Trello, Asana, Figma, Miro, Google Workspace.

Must include:
- A team size range (e.g., "10–50p").
- A named platform/tool.
- A numeric outcome in the WHY (%, count, or time).

Keep the sentence ≤ 16 words before — WHY:; keep WHY ≤ 12 words.

Distinctness: vary platform OR team type OR metric across options. Do not repeat the same platform twice.

Don't use quotes or extra sentences; no claims of partnerships.`,

  2: `Produce exactly 3 distinct options labeled A:, B:, C:.

Format: {size}p {function} teams using {primary platform} in {context}

Example: "20–40p remote marketing teams using Slack in weekly campaign sprints."

Must include:
- Team size (e.g., "10–30p").
- A named platform/tool.
- A specific context (e.g., "global time zones", "launch weeks", "client review cycles").

Distinctness: each option must change at least two of: size band, function, platform, or context.

No fluff, no benefits language here — this is a pure targeting statement.`,

  7: `Produce exactly 3 options labeled A:, B:, C:.

Each option must be one of these three edge archetypes (use each exactly once):

Data moat: name a dataset with size (e.g., "200k creative briefs") and provenance (where it comes from).

Distribution advantage: name a channel (e.g., Slack App Directory, Trello Power-Ups) and include a count (e.g., "preinstalled on 500 workspaces" or "featured marketplace slot").

Workflow/IP: name a taxonomy/model/training asset tied to creative work (e.g., "task taxonomy of 800 patterns", "model fine-tuned on 10k creative projects").

Must include a WHY clause that states the mechanism of advantage (e.g., "WHY: raises suggestion precision by 18%").

Forbidden: unverifiable language like "exclusive partnership" unless you name the partner and include a distribution or asset count. Avoid vague "unique algorithm" claims with no numbers.`,

  8: `Produce exactly 3 one-line risks labeled A:, B:, C:.

Each risk must be caused by the solution and include:
- A mechanism (e.g., "model misreads Slack threads").
- A platform or process touchpoint (Slack, Asana, Teams, etc.).
- A numeric impact (%, rework rate, downtime).

Examples (style):
"Model misreads Slack threads → 20% rework in creative briefs."
"Asana sync conflicts cause 25% drop in on-time tasks."
"Peak-load inference latency adds 15% meeting overrun."

No generalities like "competition" unless you quantify a concrete impact (budget diversion %, adoption hit %, etc.).`
};

// Q7-specific instructions for edge asset specificity
export const Q7_EDGE_ASSET_EXAMPLES = `For Q7 (hard-to-copy edge), each option MUST state a concrete edge asset: quantified dataset (e.g., "50k briefs"), named exclusive partner (e.g., "Slack partnership"), distribution lock-in (e.g., "preinstalled on 1,000 client Teams workspaces"), or model advantage (e.g., "fine-tuned on 10k domain-specific projects"). Each option MUST include a number or named partner. EXAMPLES: "Proprietary dataset of 50k creative briefs", "Exclusive partnership with Slack", "Preinstalled on 1,000 agencies", "Fine-tuned model on 10k projects".`;
