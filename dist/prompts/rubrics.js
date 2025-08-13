"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUBRICS = void 0;
exports.RUBRICS = {
    1: { axes: ['customer', 'mechanism', 'scope'], guidance: 'Make each option change customer and mechanism.' },
    2: { axes: ['segment', 'role', 'company_size'], guidance: '3 distinct target slices. Include team size or the tools they use (e.g., Asana, Teams).' },
    3: { axes: ['pain', 'frequency', 'severity'], guidance: 'Concrete pains with a number/frequency; keep each pain distinct and mention the core idea.' },
    4: { axes: ['mechanism', 'integration', 'automation'], guidance: 'Vary delivery: plugin vs bot vs SaaS; include a named tool.' },
    5: { axes: ['metric', 'coverage', 'confidence'], guidance: 'Define success metric & horizon.' },
    6: { axes: ['alt_tool', 'workaround', 'vendor'], guidance: 'Name what they use today.' },
    7: { axes: ['edge', 'data_adv', 'workflow_lock'], guidance: 'State a hard-to-copy edge for each option, and include a concrete asset: quantified dataset (e.g., "50k briefs", "2M labeled assets"), named exclusive partner (e.g., "Slack partnership"), distribution lock-in (e.g., "preinstalled on 1,000 client Teams workspaces"), or model advantage (e.g., "fine-tuned on 10k domain-specific projects"). Each option MUST include a number or named partner. EXAMPLES: "Proprietary dataset of 50k creative briefs", "Exclusive partnership with Slack", "Preinstalled on 1,000 agencies", "Fine-tuned model on 10k projects".' },
    8: { axes: ['risk_type', 'timing', 'impact'], guidance: 'Vary risk types: technical (AI accuracy), market (competition), user (adoption), operational (integration). Keep each risk distinct.' }
};
