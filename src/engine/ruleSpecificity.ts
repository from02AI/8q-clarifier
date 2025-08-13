import type { Suggestion } from '../types';

/**
 * Rule-based specificity checking - replaces LLM judge for cost optimization
 * Checks for concrete numbers, named tools, or specific business elements
 */

export function judgeSpecificityByRules(options: Pick<Suggestion, 'text' | 'why'>[], questionNumber?: number): boolean[] {
  return options.map(option => checkSpecificity(option.text, questionNumber));
}

function checkSpecificity(text: string, questionNumber?: number): boolean {
  // Question 7 has special edge asset requirements
  if (questionNumber === 7) {
    return checkEdgeAssetSpecificity(text);
  }
  
  // For all other questions, check general specificity
  return checkGeneralSpecificity(text);
}

function checkEdgeAssetSpecificity(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // Must have concrete edge asset indicators
  const edgeAssetPatterns = [
    // Dataset specificity
    /\b(\d+k?|thousand|million)\s*(items?|briefs?|projects?|documents?|samples?|examples?)\b/i,
    /\bdataset\s+of\s+\d+/i,
    /\bfine-tuned\s+on\s+\d+/i,
    /\btrained\s+on\s+\d+/i,
    
    // Partnership specificity
    /\bpartnership\s+with\s+\w+/i,
    /\bexclusive\s+.*\bwith\s+\w+/i,
    /\bpreinstalled\s+(on|in)\s+\d+/i,
    
    // Technical advantage specificity
    /\bproprietary\s+(api|data|model|algorithm)/i,
    /\bprivate\s+api\s+access/i,
    /\boutperforms?\s+.*by\s+\d+%/i,
    /\bimproves?\s+.*by\s+\d+%/i,
    
    // Distribution advantage
    /\bdistribution\s+.*\b(lock|advantage|channel)/i,
    /\binstalled\s+in\s+\d+/i,
    /\baccess\s+to\s+\d+/i
  ];
  
  // Must match at least one edge asset pattern
  const hasEdgeAsset = edgeAssetPatterns.some(pattern => pattern.test(text));
  
  // Must also have a number for scale/specificity
  const hasNumber = /\b\d+[k%]?\b/.test(text);
  
  return hasEdgeAsset && hasNumber;
}

function checkGeneralSpecificity(text: string): boolean {
  // Check for numbers/percentages/timeframes
  const hasNumbers = checkForNumbers(text);
  
  // Check for specific tools/platforms
  const hasNamedTools = checkForNamedTools(text);
  
  // Must have at least one specificity indicator
  return hasNumbers || hasNamedTools;
}

function checkForNumbers(text: string): boolean {
  const numberPatterns = [
    /\b\d+%/,                           // Percentages: 25%, 50%
    /\b\d+k\b/i,                        // Thousands: 100k, 50k
    /\b\d+\s*(minutes?|hours?|days?|weeks?|months?|years?)\b/i, // Time: 3 months, 2 weeks
    /\b\d+\s*(people|users?|teams?|employees?|members?)\b/i,    // Count: 50 people, 100 users
    /\b\d+\s*(x|times)\b/i,             // Multipliers: 3x faster, 5 times
    /\b\$\d+/,                          // Money: $100, $50k
    /\b\d+\s*(gb|mb|tb)\b/i,            // Data size: 500GB, 2TB
    /\b\d+\.\d+/,                       // Decimals: 2.5, 10.3
    /\b(double|triple|halve|reduce)\s+(by\s+)?\d+/i, // "reduce by 30%", "double the 50"
  ];
  
  return numberPatterns.some(pattern => pattern.test(text));
}

function checkForNamedTools(text: string): boolean {
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
export function validateQuestionSpecificity(option: Pick<Suggestion, 'text' | 'why'>, questionNumber: number): {
  passes: boolean;
  reason?: string;
} {
  const passes = checkSpecificity(option.text, questionNumber);
  
  if (passes) {
    return { passes: true };
  }
  
  // Provide specific feedback for failures
  if (questionNumber === 7) {
    return {
      passes: false,
      reason: 'Needs concrete edge asset: exclusive dataset with size, named partnership, distribution advantage, or proprietary technical details'
    };
  } else {
    const hasNumbers = checkForNumbers(option.text);
    const hasTools = checkForNamedTools(option.text);
    
    if (!hasNumbers && !hasTools) {
      return {
        passes: false,
        reason: 'Needs specific numbers/timeframes OR named tools/platforms (Slack, Teams, Asana, etc.)'
      };
    } else if (!hasNumbers) {
      return {
        passes: false,
        reason: 'Needs concrete numbers, percentages, or timeframes'
      };
    } else {
      return {
        passes: false,
        reason: 'Needs named tools or platforms'
      };
    }
  }
}
