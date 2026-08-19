/**
 * Big JSON: keep the shape, sample the repetition.
 *
 * A large JSON result is almost always large in one way: an array of records
 * that look alike. Ten thousand rows teach the model nothing that three rows
 * and a count do not. Objects are kept whole; arrays over a small length are
 * cut to their first records plus a counted marker.
 *
 * The output is VALID JSON with one extension: a marker string inside each
 * shortened array. The model reads it as data, and the note explains it.
 */
import { splitLines } from '../text.js';
import { reduceBySize } from './size.js';
/** Records shown from each long array. */
const SAMPLE = 3;
/** Arrays at or below this length are kept whole. */
const KEEP_WHOLE = 5;
/**
 * Objects at or below this many keys are kept whole. Above it, keys are
 * sampled like array items. package-lock.json is the type case: one object
 * whose thousands of KEYS are the repetition, not any array.
 */
const KEEP_WHOLE_KEYS = 25;
/** Keys shown from an oversized object. */
const SAMPLE_KEYS = 5;
/** Nesting depth at which everything collapses to a type marker. */
const MAX_DEPTH = 12;
/** A long string inside a value is cut to this many characters. */
const MAX_STRING = 500;
export function detectJson(text, hint) {
    const trimmed = text.trimStart();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('['))
        return false;
    // Cheap certainty for the common case: a JSON file read or an API result.
    const path = hint.path?.toLowerCase() ?? '';
    if (path.endsWith('.json') || path.endsWith('.jsonl'))
        return true;
    const end = text.trimEnd();
    return end.endsWith('}') || end.endsWith(']');
}
export function reduceJson(text, hint, budget) {
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        return null; // Not parseable, not ours. JSONL and broken JSON fall through.
    }
    const sampled = sample(value, 0);
    const body = JSON.stringify(sampled, null, 2);
    // No gain: the input was already small or held no repetition.
    if (body.length >= text.length)
        return null;
    const inputLines = splitLines(text).length;
    if (body.length > budget.maxChars || splitLines(body).length > budget.maxLines) {
        const capped = reduceBySize(body, { ...hint, tool: 'read' }, budget, 'head');
        return {
            content: capped.content,
            reduced: true,
            strategy: 'json+size',
            note: `arrays sampled to ${SAMPLE} records with counts, then cut to fit; markers like "... 997 more items ..." stand for dropped records`,
            stats: {
                inputChars: text.length, inputLines,
                outputChars: capped.content.length, outputLines: splitLines(capped.content).length,
            },
        };
    }
    return {
        content: body,
        reduced: true,
        strategy: 'json',
        note: `arrays sampled to ${SAMPLE} records with counts; markers like "... 997 more items ..." stand for dropped records`,
        stats: {
            inputChars: text.length, inputLines,
            outputChars: body.length, outputLines: splitLines(body).length,
        },
    };
}
function sample(value, depth) {
    if (depth > MAX_DEPTH)
        return typeMarker(value);
    if (Array.isArray(value)) {
        if (value.length <= KEEP_WHOLE)
            return value.map(item => sample(item, depth + 1));
        const head = value.slice(0, SAMPLE).map(item => sample(item, depth + 1));
        return [...head, `... ${(value.length - SAMPLE).toLocaleString('en-US')} more items ...`];
    }
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value);
        const out = {};
        if (entries.length <= KEEP_WHOLE_KEYS) {
            for (const [key, entry] of entries)
                out[key] = sample(entry, depth + 1);
            return out;
        }
        for (const [key, entry] of entries.slice(0, SAMPLE_KEYS))
            out[key] = sample(entry, depth + 1);
        out['...'] = `${(entries.length - SAMPLE_KEYS).toLocaleString('en-US')} more keys omitted`;
        return out;
    }
    if (typeof value === 'string' && value.length > MAX_STRING) {
        return `${value.slice(0, MAX_STRING)}... (+${(value.length - MAX_STRING).toLocaleString('en-US')} chars)`;
    }
    return value;
}
function typeMarker(value) {
    if (Array.isArray(value))
        return `[array of ${value.length}]`;
    if (value !== null && typeof value === 'object')
        return `{object, ${Object.keys(value).length} keys}`;
    return String(value);
}
export const jsonReducer = {
    name: 'json',
    detect: detectJson,
    reduce: reduceJson,
};
export default jsonReducer;
//# sourceMappingURL=json.js.map