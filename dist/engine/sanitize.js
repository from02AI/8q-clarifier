"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitize = sanitize;
exports.validate = validate;
const suggestion_1 = require("../schemas/suggestion");
function sanitize(raw, maxOptions = 5) {
    // Trim to maxOptions, normalize ids if needed
    if (Array.isArray(raw?.options)) {
        const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        raw.options = raw.options.filter((o) => o).slice(0, maxOptions).map((o, i) => ({ ...o, id: ids[i] }));
    }
    // Ensure notes exists
    if (!raw?.notes?.distinctAxes)
        raw.notes = { distinctAxes: ['customer', 'mechanism'] };
    return raw;
}
function validate(raw) {
    return suggestion_1.QuestionOutputSchema.safeParse(raw);
}
