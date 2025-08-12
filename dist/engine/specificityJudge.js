"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.judgeSpecificity = judgeSpecificity;
const client_1 = require("../openai/client");
const SPECIFICITY_SYSTEM_PROMPT = `You are evaluating whether business suggestions contain specific, concrete details.

A suggestion is SPECIFIC if it contains any of these:
1. Concrete numbers/quantities/timeframes (e.g., "10-50 people", "15% improvement", "3 months", "2 hours/day")
2. Named tools/platforms/integrations (e.g., "Slack", "Microsoft Teams", "Adobe Creative Cloud", "Google Workspace", "Zoom", "Trello", "Dropbox", "email chains")
3. Specific customer segments (e.g., "freelance designers", "remote marketing teams", "50-person startups")
4. Concrete metrics or measurable outcomes (e.g., "reduce by 20%", "save 3 hours daily")
5. For competitive edges (Q7): Proprietary assets like "exclusive dataset", "private API access", "fine-tuned model", "exclusive partnership", or distribution advantages

Be GENEROUS in your assessment - if there's any concrete detail that makes the suggestion actionable or measurable, mark it as specific.

Examples:
SPECIFIC: "Slack bot for 20-person teams reducing meetings by 30%" (has number + tool + metric)
SPECIFIC: "Integration with Salesforce for enterprise customers" (has named tool + segment)
SPECIFIC: "Remote content creators using Microsoft Teams" (has segment + tool)
SPECIFIC: "Freelance graphic designers using Figma" (has segment + tool)
SPECIFIC: "Zoom meetings and email chains" (has named tools)
SPECIFIC: "Exclusive dataset of 50k creative briefs" (proprietary asset + quantifier)
SPECIFIC: "Private API access with Adobe" (proprietary asset + named partner)
NOT SPECIFIC: "Better collaboration tools for users" (completely vague)
NOT SPECIFIC: "Improve efficiency for teams" (no concrete details)

Respond with a JSON array of booleans, one per suggestion, in order.`;
async function judgeSpecificity(suggestions, questionNumber) {
    // For Q7 (edge), use special handling for proprietary assets
    if (questionNumber === 7) {
        return judgeEdgeSpecificity(suggestions);
    }
    // For Q8 (risks), be more lenient - risks are inherently abstract
    if (questionNumber === 8) {
        return judgeRiskSpecificity(suggestions);
    }
    // For Q6 (alternatives), be very lenient with tool names - almost everything should pass
    if (questionNumber === 6) {
        return judgeAlternativesSpecificity(suggestions);
    }
    const input = suggestions.map((s, i) => `${i + 1}. "${s.text}" - ${s.why}`).join('\n');
    try {
        const response = await client_1.openai.chat.completions.create({
            model: 'gpt-4o-mini', // Cheaper model for this simple task
            messages: [
                { role: 'system', content: SPECIFICITY_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: `Evaluate these suggestions for specificity:\n\n${input}\n\nReturn JSON array of booleans [true/false, true/false, ...]`
                }
            ],
            temperature: 0.1,
            max_tokens: 200
        });
        const content = response.choices[0]?.message?.content?.trim();
        if (!content)
            return specificityFallback(suggestions, questionNumber);
        // Try to parse JSON response
        try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed) && parsed.length === suggestions.length) {
                return parsed.map(Boolean);
            }
        }
        catch {
            // Fallback: look for true/false patterns in response
            const matches = content.match(/true|false/gi);
            if (matches && matches.length === suggestions.length) {
                return matches.map(m => m.toLowerCase() === 'true');
            }
        }
        // Final fallback to regex
        return specificityFallback(suggestions, questionNumber);
    }
    catch (error) {
        console.warn('LLM specificity judge failed, falling back to regex:', error);
        return specificityFallback(suggestions, questionNumber);
    }
}
// Special handling for alternatives questions (Q6) - very lenient
async function judgeAlternativesSpecificity(suggestions) {
    // For Q6 (alternatives), any mention of a tool name should pass
    const altPattern = /\b(slack|teams|figma|trello|asana|notion|jira|salesforce|shopify|google|monday|airtable|zoom|adobe|miro|loom|canva|clickup|basecamp|github|gitlab|bitbucket|dropbox|drive|onedrive|sharepoint|hubspot|mailchimp|stripe|quickbooks|tableau|excel|word|powerpoint|outlook|gmail|calendar|discord|skype|whatsapp|email|video|phone|conference|meetings?|calls?|chains?|threads?|docs?|sheets?|slides?|presentations?|manual|spreadsheet|whiteboard|chat)\b/i;
    return suggestions.map(s => {
        const text = `${s.text} ${s.why ?? ''}`.toLowerCase();
        return altPattern.test(text);
    });
}
// Special handling for edge questions (Q7) - look for proprietary assets
async function judgeEdgeSpecificity(suggestions) {
    // For edges, require concrete edge assets 
    const edgeAssetPattern = /\b(exclusive|proprietary|private|fine-tuned|custom|specialized|closed)\s+(dataset|data|model|integration|partnership|API|access|algorithm|network|beta)|(\d+[kKmM]?\s+(briefs?|projects?|assets?|users?|clients?|workspaces?|installations?))|(\bexclusive\b.*\b(with|via|through)\b.*[A-Z][a-z]+)|(\bprivate\s+API\b)|(\bfine-tuned\s+on\b.*\d+)|(\bclosed\s+beta\b)|(\bpreinstalled\s+on\b.*\d+)|(\bexclusive\s+(partnership|integration|access)\b)|(\bdistribution\s+(lock|advantage|exclusive))|(\bproprietary\s+(algorithm|model|dataset))/i;
    // Also accept numbered assets or named partnerships
    const numberedAsset = /\b\d+[kKmM]?\s+(briefs?|projects?|assets?|clients?|workspaces?|installations?|users?|datasets?|models?)\b/i;
    const namedPartnership = /\b(exclusive|private|special)\s+(partnership|integration|access)\s+(with|via|through)\s+[A-Z][a-z]+/i;
    const distributionEdge = /\b(preinstalled|pre-installed|built-in|native)\s+(on|in|to)\s+\d*[A-Z]/i;
    return suggestions.map(s => {
        const text = `${s.text} ${s.why ?? ''}`;
        return edgeAssetPattern.test(text) || numberedAsset.test(text) || namedPartnership.test(text) || distributionEdge.test(text);
    });
}
// Special handling for risk questions (Q8) - more lenient
async function judgeRiskSpecificity(suggestions) {
    // For risks, accept if it mentions specific technologies, user behaviors, or business metrics
    const riskPattern = /\b(AI|data|privacy|security|user|adoption|integration|API|Teams|microsoft|training|model|briefs?|accuracy|trust|engagement|quality|efficiency|revenue|cost|team|resistance|change|tool|platform)\b/i;
    return suggestions.map(s => {
        const text = `${s.text} ${s.why ?? ''}`.toLowerCase();
        return riskPattern.test(text);
    });
}
// Expanded regex fallback with better patterns
function specificityFallback(suggestions, questionNumber) {
    // For Q7, use edge specificity fallback
    if (questionNumber === 7) {
        const edgePattern = /\b(exclusive|proprietary|private|fine-tuned|custom|specialized|closed)\s+(dataset|data|model|integration|partnership|API|access|beta)|(\d+[kKmM]?\s+(briefs?|projects?|assets?|users?|clients?|datasets?|models?))|(\bexclusive\b.*\b(with|via|through)\b.*[A-Z][a-z]+)|(\bprivate\s+API\b)|(\bfine-tuned\s+on\b.*\d+)|(\bdistribution\s+(lock|advantage|exclusive))|(\bpreinstalled\s+on\b.*\d+)/i;
        return suggestions.map(s => {
            const text = `${s.text} ${s.why ?? ''}`;
            return edgePattern.test(text);
        });
    }
    const numberPattern = /\b\d+(\s?[-–]\s?\d+)?\s?(%|percent|p|people|persons|person|staff|employees|users?|teams?|companies|businesses|days?|weeks?|months?|years?|minutes?|mins?|hrs?|hours?|seconds?|\/week|\/month|\/day|weekly|monthly|daily)\b/i;
    const toolPattern = /\b(slack|microsoft\s*teams?|ms\s*teams?|teams|figma|trello|asana|notion|jira|salesforce|shopify|google\s*workspace|google\s*sheets?|google\s*docs|monday\.com|airtable|zoom|adobe|adobe\s*creative\s*suite|adobe\s*creative\s*cloud|miro|loom|canva|clickup|basecamp|github|gitlab|bitbucket|dropbox|google\s*drive|onedrive|sharepoint|hubspot|mailchimp|stripe|quickbooks|tableau|power\s*bi|excel|word|powerpoint|outlook|gmail|calendar|drive|discord|skype|whatsapp|email\s*chains|email\s*threads|video\s*calls?|phone\s*calls?|conference\s*calls?|meetings?|monday|miro|calendly|calendars?|docs?|sheets?|slides?|presentations?)\b/i;
    const metricPattern = /\b(reduce|increase|improve|boost|enhance|decrease|save|gain)\s+(by\s+)?\d+\s?%/i;
    const timePattern = /\b(within|in|over|after|before)\s+\d+\s+(days?|weeks?|months?|years?|hours?|minutes?)/i;
    const sizePattern = /\b(small|medium|large|enterprise|startup|freelance|solo|remote)\b.*?\b(teams?|companies|businesses|organizations)\b/i;
    return suggestions.map(s => {
        const text = `${s.text} ${s.why ?? ''}`.toLowerCase();
        const hasNumber = numberPattern.test(text);
        const hasTool = toolPattern.test(text);
        const hasMetric = metricPattern.test(text);
        const hasTime = timePattern.test(text);
        const hasSize = sizePattern.test(text);
        // Be more lenient - any of these counts as specific
        return hasNumber || hasTool || hasMetric || hasTime || hasSize;
    });
}
