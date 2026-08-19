/**
 * Log output: keep the problems and the ending, drop the routine.
 *
 * A log's information lives in two places: the lines that report trouble
 * (error, warn, fatal, exceptions) and the last lines, which say how things
 * stood when the log stopped. The bulk in between is repetitive info/debug.
 *
 * This cut keeps every trouble line with a little context before it (the lines
 * that led up to the problem), plus the tail of the log. It refuses to run
 * unless the text clearly looks like a log AND the trouble lines are a small
 * minority, because a log that is all errors gains nothing from this.
 */
import { splitLines, omissionMarker } from '../text.js';
import { reduceBySize } from './size.js';
const TROUBLE = [
    /\b(?:ERROR|ERR|FATAL|CRITICAL|SEVERE|PANIC)\b/,
    /\b(?:WARN|WARNING)\b/,
    /\b(?:Exception|Traceback|stack trace|segfault|core dumped)\b/i,
    /\b(?:failed|failure|refused|timed? ?out|unreachable|denied|cannot|unable to)\b/i,
];
/** A timestamp or level tag at the start of a line marks log-shaped text. */
const LOG_SHAPE = [
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/, // ISO datetime
    /^\[?\d{2}:\d{2}:\d{2}[.,]\d+\]?/, // bare time with millis
    /^\[(?:INFO|DEBUG|WARN|ERROR|TRACE|FATAL)\]/i,
    /^(?:INFO|DEBUG|WARN|ERROR|TRACE|FATAL)[: ]/,
    /^\w{3} {1,2}\d{1,2} \d{2}:\d{2}:\d{2}\b/, // syslog
];
/** Context lines kept before each trouble line. */
const BEFORE = 2;
/** Tail lines always kept: how the log ended. */
const TAIL = 15;
export function detectLog(text, hint) {
    const path = hint.path?.toLowerCase() ?? '';
    const pathIsLog = path.endsWith('.log') || path.includes('/log');
    const sample = splitLines(text).slice(0, 200);
    if (sample.length < 20)
        return false;
    const shaped = sample.filter(line => LOG_SHAPE.some(pattern => pattern.test(line))).length;
    // Most lines carry a timestamp or level: certain. A log-named file with some
    // shaped lines: also enough.
    if (shaped >= sample.length * 0.6)
        return true;
    return pathIsLog && shaped >= sample.length * 0.2;
}
export function reduceLog(text, hint, budget) {
    const lines = splitLines(text);
    const isTrouble = (line) => TROUBLE.some(pattern => pattern.test(line));
    const troubleCount = lines.filter(isTrouble).length;
    // All quiet, or all noise: this cut has nothing to say. Size handles it.
    if (troubleCount === 0)
        return null;
    if (troubleCount > lines.length * 0.5)
        return null;
    const keep = new Array(lines.length).fill(false);
    for (let i = 0; i < lines.length; i++) {
        if (!isTrouble(lines[i]))
            continue;
        for (let j = Math.max(0, i - BEFORE); j <= i; j++)
            keep[j] = true;
    }
    for (let i = Math.max(0, lines.length - TAIL); i < lines.length; i++)
        keep[i] = true;
    const keptCount = keep.filter(Boolean).length;
    if (keptCount === lines.length)
        return null;
    const out = [];
    let dropChars = 0;
    let dropLines = 0;
    const flush = () => {
        if (dropLines > 0)
            out.push(omissionMarker(dropChars, dropLines) + ' (routine)');
        dropChars = 0;
        dropLines = 0;
    };
    for (let i = 0; i < lines.length; i++) {
        if (keep[i]) {
            flush();
            out.push(lines[i]);
        }
        else {
            dropChars += lines[i].length + 1;
            dropLines++;
        }
    }
    flush();
    const body = out.join('\n');
    const base = {
        inputChars: text.length,
        inputLines: lines.length,
        keptLines: keptCount,
        droppedLines: lines.length - keptCount,
    };
    // Still too big: keep the tail. The newest trouble is the trouble in force.
    if (body.length > budget.maxChars || splitLines(body).length > budget.maxLines) {
        const capped = reduceBySize(body, { ...hint, tool: 'bash' }, budget, 'tail');
        return {
            content: capped.content,
            reduced: true,
            strategy: 'log+size',
            note: `kept ${keptCount.toLocaleString('en-US')} of ${lines.length.toLocaleString('en-US')} lines (errors, warnings, ending), then cut to the newest`,
            stats: {
                ...base,
                outputChars: capped.content.length,
                outputLines: splitLines(capped.content).length,
            },
        };
    }
    return {
        content: body,
        reduced: true,
        strategy: 'log',
        note: `kept ${keptCount.toLocaleString('en-US')} of ${lines.length.toLocaleString('en-US')} lines: errors, warnings and the ending, routine lines dropped`,
        stats: {
            ...base,
            outputChars: body.length,
            outputLines: splitLines(body).length,
        },
    };
}
export const logReducer = {
    name: 'log',
    detect: detectLog,
    reduce: reduceLog,
};
export default logReducer;
//# sourceMappingURL=log.js.map