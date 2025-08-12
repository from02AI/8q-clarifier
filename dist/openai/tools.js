"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repairTools = exports.tools = void 0;
exports.tools = [
    {
        type: 'function',
        function: {
            name: 'suggest_options',
            description: 'Return 5 candidate suggestions A,B,C,D,E with notes on how they differ',
            parameters: {
                type: 'object',
                properties: {
                    questionNumber: { type: 'integer' },
                    notes: {
                        type: 'object',
                        properties: {
                            distinctAxes: { type: 'array', items: { type: 'string' } },
                            differentiationStrategy: { type: 'string' }
                        },
                        required: ['distinctAxes']
                    },
                    options: {
                        type: 'array', minItems: 5, maxItems: 5,
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] },
                                text: { type: 'string' },
                                why: { type: 'string' },
                                assumptions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
                                tags: { type: 'array', items: { type: 'string' } }
                            },
                            required: ['id', 'text', 'why', 'assumptions']
                        }
                    }
                },
                required: ['questionNumber', 'notes', 'options']
            }
        }
    }
];
// Tool for targeted repair of specific failing options
exports.repairTools = [
    {
        type: 'function',
        function: {
            name: 'replace_failing_option',
            description: 'Replace a single failing option with an improved version',
            parameters: {
                type: 'object',
                properties: {
                    replacementOption: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] },
                            text: { type: 'string' },
                            why: { type: 'string' },
                            assumptions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
                            tags: { type: 'array', items: { type: 'string' } }
                        },
                        required: ['id', 'text', 'why', 'assumptions']
                    }
                },
                required: ['replacementOption']
            }
        }
    }
];
