/**
 * git log: keep the recent commits, count the rest, name the authors.
 *
 * A long history answers three questions: what changed lately, how much
 * changed, and who did it. The middle thousand commits answer none of them,
 * and `git log` is a tool an agent reaches for constantly.
 *
 * Works on the default multi-line format and on --oneline.
 */
import { splitLines } from '../text.js';
import { reduceBySize } from './size.js';
/** Commits kept from the most recent end. */
const RECENT = 15;
const COMMIT_LINE = /^commit [0-9a-f]{7,40}/;
const ONELINE = /^[0-9a-f]{7,40}\s+\S/;
const AUTHOR_LINE = /^Author:\s*(.+?)\s*</;
export function detectGitLog(text, hint) {
    const command = hint.command?.toLowerCase() ?? '';
    const commandLogs = /\bgit\s+(?:log|shortlog|rev-list)\b/.test(command);
    const lines = splitLines(text);
    if (lines.length < 20)
        return false;
    const sample = lines.slice(0, 300);
    const full = sample.filter(l => COMMIT_LINE.test(l)).length;
    const oneline = sample.filter(l => ONELINE.test(l)).length;
    if (commandLogs && (full + oneline) >= 3)
        return true;
    if (full >= 5)
        return true;
    // --oneline has no other marker, so demand it dominate the sample.
    return oneline >= 20 && oneline >= sample.length * 0.8;
}
export function reduceGitLog(text, hint, budget) {
    const lines = splitLines(text);
    const isFull = lines.some(l => COMMIT_LINE.test(l));
    // Split into commits: either blocks starting with "commit <sha>", or one
    // commit per line in --oneline form.
    const commits = [];
    if (isFull) {
        let current = [];
        for (const line of lines) {
            if (COMMIT_LINE.test(line) && current.length) {
                commits.push(current);
                current = [];
            }
            current.push(line);
        }
        if (current.length)
            commits.push(current);
    }
    else {
        for (const line of lines) {
            if (ONELINE.test(line))
                commits.push([line]);
        }
    }
    if (commits.length <= RECENT + 2)
        return null;
    const authors = new Map();
    for (const commit of commits) {
        for (const line of commit) {
            const m = AUTHOR_LINE.exec(line);
            if (m) {
                const name = m[1].trim();
                authors.set(name, (authors.get(name) ?? 0) + 1);
                break;
            }
        }
    }
    const kept = commits.slice(0, RECENT);
    const hidden = commits.length - kept.length;
    const out = kept.flat();
    out.push('', `... ${hidden.toLocaleString('en-US')} older commits omitted `
        + `(${commits.length.toLocaleString('en-US')} total) ...`);
    if (authors.size) {
        const top = [...authors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
        out.push('', `authors: ` + top.map(([name, count]) => `${name} (${count})`).join(', ')
            + (authors.size > top.length ? `, and ${authors.size - top.length} more` : ''));
    }
    const body = out.join('\n');
    if (body.length >= text.length)
        return null;
    const base = {
        inputChars: text.length,
        inputLines: lines.length,
        keptLines: splitLines(body).length,
        droppedLines: Math.max(0, lines.length - splitLines(body).length),
    };
    if (body.length > budget.maxChars || splitLines(body).length > budget.maxLines) {
        const capped = reduceBySize(body, { ...hint, tool: 'read' }, budget, 'head');
        return {
            content: capped.content,
            reduced: true,
            strategy: 'gitlog+size',
            note: `kept the ${RECENT} newest of ${commits.length.toLocaleString('en-US')} commits, then cut to fit`,
            stats: { ...base, outputChars: capped.content.length, outputLines: splitLines(capped.content).length },
        };
    }
    return {
        content: body,
        reduced: true,
        strategy: 'gitlog',
        note: `kept the ${RECENT} newest of ${commits.length.toLocaleString('en-US')} commits, with a total and the authors`,
        stats: { ...base, outputChars: body.length, outputLines: splitLines(body).length },
    };
}
export const gitlogReducer = {
    name: 'gitlog',
    detect: detectGitLog,
    reduce: reduceGitLog,
};
export default gitlogReducer;
//# sourceMappingURL=gitlog.js.map