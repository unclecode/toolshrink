/**
 * Table data (CSV, TSV): keep the header and a few rows, count the rest.
 *
 * The same idea as the json cut, for the other shape data arrives in. A model
 * asked about a 50,000-row export needs the columns, the row count, and enough
 * rows to see the format. It does not need row 24,000.
 *
 * Column widths are preserved by leaving the rows exactly as they were, so the
 * result is still parseable as the same format.
 */
import { splitLines } from '../text.js';
/** Rows shown from the start, and from the end. */
const HEAD = 5;
const TAIL = 2;
/** Below this many rows there is nothing to gain. */
const MIN_ROWS = 12;
function delimiterOf(lines) {
    const sample = lines.slice(0, 20);
    for (const delimiter of [',', '\t', ';', '|']) {
        const counts = sample.map(l => l.split(delimiter).length - 1);
        const first = counts[0] ?? 0;
        // A table has the same number of separators on every line, and at least one.
        if (first >= 1 && counts.every(c => c === first))
            return delimiter;
    }
    return null;
}
export function detectCsv(text, hint) {
    const path = hint.path?.toLowerCase() ?? '';
    const lines = splitLines(text);
    if (lines.length < MIN_ROWS)
        return false;
    const delimiter = delimiterOf(lines);
    if (!delimiter)
        return false;
    if (path.endsWith('.csv') || path.endsWith('.tsv'))
        return true;
    // Without a helpful path, require many consistent rows before claiming this.
    return lines.length >= 30;
}
export function reduceCsv(text, hint, budget) {
    const lines = splitLines(text);
    const delimiter = delimiterOf(lines);
    if (!delimiter || lines.length < MIN_ROWS)
        return null;
    const header = lines[0];
    const rows = lines.slice(1);
    const columns = header.split(delimiter).length;
    const head = rows.slice(0, HEAD);
    const tail = rows.slice(-TAIL);
    const hidden = rows.length - head.length - tail.length;
    if (hidden <= 0)
        return null;
    const name = delimiter === '\t' ? 'TSV' : 'CSV';
    const body = [
        header,
        ...head,
        `... ${hidden.toLocaleString('en-US')} more rows omitted ...`,
        ...tail,
        '',
        `${name}: ${rows.length.toLocaleString('en-US')} data rows, ${columns} columns`,
    ].join('\n');
    if (body.length >= text.length)
        return null;
    const stats = {
        inputChars: text.length,
        inputLines: lines.length,
        outputChars: body.length,
        outputLines: splitLines(body).length,
        keptLines: head.length + tail.length + 1,
        droppedLines: hidden,
    };
    // A single row can be enormous; the size fallback caps that case.
    if (body.length > budget.maxChars || splitLines(body).length > budget.maxLines) {
        return {
            content: body.slice(0, budget.maxChars),
            reduced: true,
            strategy: 'csv+size',
            note: `${rows.length.toLocaleString('en-US')} rows sampled to ${HEAD} head and ${TAIL} tail, then cut to fit`,
            stats: { ...stats, outputChars: Math.min(body.length, budget.maxChars) },
        };
    }
    return {
        content: body,
        reduced: true,
        strategy: 'csv',
        note: `${rows.length.toLocaleString('en-US')} rows sampled to ${HEAD} from the start and ${TAIL} from the end, with the header and a row count`,
        stats,
    };
}
export const csvReducer = {
    name: 'csv',
    detect: detectCsv,
    reduce: reduceCsv,
};
export default csvReducer;
//# sourceMappingURL=csv.js.map