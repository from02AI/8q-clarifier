"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateQuestionV2 = generateQuestionV2;
const client_1 = require("../openai/client");
const tools_1 = require("../openai/tools");
const buildMessages_1 = require("./buildMessages");
const sanitize_1 = require("./sanitize");
const config_1 = require("../config");
const metrics_1 = require("./metrics");
const specificityJudge_1 = require("./specificityJudge");
const client_2 = require("../openai/client");
async function generateQuestionV2(state, qNum, qText) {
    const messages = (0, buildMessages_1.buildMessages)(state, qNum, qText);
    // Step 1: Generate 5 candidates
    console.log(`[8Q] Generating 5 candidates for Q${qNum}...`);
    const startTime = Date.now();
    const res = await client_1.openai.chat.completions.create({
        model: config_1.CFG.CHAT_MODEL,
        messages,
        tools: tools_1.tools,
        tool_choice: { type: 'function', function: { name: 'suggest_options' } },
        temperature: 0.7 // Slightly higher for diversity
    });
    const tc = res.choices[0].message.tool_calls?.[0];
    let rawPayload = (0, sanitize_1.sanitize)(tc ? JSON.parse(tc.function.arguments) : {}, 5);
    (0, sanitize_1.validate)(rawPayload);
    console.log(`[8Q] Raw model response: ${rawPayload.options?.length || 0} options received`);
    // If we didn't get 5 options, try once more with a stronger prompt
    if (rawPayload.options?.length < 5) {
        console.log(`[8Q] Only got ${rawPayload.options?.length} options, retrying with stronger prompt...`);
        const retryMessages = [
            ...messages,
            {
                role: 'assistant',
                content: `I need to generate exactly 5 options. Let me try again with A, B, C, D, and E.`
            },
            {
                role: 'user',
                content: `You only provided ${rawPayload.options?.length} options. I need EXACTLY 5 options with IDs A, B, C, D, E. Please generate 5 distinct options now.`
            }
        ];
        const retryRes = await client_1.openai.chat.completions.create({
            model: config_1.CFG.CHAT_MODEL,
            messages: retryMessages,
            tools: tools_1.tools,
            tool_choice: { type: 'function', function: { name: 'suggest_options' } },
            temperature: 0.8 // Higher temperature for more diversity
        });
        const retryTc = retryRes.choices[0].message.tool_calls?.[0];
        if (retryTc) {
            const retryPayload = (0, sanitize_1.sanitize)(JSON.parse(retryTc.function.arguments), 5);
            console.log(`[8Q] Retry gave ${retryPayload.options?.length || 0} options`);
            if (retryPayload.options?.length >= rawPayload.options?.length) {
                rawPayload = retryPayload;
            }
        }
    }
    // Step 2: Score all candidates
    console.log(`[8Q] Scoring candidates...`);
    const ideaCtx = buildQuestionContext(qNum, state);
    const scoredCandidates = await scoreAllCandidates(ideaCtx, rawPayload.options, state, qNum);
    // Find the best relevance score for this question (for relative threshold)
    const bestRelevance = Math.max(...scoredCandidates.map(c => c.relevance));
    const relativeThreshold = bestRelevance * 0.9; // 90% of best
    // Debug output
    console.log(`[8Q] Candidates with scores (best rel: ${bestRelevance.toFixed(3)}, relative thresh: ${relativeThreshold.toFixed(3)}):`);
    scoredCandidates.forEach((c, i) => {
        console.log(`  ${c.id}: "${c.text}" (rel: ${c.relevance.toFixed(3)}, spec: ${c.specificity}, issues: ${c.failureReasons?.join(', ') || 'none'})`);
    });
    // Step 3: Select best 3 using greedy algorithm  
    console.log(`[8Q] Selecting top 3 from ${scoredCandidates.length} candidates...`);
    const selectionResult = selectTop3Candidates(scoredCandidates, qNum, relativeThreshold);
    const metrics = {
        candidatesGenerated: scoredCandidates.length,
        candidatesPassingThresholds: scoredCandidates.filter(c => {
            return passesAllGates(c, qNum, relativeThreshold);
        }).length,
        repairAttempts: 0,
        finalSuccess: false // Will be set later
    };
    // Step 4: Targeted repair if needed
    let finalOptions = selectionResult.selected;
    let repaired = false;
    // CRITICAL RULE: Never finalize unless all 3 options pass all gates
    if (selectionResult.needsRepair.length > 0) {
        console.log(`[8Q] Attempting repair for ${selectionResult.needsRepair.length} failing option(s)...`);
        const repairResult = await attemptTargetedRepair(messages, selectionResult.needsRepair, ideaCtx, state, qNum, relativeThreshold);
        if (repairResult.success) {
            // Replace failed options with repaired ones
            repairResult.repairedOptions.forEach(repaired => {
                const index = finalOptions.findIndex(opt => opt.id === repaired.id);
                if (index >= 0) {
                    finalOptions[index] = repaired;
                }
            });
            repaired = true;
            metrics.repairAttempts = 1;
        }
    }
    // Step 5: Re-validate after repair and check distinctness
    let revalidatedOptions = await scoreAllCandidates(ideaCtx, finalOptions, state, qNum);
    const passers = revalidatedOptions.filter(c => passesAllGates(c, qNum, relativeThreshold));
    // Check distinctness after repair
    const distinctnessOk = await checkDistinctness(finalOptions);
    if (!distinctnessOk.passes) {
        console.log(`[8Q] Distinctness violated after repair (max cos: ${distinctnessOk.maxCosine.toFixed(3)}), fixing...`);
        // Rewrite the option that's too similar
        await fixDistinctness(finalOptions, messages, ideaCtx, state, qNum);
        revalidatedOptions = await scoreAllCandidates(ideaCtx, finalOptions, state, qNum);
    }
    // Step 6: Enhanced last-mile filler if still < 3 passers
    const finalPassers = revalidatedOptions.filter(c => passesAllGates(c, qNum, relativeThreshold));
    if (finalPassers.length < 3) {
        console.log(`[8Q] Only ${finalPassers.length}/3 options pass after repair, using enhanced last-mile filler...`);
        const missingCount = 3 - finalPassers.length;
        // Step 6A: Batch filler (single call, N=3 candidates)
        console.log(`[8Q] Attempting batch filler (3 candidates in one call)...`);
        const batchFillerResult = await enhancedBatchFiller(messages, finalOptions, finalPassers, missingCount, ideaCtx, state, qNum, relativeThreshold, bestRelevance);
        let fillerSuccess = false;
        if (batchFillerResult.success && batchFillerResult.validReplacements.length > 0) {
            // Replace worst failures with valid batch filler options
            const failures = revalidatedOptions.filter(c => !passesAllGates(c, qNum, relativeThreshold));
            failures.sort((a, b) => a.relevance - b.relevance); // Worst first
            let replaced = 0;
            batchFillerResult.validReplacements.forEach((replacement) => {
                if (replaced < failures.length && replaced < missingCount) {
                    const replaceIndex = finalOptions.findIndex(opt => opt.id === failures[replaced].id);
                    if (replaceIndex >= 0) {
                        finalOptions[replaceIndex] = replacement;
                        replaced++;
                    }
                }
            });
            if (replaced > 0) {
                console.log(`[8Q] Batch filler succeeded: replaced ${replaced} failing option(s)`);
                fillerSuccess = true;
            }
        }
        // Step 6B: Deterministic template fallback if batch filler failed
        if (!fillerSuccess) {
            console.log(`[8Q] Batch filler failed, using deterministic template fallback...`);
            const templateResult = await deterministicTemplateFallback(finalOptions, finalPassers, missingCount, state, qNum, relativeThreshold);
            if (templateResult.success && templateResult.templateOptions.length > 0) {
                // Replace worst failures with template options
                const failures = revalidatedOptions.filter(c => !passesAllGates(c, qNum, relativeThreshold));
                failures.sort((a, b) => a.relevance - b.relevance); // Worst first
                let replaced = 0;
                templateResult.templateOptions.forEach((template) => {
                    if (replaced < failures.length && replaced < missingCount) {
                        const replaceIndex = finalOptions.findIndex(opt => opt.id === failures[replaced].id);
                        if (replaceIndex >= 0) {
                            finalOptions[replaceIndex] = template;
                            replaced++;
                        }
                    }
                });
                if (replaced > 0) {
                    console.log(`[8Q] Template fallback succeeded: replaced ${replaced} failing option(s)`);
                    fillerSuccess = true;
                }
            }
        }
        if (!fillerSuccess) {
            console.warn(`[8Q] Both batch filler and template fallback failed - question will have failures`);
        }
    }
    // Step 7: Final validation - MUST pass all gates
    finalOptions = finalOptions.slice(0, 3).map((opt, i) => ({
        ...opt,
        id: ['A', 'B', 'C'][i]
    }));
    const finalScore = await scoreFinalOptions(ideaCtx, finalOptions, qNum, relativeThreshold);
    // CRITICAL: If we still have failures, we CANNOT finalize as "pass: true"
    // Force the final score to reflect reality
    if (!finalScore.pass) {
        console.warn(`[8Q] CONTROLLER RULE VIOLATION: Q${qNum} would finalize with failures!`);
        console.warn(`[8Q] rel: [${finalScore.rel.map(r => r.toFixed(3)).join(',')}], spec: [${finalScore.spec.join(',')}], maxCos: ${finalScore.maxPairCos.toFixed(3)}`);
        console.warn(`[8Q] Primary thresh: ${config_1.CFG.RELEVANCE_THRESH}, Relative thresh: ${relativeThreshold.toFixed(3)}`);
        // Log which options fail which gates
        finalScore.rel.forEach((rel, i) => {
            const failsRelevance = rel < config_1.CFG.RELEVANCE_THRESH && rel < relativeThreshold;
            const failsSpec = !finalScore.spec[i];
            if (failsRelevance || failsSpec) {
                console.warn(`[8Q] Option ${['A', 'B', 'C'][i]}: "${finalOptions[i].text}" fails: ${failsRelevance ? 'relevance' : ''} ${failsSpec ? 'specificity' : ''}`);
            }
        });
        if (finalScore.maxPairCos > config_1.CFG.DISTINCTNESS_MAX_COS) {
            console.warn(`[8Q] Distinctness also fails: ${finalScore.maxPairCos.toFixed(3)} > ${config_1.CFG.DISTINCTNESS_MAX_COS}`);
        }
    }
    metrics.finalSuccess = finalScore.pass;
    const payload = {
        questionNumber: qNum,
        notes: rawPayload.notes || { distinctAxes: [] },
        options: finalOptions
    };
    const duration = Date.now() - startTime;
    console.log(`[8Q] Q${qNum} completed in ${duration}ms. Success: ${metrics.finalSuccess}, Repaired: ${repaired}`);
    return { payload, score: finalScore, repaired, metrics };
}
function buildQuestionContext(qNum, state) {
    const baseIdea = state.idea;
    const recentAnswers = state.answers.slice(-2).map(a => `Q${a.q}: ${a.summary}`).join('; ');
    // Build a more specific anchor for each question
    let anchor;
    switch (qNum) {
        case 1:
            anchor = `One-sentence business idea: ${baseIdea}`;
            break;
        case 2:
            anchor = `Target customers for business idea: ${baseIdea}. Context: ${recentAnswers}`;
            break;
        case 3:
            anchor = `Customer problems for business idea: ${baseIdea}. Context: ${recentAnswers}`;
            break;
        case 4:
            anchor = `Solution approach for business idea: ${baseIdea}. Context: ${recentAnswers}`;
            break;
        case 5:
            anchor = `Success metrics for business idea: ${baseIdea}. Context: ${recentAnswers}`;
            break;
        case 6:
            anchor = `Common alternatives to ${baseIdea} are tool names and workflows (e.g., email chains, Zoom meetings, Trello/Asana boards, Google Docs/Sheets, Dropbox). Stay on 'what they use today.' Context: ${recentAnswers}`;
            break;
        case 7:
            anchor = `Hard-to-copy competitive edge for AI copilot: ${baseIdea}. Context: ${recentAnswers}. Focus on proprietary assets like exclusive training datasets (with size), model fine-tuning advantages, named partnerships that enhance the AI copilot, or distribution locks that make the AI solution hard to replicate.`;
            break;
        case 8:
            anchor = `Business risks for business idea: ${baseIdea}. Context: ${recentAnswers}`;
            break;
        default:
            anchor = `Business idea: ${baseIdea}. Context: ${recentAnswers}`;
    }
    return anchor;
}
async function scoreAllCandidates(ideaCtx, candidates, state, questionNumber) {
    const [relevanceScores_arr, specificityFlags, existingTexts] = await Promise.all([
        (0, metrics_1.relevanceScores)(ideaCtx, candidates),
        (0, specificityJudge_1.judgeSpecificity)(candidates, questionNumber), // Pass question number
        getExistingAnswerTexts(state)
    ]);
    return candidates.map((candidate, i) => {
        const failureReasons = [];
        // Note: We'll check against both primary and relative thresholds later
        // For now, just flag if below primary threshold
        if (relevanceScores_arr[i] < config_1.CFG.RELEVANCE_THRESH) {
            failureReasons.push(`relevance: ${relevanceScores_arr[i].toFixed(3)} < ${config_1.CFG.RELEVANCE_THRESH}`);
        }
        if (!specificityFlags[i]) {
            if (questionNumber === 7) {
                failureReasons.push('lacks edge specificity (no concrete edge asset: dataset size, exclusive partner, distribution advantage)');
            }
            else {
                failureReasons.push('lacks specificity (no concrete numbers/tools)');
            }
        }
        // Check similarity to existing answers
        const similarToExisting = existingTexts.some(existing => textSimilarity(candidate.text, existing) > 0.8);
        if (similarToExisting) {
            failureReasons.push('too similar to previous answer');
        }
        return {
            ...candidate,
            relevance: relevanceScores_arr[i],
            specificity: specificityFlags[i],
            failureReasons: failureReasons.length > 0 ? failureReasons : undefined
        };
    });
}
function selectTop3Candidates(candidates, qNum, relativeThreshold) {
    // Sort by composite score: relevance + specificity bonus + failure penalty
    const scoredCandidates = candidates.map(c => ({
        ...c,
        compositeScore: c.relevance +
            (c.specificity ? 0.1 : 0) +
            (c.failureReasons ? -0.2 : 0)
    })).sort((a, b) => b.compositeScore - a.compositeScore);
    const selected = [];
    const selectedTexts = [];
    const needsRepair = [];
    // Greedy selection ensuring distinctness
    for (const candidate of scoredCandidates) {
        if (selected.length >= 3)
            break;
        // Check distinctness from already selected
        const tooSimilar = selectedTexts.some(selectedText => textSimilarity(candidate.text, selectedText) > config_1.CFG.DISTINCTNESS_MAX_COS);
        if (!tooSimilar) {
            selected.push(candidate);
            selectedTexts.push(candidate.text);
            // Mark for repair if it has issues but we're selecting it anyway
            if (!passesAllGates(candidate, qNum, relativeThreshold)) {
                needsRepair.push(candidate);
            }
        }
    }
    // If we don't have 3, fill with best remaining (even if similar)
    if (selected.length < 3) {
        const remaining = scoredCandidates.filter(c => !selected.includes(c));
        for (const candidate of remaining) {
            if (selected.length >= 3)
                break;
            selected.push(candidate);
            if (!passesAllGates(candidate, qNum, relativeThreshold)) {
                needsRepair.push(candidate);
            }
        }
    }
    return { selected, candidates: scoredCandidates, needsRepair };
}
async function attemptTargetedRepair(originalMessages, failingOptions, ideaCtx, state, qNum, relativeThreshold) {
    const repairPromises = failingOptions.map(async (failing) => {
        const repairInstructions = buildRepairInstructions(failing, qNum);
        const repairMessages = [
            ...originalMessages,
            {
                role: 'user',
                content: `REPAIR REQUEST: Replace option ${failing.id} with a better version.\n\nCurrent option: "${failing.text}" - ${failing.why}\n\nIssues to fix: ${failing.failureReasons?.join(', ')}\n\n${repairInstructions}\n\nProvide exactly one replacement option with the same ID.`
            }
        ];
        try {
            const repairRes = await client_1.openai.chat.completions.create({
                model: config_1.CFG.CHAT_MODEL,
                messages: repairMessages,
                tools: tools_1.repairTools,
                tool_choice: { type: 'function', function: { name: 'replace_failing_option' } },
                temperature: 0.3
            });
            const repairTc = repairRes.choices[0].message.tool_calls?.[0];
            if (repairTc) {
                const repairPayload = JSON.parse(repairTc.function.arguments);
                return repairPayload.replacementOption;
            }
        }
        catch (error) {
            console.warn(`Repair failed for option ${failing.id}:`, error);
        }
        return null;
    });
    const repairedOptions = (await Promise.all(repairPromises)).filter(Boolean);
    return {
        success: repairedOptions.length > 0,
        repairedOptions: repairedOptions
    };
}
function buildRepairInstructions(failing, qNum) {
    const instructions = [];
    if (failing.failureReasons?.some(r => r.includes('relevance'))) {
        if (qNum === 6) {
            instructions.push('Make it more relevant to "what tools/workflows they use TODAY as alternatives" - focus on existing tools like Zoom, Trello, email chains, Google Docs, Slack, Asana, Monday.com, Miro, Dropbox, etc.');
        }
        else {
            instructions.push('Make it more directly relevant to the core idea and question context');
        }
    }
    if (failing.failureReasons?.some(r => r.includes('specificity'))) {
        if (qNum === 7) {
            instructions.push('Add concrete edge asset: exclusive dataset with number (e.g., "50k briefs"), named partnership (e.g., "with Adobe"), distribution advantage (e.g., "preinstalled on 1000 workspaces"), or proprietary API access');
        }
        else if (qNum === 6) {
            instructions.push('Use specific tool names: Slack, Teams, Figma, Trello, Asana, Notion, Jira, Zoom, Google Docs/Sheets, Monday.com, Miro, Dropbox, email chains, video calls');
        }
        else {
            instructions.push('Add concrete numbers, timeframes, or specific tools/platforms (Slack, Teams, Asana, Miro, Zoom, Dropbox, Google Workspace, etc.)');
        }
    }
    if (failing.failureReasons?.some(r => r.includes('similar'))) {
        instructions.push('Make it distinctly different from previous answers');
    }
    // Add distinctness encouragement for all repairs
    instructions.push('Make the new option distinctly different from the other selected options');
    instructions.push('Keep under 140 characters');
    instructions.push('Maintain the "why" explanation format');
    return 'Fix by: ' + instructions.join('; ') + '.';
}
async function scoreFinalOptions(ideaCtx, options, qNum, relativeThreshold) {
    const texts = options.map(o => o.text);
    const [rel, [maxPairCos]] = await Promise.all([
        (0, metrics_1.relevanceScores)(ideaCtx, options),
        (0, metrics_1.distinctnessScores)(texts)
    ]);
    const spec = await (0, specificityJudge_1.judgeSpecificity)(options, qNum);
    // Use relative threshold as fallback - accept if either condition is met
    const primaryThreshold = config_1.CFG.RELEVANCE_THRESH;
    const relPass = rel.every(r => r >= primaryThreshold ||
        (relativeThreshold !== undefined && r >= relativeThreshold));
    const distinctPass = maxPairCos <= config_1.CFG.DISTINCTNESS_MAX_COS;
    const specPass = spec.every(Boolean);
    return { rel, maxPairCos, spec, pass: distinctPass && relPass && specPass };
}
async function getExistingAnswerTexts(state) {
    return state.answers.map(a => a.summary);
}
function textSimilarity(text1, text2) {
    // Simple word overlap similarity (could be replaced with embeddings for better accuracy)
    const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    return union.size > 0 ? intersection.size / union.size : 0;
}
// New helper functions for robust pipeline
function passesAllGates(candidate, qNum, relativeThreshold) {
    // Primary relevance threshold
    const primaryThreshold = config_1.CFG.RELEVANCE_THRESH;
    // Use relative threshold as fallback (90% of best relevance for this question)
    // Accept if either condition is met: above primary OR above relative threshold
    const relevancePass = candidate.relevance >= primaryThreshold ||
        (relativeThreshold !== undefined && candidate.relevance >= relativeThreshold);
    const specificityPass = candidate.specificity;
    return relevancePass && specificityPass;
}
async function checkDistinctness(options) {
    const texts = options.map(o => o.text);
    const [maxPairCos] = await (0, metrics_1.distinctnessScores)(texts);
    return { passes: maxPairCos <= config_1.CFG.DISTINCTNESS_MAX_COS, maxCosine: maxPairCos };
}
async function fixDistinctness(options, messages, ideaCtx, state, qNum) {
    // Find which options are too similar and rewrite one of them
    const texts = options.map(o => o.text);
    const vecs = await (0, client_2.embed)(texts);
    const cosine = (i, j) => {
        const a = vecs[i], b = vecs[j];
        let s = 0, na = 0, nb = 0;
        for (let k = 0; k < a.length; k++) {
            s += a[k] * b[k];
            na += a[k] * a[k];
            nb += b[k] * b[k];
        }
        return s / (Math.sqrt(na) * Math.sqrt(nb));
    };
    // Find the pair with highest similarity
    let maxCos = 0;
    let maxPair = [0, 1];
    for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
            const cos = cosine(i, j);
            if (cos > maxCos) {
                maxCos = cos;
                maxPair = [i, j];
            }
        }
    }
    if (maxCos > config_1.CFG.DISTINCTNESS_MAX_COS) {
        // Rewrite the second option in the most similar pair
        const rewriteIndex = maxPair[1];
        const currentOption = options[rewriteIndex];
        const otherOptions = options.filter((_, i) => i !== rewriteIndex);
        const distinctnessPrompt = `DISTINCTNESS REPAIR: Replace option ${currentOption.id || ['A', 'B', 'C'][rewriteIndex]} with a version that's clearly different from these existing options:
${otherOptions.map((o, i) => `- "${o.text}"`).join('\n')}

Current option to replace: "${currentOption.text}" - ${currentOption.why}

Make the new option focus on a different axis (customer segment, mechanism, channel, or scope) while staying relevant to Q${qNum}. Keep under 140 characters.`;
        try {
            const repairRes = await client_1.openai.chat.completions.create({
                model: config_1.CFG.CHAT_MODEL,
                messages: [...messages, { role: 'user', content: distinctnessPrompt }],
                tools: tools_1.repairTools,
                tool_choice: { type: 'function', function: { name: 'replace_failing_option' } },
                temperature: 0.5
            });
            const repairTc = repairRes.choices[0].message.tool_calls?.[0];
            if (repairTc) {
                const repairPayload = JSON.parse(repairTc.function.arguments);
                if (repairPayload.replacementOption) {
                    options[rewriteIndex] = {
                        ...repairPayload.replacementOption,
                        id: currentOption.id || ['A', 'B', 'C'][rewriteIndex]
                    };
                }
            }
        }
        catch (error) {
            console.warn(`Distinctness repair failed:`, error);
        }
    }
}
async function lastMileFiller(messages, currentOptions, passers, missingCount, ideaCtx, state, qNum, relativeThreshold) {
    console.log(`[8Q] Last-mile filler: generating ${missingCount} replacement(s)...`);
    // Build instruction for what's needed
    const currentTexts = currentOptions.map(o => `"${o.text}"`).join(', ');
    const specificityReq = getSpecificityRequirement(qNum);
    const relevanceReq = `relevance ≥ ${config_1.CFG.RELEVANCE_THRESH} or ≥ ${relativeThreshold.toFixed(3)} (90% of best for this question)`;
    const fillerPrompt = `LAST-MILE FILLER: Generate exactly ${missingCount} replacement option(s) that MUST pass all gates:

CONTEXT: You're answering Q${qNum} for this idea: ${state.idea}
Recent answers context: ${state.answers.slice(-2).map(a => `Q${a.q}: ${a.summary}`).join('; ')}

CURRENT OPTIONS (DO NOT REPEAT THESE - be clearly different): ${currentTexts}

CRITICAL REQUIREMENTS (ALL MUST BE MET):
1. Relevance: MUST achieve ≥ ${config_1.CFG.RELEVANCE_THRESH} relevance OR ≥ ${relativeThreshold.toFixed(3)} to idea context: "${ideaCtx}"
2. Specificity: ${specificityReq}  
3. Distinctness: MUST be clearly different from existing options - use different approach, customer segment, mechanism, or tool
4. Length: Under 140 characters each

FOR Q${qNum} SPECIFICALLY:
${getQuestionSpecificGuidance(qNum, state.idea)}

KEY STRATEGY FOR HIGH RELEVANCE:
- Stay extremely close to the core business idea: "${state.idea}"
- Reference specific context from recent answers: ${state.answers.slice(-2).map(a => a.summary).join(', ')}
- Use question-appropriate vocabulary and concepts
- ${qNum === 6 ? 'Focus on real tools/workflows teams use TODAY as alternatives' : ''}
- ${qNum === 7 ? 'Name concrete proprietary assets (datasets with numbers, exclusive partnerships, distribution locks)' : ''}

CRITICAL: Do NOT generate anything similar to existing options. Generate ${missingCount} genuinely distinct, highly relevant option(s) that directly address Q${qNum} in the context of "${state.idea}".`;
    try {
        const fillerRes = await client_1.openai.chat.completions.create({
            model: config_1.CFG.CHAT_MODEL,
            messages: [...messages, { role: 'user', content: fillerPrompt }],
            tools: tools_1.tools,
            tool_choice: { type: 'function', function: { name: 'suggest_options' } },
            temperature: 0.4
        });
        const fillerTc = fillerRes.choices[0].message.tool_calls?.[0];
        if (fillerTc) {
            const fillerPayload = (0, sanitize_1.sanitize)(JSON.parse(fillerTc.function.arguments));
            if (fillerPayload.options && fillerPayload.options.length >= missingCount) {
                return {
                    success: true,
                    fillerOptions: fillerPayload.options.slice(0, missingCount)
                };
            }
        }
    }
    catch (error) {
        console.warn(`Last-mile filler failed:`, error);
    }
    return { success: false, fillerOptions: [] };
}
function getSpecificityRequirement(qNum) {
    if (qNum === 7) {
        return "concrete edge asset (exclusive dataset with size, named partner, distribution advantage, proprietary API access)";
    }
    else {
        return "number/time/scale OR named tool/integration (Slack, Teams, Asana, Miro, Zoom, Dropbox, Google Workspace/Docs/Sheets, Adobe CC, Monday.com, Trello, Jira, Notion, Airtable, etc.)";
    }
}
function getQuestionSpecificGuidance(qNum, idea) {
    switch (qNum) {
        case 1:
            return `Focus on a clear, specific one-sentence description of ${idea}. Include target user size, platform/tool integration, and measurable benefit.`;
        case 2:
            return `Be very specific about WHO uses ${idea}: include team size (e.g., 10-50 people), role (marketing, design, etc.), and primary tool they use (Slack, Teams, etc.).`;
        case 3:
            return `Describe concrete problems related to ${idea}: include specific pain points with numbers/percentages, time wasted, process breakdowns that this idea would solve.`;
        case 4:
            return `Explain HOW ${idea} solves the problems: focus on the specific mechanism, tool integration, AI features, automation, or process that directly addresses the pain points.`;
        case 5:
            return `Define measurable success metrics for ${idea}: include specific numbers, percentages, timeframes (3-12 months), KPIs that show the solution is working.`;
        case 6:
            return `List specific tools/workflows teams use INSTEAD of ${idea}: name actual tools (Zoom, Trello, email chains, Google Docs, Slack channels, Monday.com, etc.) that people currently rely on.`;
        case 7:
            return `Identify hard-to-copy advantages for ${idea}: focus on proprietary assets (exclusive datasets with size, named partnerships, distribution locks, fine-tuned models, API access) that competitors can't easily replicate.`;
        case 8:
            return `Name specific business risks for ${idea}: focus on realistic concerns about AI accuracy, user adoption, competition, technical integration, or market factors that could threaten success.`;
        default:
            return `Be specific and concrete about ${idea}.`;
    }
}
// Enhanced batch filler - generates 3 candidates in one call with explicit constraints
async function enhancedBatchFiller(messages, currentOptions, passers, missingCount, ideaCtx, state, qNum, relativeThreshold, bestRelevance) {
    console.log(`[8Q] Enhanced batch filler: generating 3 candidates for ${missingCount} slot(s)...`);
    // Step B: Dynamic relevance fallback for filler only
    const dynamicRelativeThreshold = bestRelevance < 0.50
        ? bestRelevance * 0.85 // 85% of best if best < 0.50
        : bestRelevance * 0.90; // 90% of best if best >= 0.50
    console.log(`[8Q] Dynamic filler threshold: best=${bestRelevance.toFixed(3)}, using ${dynamicRelativeThreshold.toFixed(3)} (${bestRelevance < 0.50 ? '85%' : '90%'} of best)`);
    const passingTexts = passers.map(p => p.text);
    const specificityReq = getSpecificityRequirement(qNum);
    const questionSpecificAnchors = getQuestionSpecificAnchors(qNum);
    const batchFillerPrompt = `BATCH FILLER (3 CANDIDATES): Generate exactly 3 replacement options that MUST pass all gates.

CONTEXT: Q${qNum} for idea: "${state.idea}"
Recent answers: ${state.answers.slice(-2).map(a => `Q${a.q}: ${a.summary}`).join('; ')}

EXISTING PASSING OPTIONS (avoid duplication): ${passingTexts.join(' | ')}

CRITICAL REQUIREMENTS (ALL 3 CANDIDATES MUST MEET):
1. Relevance: ≥ ${config_1.CFG.RELEVANCE_THRESH} OR ≥ ${dynamicRelativeThreshold.toFixed(3)} to context: "${ideaCtx}"
2. Specificity: ${specificityReq}
3. Distinctness: Clearly different from existing options AND from each other
4. Length: Under 140 characters each

QUESTION-SPECIFIC ANCHORS (each candidate MUST include at least one):
${questionSpecificAnchors}

AXES TO DIFFERENTIATE (use different combinations):
- Customer segment (team size, role, industry)
- Mechanism (tool integration, automation, AI feature)
- Channel (platform, distribution, partnership)  
- Scope (feature breadth, use case, timeline)

CRITICAL FOR HIGH RELEVANCE:
- Reference the core idea: "${state.idea}"
- Connect to recent context: ${state.answers.slice(-2).map(a => a.summary).join(', ')}
- Use precise vocabulary for Q${qNum}
${qNum === 7 ? '- Name concrete edge assets (datasets, partnerships, distribution)' : ''}
${qNum === 8 ? '- Focus on risks CAUSED BY the proposed solution' : ''}

Generate 3 genuinely distinct, highly relevant candidates that directly address Q${qNum}.`;
    try {
        const batchRes = await client_1.openai.chat.completions.create({
            model: config_1.CFG.CHAT_MODEL,
            messages: [...messages, { role: 'user', content: batchFillerPrompt }],
            tools: tools_1.tools,
            tool_choice: { type: 'function', function: { name: 'suggest_options' } },
            temperature: 0.5 // Slightly higher for diversity across 3 candidates
        });
        const batchTc = batchRes.choices[0].message.tool_calls?.[0];
        if (batchTc) {
            const batchPayload = (0, sanitize_1.sanitize)(JSON.parse(batchTc.function.arguments));
            if (batchPayload.options && batchPayload.options.length >= 3) {
                // Score all 3 candidates
                const scoredCandidates = await scoreAllCandidates(ideaCtx, batchPayload.options.slice(0, 3), state, qNum);
                // Filter for those that pass gates with dynamic threshold
                const validCandidates = scoredCandidates.filter(c => (c.relevance >= config_1.CFG.RELEVANCE_THRESH || c.relevance >= dynamicRelativeThreshold) &&
                    c.specificity);
                if (validCandidates.length > 0) {
                    // Check distinctness against existing passers
                    const distinctCandidates = [];
                    for (const candidate of validCandidates) {
                        const tooSimilar = passingTexts.some(passingText => textSimilarity(candidate.text, passingText) > config_1.CFG.DISTINCTNESS_MAX_COS);
                        if (!tooSimilar) {
                            distinctCandidates.push(candidate);
                        }
                        else {
                            console.log(`[8Q] Batch candidate "${candidate.text}" rejected: too similar to existing passers`);
                        }
                    }
                    if (distinctCandidates.length > 0) {
                        console.log(`[8Q] Batch filler generated ${distinctCandidates.length} valid replacement(s)`);
                        return { success: true, validReplacements: distinctCandidates.slice(0, missingCount) };
                    }
                }
                console.log(`[8Q] Batch filler: no candidates passed gates (${validCandidates.length} valid, distinctness filtered)`);
            }
        }
    }
    catch (error) {
        console.warn(`[8Q] Batch filler failed:`, error);
    }
    return { success: false, validReplacements: [] };
}
// Deterministic template fallback - guaranteed to produce valid options
async function deterministicTemplateFallback(currentOptions, passers, missingCount, state, qNum, relativeThreshold) {
    console.log(`[8Q] Deterministic template fallback for Q${qNum}...`);
    const passingTexts = passers.map(p => p.text);
    const templateOptions = [];
    // Extract context for variable filling
    const platforms = extractPlatformsFromAnswers(state.answers);
    const tools = extractToolsFromAnswers(state.answers);
    const numbers = extractNumbersFromAnswers(state.answers);
    for (let i = 0; i < missingCount && templateOptions.length < missingCount; i++) {
        const template = generateTemplate(qNum, i, platforms, tools, numbers, state.idea);
        if (template) {
            // Check distinctness against existing passers and previous templates
            const allExistingTexts = [...passingTexts, ...templateOptions.map(t => t.text)];
            const tooSimilar = allExistingTexts.some(existingText => textSimilarity(template.text, existingText) > config_1.CFG.DISTINCTNESS_MAX_COS);
            if (!tooSimilar) {
                templateOptions.push(template);
                console.log(`[8Q] Template ${i + 1}: "${template.text}"`);
            }
            else {
                // Adjust template to be more distinct
                const adjustedTemplate = adjustTemplateForDistinctness(template, qNum, i, platforms, tools, numbers);
                if (adjustedTemplate && !allExistingTexts.some(existingText => textSimilarity(adjustedTemplate.text, existingText) > config_1.CFG.DISTINCTNESS_MAX_COS)) {
                    templateOptions.push(adjustedTemplate);
                    console.log(`[8Q] Adjusted template ${i + 1}: "${adjustedTemplate.text}"`);
                }
            }
        }
    }
    const success = templateOptions.length > 0;
    if (success) {
        console.log(`[8Q] Template fallback generated ${templateOptions.length} option(s)`);
    }
    return { success, templateOptions };
}
function getQuestionSpecificAnchors(qNum) {
    switch (qNum) {
        case 7:
            return `- "dataset of X items", "exclusive partnership with Y", "preinstalled in X workspaces", "fine-tuned on X projects", "private API access", "proprietary data"`;
        case 8:
            return `- "model accuracy", "integration friction", "adoption risk", "privacy concerns", "technical limitations", "competitive response"`;
        case 6:
            return `- "Slack", "Teams", "Zoom", "Trello", "Asana", "Monday.com", "Google Docs", "email chains", "Dropbox", "Miro"`;
        default:
            return `- Numbers/percentages, specific tools (Slack, Teams, etc.), timeframes (3-6 months), measurable outcomes`;
    }
}
function generateTemplate(qNum, templateIndex, platforms, tools, numbers, idea) {
    const defaultPlatforms = ['Slack', 'Teams', 'Asana', 'Trello', 'Monday.com'];
    const defaultTools = ['Adobe CC', 'Google Workspace', 'Dropbox', 'Miro', 'Jira'];
    const platform = platforms[templateIndex] || defaultPlatforms[templateIndex % defaultPlatforms.length];
    const tool = tools[templateIndex] || defaultTools[templateIndex % defaultTools.length];
    const percentage = numbers.percentage || [15, 25, 30][templateIndex % 3];
    const count = numbers.count || [100, 250, 500][templateIndex % 3];
    const timeframe = numbers.timeframe || [3, 6, 12][templateIndex % 3];
    let text;
    let why;
    if (qNum === 7) {
        // Q7 edge asset templates
        const templates = [
            {
                text: `Proprietary dataset of ${count}k creative briefs labeled across ${Math.floor(count / 10)} categories; improves suggestion accuracy by ${percentage}%.`,
                why: `Concrete edge asset - exclusive training data with specific numbers that competitors can't easily replicate.`
            },
            {
                text: `Exclusive partnership with ${platform} for preinstall on ${count} workspaces; drives immediate adoption.`,
                why: `Distribution advantage through named platform partnership that creates barrier to entry.`
            },
            {
                text: `Model fine-tuned on ${count} domain projects; outperforms baseline by ${percentage}% on creative tasks.`,
                why: `Technical edge through specialized training that requires significant domain expertise to replicate.`
            }
        ];
        const template = templates[templateIndex % templates.length];
        text = template.text;
        why = template.why;
    }
    else if (qNum === 8) {
        // Q8 risk templates
        const templates = [
            {
                text: `Model misinterpretation of creative edge cases could cut task accuracy by ${percentage}% vs human baseline.`,
                why: `Technical risk specific to AI model limitations that could impact core value proposition.`
            },
            {
                text: `Integration friction with ${platform} may delay team onboarding by ${timeframe} weeks vs current workflow.`,
                why: `Adoption risk tied to platform dependencies that could slow user acquisition.`
            },
            {
                text: `Only ${percentage}% of teams may switch from ${tool} in first ${timeframe} months due to workflow lock-in.`,
                why: `Market penetration risk based on realistic adoption challenges against established tools.`
            }
        ];
        const template = templates[templateIndex % templates.length];
        text = template.text;
        why = template.why;
    }
    else {
        // Generic template for other questions
        return null;
    }
    if (text.length > 140) {
        text = text.substring(0, 137) + '...';
    }
    return {
        id: ['A', 'B', 'C'][templateIndex],
        text,
        why,
        assumptions: [`Template-generated for Q${qNum} specificity`],
        tags: qNum === 7 ? ['edge', 'competitive'] : qNum === 8 ? ['risk', 'business'] : ['generated']
    };
}
function adjustTemplateForDistinctness(template, qNum, templateIndex, platforms, tools, numbers) {
    // Simple adjustments to make template more distinct
    const altPlatforms = ['Adobe CC', 'Notion', 'Airtable', 'Figma', 'Canva'];
    const altTools = ['ClickUp', 'Linear', 'Coda', 'Frame.io', 'Loom'];
    const altPlatform = altPlatforms[templateIndex % altPlatforms.length];
    const altTool = altTools[templateIndex % altTools.length];
    let adjustedText = template.text;
    // Swap platform/tool names and adjust numbers slightly
    if (qNum === 7) {
        adjustedText = adjustedText.replace(/Slack|Teams|Asana/g, altPlatform);
        adjustedText = adjustedText.replace(/100k/g, '150k').replace(/250k/g, '300k').replace(/500k/g, '750k');
        adjustedText = adjustedText.replace(/15%/g, '20%').replace(/25%/g, '35%').replace(/30%/g, '40%');
    }
    else if (qNum === 8) {
        adjustedText = adjustedText.replace(/Slack|Teams|Asana|Trello|Monday\.com/g, altPlatform);
        adjustedText = adjustedText.replace(/Adobe CC|Google Workspace|Dropbox/g, altTool);
        adjustedText = adjustedText.replace(/3 weeks/g, '4 weeks').replace(/6 weeks/g, '8 weeks');
    }
    if (adjustedText !== template.text && adjustedText.length <= 140) {
        return {
            ...template,
            text: adjustedText,
            why: template.why.replace('specific to', 'related to') // Minor why adjustment
        };
    }
    return null;
}
function extractPlatformsFromAnswers(answers) {
    const platforms = [];
    const platformRegex = /\b(Slack|Teams|Asana|Trello|Monday\.com|Zoom|Adobe|Google|Dropbox|Miro|Figma|Notion|Airtable)\b/gi;
    answers.forEach(answer => {
        const matches = answer.summary.match(platformRegex);
        if (matches) {
            platforms.push(...matches);
        }
    });
    return [...new Set(platforms)]; // Remove duplicates
}
function extractToolsFromAnswers(answers) {
    const tools = [];
    const toolRegex = /\b(CC|Workspace|Docs|Sheets|Drive|OneDrive|Dropbox|Box|Jira|Linear|ClickUp)\b/gi;
    answers.forEach(answer => {
        const matches = answer.summary.match(toolRegex);
        if (matches) {
            tools.push(...matches);
        }
    });
    return [...new Set(tools)];
}
function extractNumbersFromAnswers(answers) {
    let percentage = null;
    let count = null;
    let timeframe = null;
    answers.forEach(answer => {
        // Extract percentages
        const percentMatch = answer.summary.match(/(\d+)%/);
        if (percentMatch && !percentage) {
            percentage = parseInt(percentMatch[1]);
        }
        // Extract counts (k, thousand, etc.)
        const countMatch = answer.summary.match(/(\d+)k|(\d+)\s*thousand|(\d+)\s*users|(\d+)\s*teams/i);
        if (countMatch && !count) {
            count = parseInt(countMatch[1] || countMatch[2] || countMatch[3] || countMatch[4]);
        }
        // Extract timeframes
        const timeMatch = answer.summary.match(/(\d+)\s*(weeks?|months?)/i);
        if (timeMatch && !timeframe) {
            timeframe = parseInt(timeMatch[1]);
        }
    });
    return { percentage, count, timeframe };
}
