/**
 * Repeated lines: keep one, count the rest.
 *
 * Retry storms, progress spam, polling loops: output where thousands of lines
 * are the same sentence with different numbers. syslog solved this decades ago
 * with "last message repeated N times". This cut does the same, by template:
 * two lines match when they are equal after digits, hex ids and timestamps are
 * masked out.
 *
 * Only CONSECUTIVE runs collapse. Interleaved output stays untouched, because
 * collapsing across distance can reorder meaning.
 */
import { splitLines } from '../text.js';
import { reduceBySize } from './size.js';
/** A run must be at least this long to collapse. */
const MIN_RUN = 5;
/** Lines of a run shown before the count. */
const SHOW = 2;
/** Mask the parts that vary between repeats of the same message. */
function template(line) {
    return line
        .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '#T')
        .replace(/\b[0-9a-f]{8,}\b/gi, '#H')
        .replace(/\d+/g, '#');
}
export function detectRepeat(text, _hint) {
    const sample = splitLines(text).slice(0, 500);
    if (sample.length < 50)
        return false;
    const counts = new Map();
    for (const line of sample) {
        const key = template(line);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let top = 0;
    for (const count of counts.values())
        top = Math.max(top, count);
    // One template covering a third of the sample marks repetitive output.
    return top >= sample.length / 3;
}
export function reduceRepeat(text, hint, budget) {
    const lines = splitLines(text);
    const out = [];
    let dropped = 0;
    let i = 0;
    while (i < lines.length) {
        const key = template(lines[i]);
        let end = i + 1;
        while (end < lines.length && template(lines[end]) === key)
            end++;
        const run = end - i;
        if (run >= MIN_RUN) {
            for (let j = i; j < i + SHOW; j++)
                out.push(lines[j]);
            out.push(`... ${(run - SHOW).toLocaleString('en-US')} similar lines omitted ...`);
            dropped += run - SHOW;
        }
        else {
            for (let j = i; j < end; j++)
                out.push(lines[j]);
        }
        i = end;
    }
    if (dropped === 0)
        return null;
    const body = out.join('\n');
    if (body.length >= text.length)
        return null;
    const keptCount = lines.length - dropped;
    const base = {
        inputChars: text.length,
        inputLines: lines.length,
        keptLines: keptCount,
        droppedLines: dropped,
    };
    if (body.length > budget.maxChars || splitLines(body).length > budget.maxLines) {
        const capped = reduceBySize(body, hint, budget);
        return {
            content: capped.content,
            reduced: true,
            strategy: 'repeat+size',
            note: `repeated lines collapsed to counts, then cut to fit`,
            stats: { ...base, outputChars: capped.content.length, outputLines: splitLines(capped.content).length },
        };
    }
    return {
        content: body,
        reduced: true,
        strategy: 'repeat',
        note: `${dropped.toLocaleString('en-US')} repeated lines collapsed into counts`,
        stats: { ...base, outputChars: body.length, outputLines: splitLines(body).length },
    };
}
export const repeatReducer = {
    name: 'repeat',
    detect: detectRepeat,
    reduce: reduceRepeat,
};
export default repeatReducer;
//# sourceMappingURL=repeat.js.map