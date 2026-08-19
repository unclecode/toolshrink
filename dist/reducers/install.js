/**
 * Package installer output: keep the outcome, drop the progress.
 *
 * npm, pip, cargo and pnpm print a line per package, a progress bar per
 * download, and then the three things anyone needs: what got installed, what
 * is vulnerable, and whether it worked. The bulk is fetch chatter that says
 * nothing once it has succeeded.
 */
import { splitLines, omissionMarker } from '../text.js';
import { reduceBySize } from './size.js';
/** Lines worth keeping whatever else is in the output. */
const KEEP = [
    /\b(?:added|removed|changed|audited)\s+\d+\s+packages?/i, // npm
    /\d+\s+vulnerabilit(?:y|ies)/i, // npm audit
    /^Successfully installed /, // pip
    /^\s*(?:Finished|Compiling|error|warning)\b/, // cargo, kept selectively below
    /\b(?:ERROR|error|failed|Failed|FAILED)\b/,
    /\bWARN(?:ING)?\b/,
    /^\s*Packages: [+-]/, // pnpm
    /\bdeprecated\b/i,
    /\bconflict|ERESOLVE|incompatible\b/i,
    /^Requirement already satisfied: .*(?:\n|$)/, // pip, collapsed below
    /^(?:Done|done) in [\d.]+m?s/, // pnpm, yarn
    /\bup to date\b/i,
];
/** Pure progress: fetching, resolving, downloading, bars. */
const NOISE = [
    /^\s*(?:Downloading|Collecting|Using cached|Fetching|Resolving|Progress|Building wheel|Preparing)/i,
    /^\s*[|/\\-]\s/, // spinner frames
    /\[\s*\d+\/\d+\s*\]/, // [12/340]
    /^\s*(?:Compiling|Downloaded)\s+\S+\s+v[\d.]/, // cargo per-crate
    /^\s*\d+%\s*\[/, // progress bars
    /^Requirement already satisfied:/,
];
const matches = (patterns, line) => patterns.some(p => p.test(line));
export function detectInstall(text, hint) {
    const command = hint.command?.toLowerCase() ?? '';
    const commandInstalls = /\b(?:npm\s+(?:i|install|ci)|pnpm\s+(?:i|install|add)|yarn\s+(?:add|install)|pip\s+install|cargo\s+(?:add|install|fetch)|poetry\s+(?:add|install)|bundle\s+install|go\s+get)\b/.test(command);
    const lines = splitLines(text);
    if (lines.length < 15)
        return false;
    const sample = lines.slice(0, 300);
    const noise = sample.filter(l => matches(NOISE, l)).length;
    const signal = sample.filter(l => matches(KEEP, l)).length;
    if (commandInstalls && (noise + signal) >= 3)
        return true;
    // Without a command hint, require the shape to be unmistakable.
    return noise >= 15 && noise >= sample.length * 0.4 && signal >= 1;
}
export function reduceInstall(text, hint, budget) {
    const lines = splitLines(text);
    const keep = lines.map(line => matches(KEEP, line) && !matches(NOISE, line));
    const kept = keep.filter(Boolean).length;
    if (kept === 0)
        return null;
    if (kept === lines.length)
        return null;
    const out = [];
    let dropChars = 0;
    let dropLines = 0;
    const flush = () => {
        if (dropLines > 0)
            out.push(omissionMarker(dropChars, dropLines) + ' (progress)');
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
    if (body.length >= text.length)
        return null;
    const base = {
        inputChars: text.length,
        inputLines: lines.length,
        keptLines: kept,
        droppedLines: lines.length - kept,
    };
    // Still too big: the END carries the summary and the audit result.
    if (body.length > budget.maxChars || splitLines(body).length > budget.maxLines) {
        const capped = reduceBySize(body, { ...hint, tool: 'bash' }, budget, 'tail');
        return {
            content: capped.content,
            reduced: true,
            strategy: 'install+size',
            note: `kept ${kept} of ${lines.length} lines (summary, warnings, errors), then cut to the end`,
            stats: { ...base, outputChars: capped.content.length, outputLines: splitLines(capped.content).length },
        };
    }
    return {
        content: body,
        reduced: true,
        strategy: 'install',
        note: `kept ${kept} of ${lines.length.toLocaleString('en-US')} lines: summary, versions, warnings and errors; fetch progress dropped`,
        stats: { ...base, outputChars: body.length, outputLines: splitLines(body).length },
    };
}
export const installReducer = {
    name: 'install',
    detect: detectInstall,
    reduce: reduceInstall,
};
export default installReducer;
//# sourceMappingURL=install.js.map