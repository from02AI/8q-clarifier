"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.judgeSpecificityByRules = judgeSpecificityByRules;
exports.validateQuestionSpecificity = validateQuestionSpecificity;
/**
 * Rule-based specificity checking - replaces LLM judge for cost optimization
 * Checks for concrete numbers, named tools, or specific business elements
 */
function judgeSpecificityByRules(options, questionNumber) {
    return options.map(option => checkSpecificity(option.text, questionNumber));
}
function checkSpecificity(text, questionNumber) {
    // Question 7 has special edge asset requirements
    if (questionNumber === 7) {
        return checkEdgeAssetSpecificity(text);
    }
    // For all other questions, check general specificity
    return checkGeneralSpecificity(text);
}
function checkEdgeAssetSpecificity(text) {
    const lowerText = text.toLowerCase();
    // Check for the 3 required archetypes with concrete specifics
    const hasDataMoat = checkDataMoat(text);
    const hasDistribution = checkDistribution(text);
    const hasWorkflowIP = checkWorkflowIP(text);
    // Must match exactly one of the three archetypes
    const archetypeCount = [hasDataMoat, hasDistribution, hasWorkflowIP].filter(Boolean).length;
    // Must also have a number for scale/specificity
    const hasNumber = /\b\d+[k%]?\b/.test(text);
    return archetypeCount >= 1 && hasNumber;
}
function checkDataMoat(text) {
    // Data moat: dataset + size + provenance
    const datasetPatterns = [
        /\b(dataset|data)\s+.*\b\d+[k]?/i,
        /\b\d+[k]?\s*(briefs?|projects?|samples?|examples?|documents?|records?)/i,
        /\bfine-tuned\s+on\s+\d+/i,
        /\btrained\s+on\s+\d+/i,
        /\b(proprietary|exclusive)\s+(dataset|data)/i
    ];
    return datasetPatterns.some(pattern => pattern.test(text));
}
function checkDistribution(text) {
    // Distribution: channel + count
    const distributionPatterns = [
        /\b(featured|preinstalled|installed)\s+(in|on)\s+.*\d+/i,
        /\b(app\s+directory|marketplace|store)/i,
        /\b\d+[k]?\s+(workspaces?|installations?|users?|customers?)/i,
        /\b(slack\s+app\s+directory|teams\s+store|chrome\s+store)/i
    ];
    return distributionPatterns.some(pattern => pattern.test(text));
}
function checkWorkflowIP(text) {
    // Workflow/IP: taxonomy/model/training with counts
    const workflowPatterns = [
        /\b(taxonomy|model|algorithm)\s+.*\b\d+/i,
        /\b\d+[k]?\s+(patterns?|categories?|classifications?)/i,
        /\b(proprietary|custom)\s+(model|algorithm|taxonomy)/i,
        /\b(workflow|process)\s+(optimization|intelligence)/i
    ];
    return workflowPatterns.some(pattern => pattern.test(text));
}
function checkGeneralSpecificity(text) {
    // Check for numbers/percentages/timeframes
    const hasNumbers = checkForNumbers(text);
    // Check for specific tools/platforms
    const hasNamedTools = checkForNamedTools(text);
    // Must have at least one specificity indicator
    return hasNumbers || hasNamedTools;
}
function checkForNumbers(text) {
    const numberPatterns = [
        /\b\d+%/, // Percentages: 25%, 50%
        /\b\d+k\b/i, // Thousands: 100k, 50k
        /\b\d+\s*(minutes?|hours?|days?|weeks?|months?|years?)\b/i, // Time: 3 months, 2 weeks
        /\b\d+\s*(people|users?|teams?|employees?|members?)\b/i, // Count: 50 people, 100 users
        /\b\d+\s*(x|times)\b/i, // Multipliers: 3x faster, 5 times
        /\b\$\d+/, // Money: $100, $50k
        /\b\d+\s*(gb|mb|tb)\b/i, // Data size: 500GB, 2TB
        /\b\d+\.\d+/, // Decimals: 2.5, 10.3
        /\b(double|triple|halve|reduce)\s+(by\s+)?\d+/i, // "reduce by 30%", "double the 50"
    ];
    return numberPatterns.some(pattern => pattern.test(text));
}
function checkForNamedTools(text) {
    const toolPatterns = [
        // Communication platforms
        /\b(slack|teams|discord|zoom|meet|webex)\b/i,
        // Project management
        /\b(asana|trello|monday\.com|notion|airtable|jira|linear|clickup|basecamp)\b/i,
        // Design/creative tools
        /\b(figma|sketch|adobe\s+(cc|creative\s+cloud|photoshop|illustrator|after\s+effects)|canva|miro|mural|frame\.io)\b/i,
        // Document/file management
        /\b(google\s+(docs|sheets|drive|workspace)|dropbox|box|onedrive|sharepoint|notion)\b/i,
        // Code/development
        /\b(github|gitlab|bitbucket|vscode|visual\s+studio|intellij|sublime)\b/i,
        // Generic but specific tools
        /\b(excel|powerpoint|word|keynote|pages|numbers)\b/i,
        // Workflow terms that indicate specific processes
        /\b(email\s+chains?|video\s+calls?|stand-?ups?|retrospectives?)\b/i,
        // Platform integrations
        /\b(api|integration|plugin|extension|add-?on)\s+(with|for|to)\s+\w+/i,
        /\w+\s+(api|integration|plugin|extension|add-?on)/i
    ];
    return toolPatterns.some(pattern => pattern.test(text));
}
/**
 * Validate specificity with question-specific rules
 */
function validateQuestionSpecificity(option, questionNumber) {
    const passes = checkSpecificity(option.text, questionNumber);
    if (passes) {
        return { passes: true };
    }
    // Provide specific feedback for failures
    if (questionNumber === 7) {
        return {
            passes: false,
            reason: 'lacks edge specificity (no concrete edge asset: dataset size, exclusive partner, distribution advantage)'
        };
    }
    else {
        const hasNumbers = checkForNumbers(option.text);
        const hasTools = checkForNamedTools(option.text);
        if (!hasNumbers && !hasTools) {
            return {
                passes: false,
                reason: 'Needs specific numbers/timeframes OR named tools/platforms (Slack, Teams, Asana, etc.)'
            };
        }
        else if (!hasNumbers) {
            return {
                passes: false,
                reason: 'Needs concrete numbers, percentages, or timeframes'
            };
        }
        else {
            return {
                passes: false,
                reason: 'Needs named tools or platforms'
            };
        }
    }
}
