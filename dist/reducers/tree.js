/**
 * File listings: keep the structure, collapse the crowds.
 *
 * `ls -R`, `find`, and `tree` output grows with file count, but the model
 * usually needs the layout, not every file. A folder with 400 entries is
 * described as well by its first entries plus "and 388 more" as by the lot.
 *
 * Works on path-per-line output (find) and on ls -R sections. Directories are
 * always kept; files inside one directory are sampled beyond a threshold.
 */
import { splitLines } from '../text.js';
import { reduceBySize } from './size.js';
/** Files shown per directory before the rest collapse into a count. */
const SAMPLE = 8;
export function detectTree(text, hint) {
    const command = hint.command?.toLowerCase() ?? '';
    const commandLists = /\b(?:ls\b|find\b|tree\b|glob\b|dir\b)/.test(command);
    const tool = hint.tool?.toLowerCase() ?? '';
    const toolLists = tool.includes('glob') || tool.includes('ls') || tool.includes('list');
    const sample = splitLines(text).slice(0, 200);
    if (sample.length < 30)
        return false;
    // Path-per-line: most lines look like paths and share a root.
    const pathLike = sample.filter(line => /^\.?\.?\/?[\w.@-]+(?:\/[\w.@-]+)+\/?$/.test(line.trim())).length;
    if (pathLike >= sample.length * 0.8)
        return true;
    // ls -R: section headers ending with a colon.
    const sections = sample.filter(line => /^[^\s].*:$/.test(line)).length;
    if (sections >= 3)
        return true;
    return (commandLists || toolLists) && pathLike >= sample.length * 0.5;
}
export function reduceTree(text, hint, budget) {
    const lines = splitLines(text);
    // Group path-per-line output by its parent directory, preserving first-seen
    // order. ls -R sections group naturally the same way by their header.
    const groups = new Map();
    let currentSection = '';
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '')
            continue;
        if (/^[^\s].*:$/.test(line)) { // an ls -R section header
            currentSection = line;
            if (!groups.has(currentSection))
                groups.set(currentSection, []);
            continue;
        }
        if (currentSection) {
            ;
            groups.get(currentSection).push(line);
            continue;
        }
        const slash = trimmed.lastIndexOf('/');
        const parent = slash > 0 ? trimmed.slice(0, slash) : '.';
        if (!groups.has(parent))
            groups.set(parent, []);
        groups.get(parent).push(line);
    }
    if (groups.size === 0)
        return null;
    const out = [];
    let dropped = 0;
    for (const [group, members] of groups) {
        if (isSectionHeader(group))
            out.push(group);
        if (members.length <= SAMPLE) {
            out.push(...members);
        }
        else {
            out.push(...members.slice(0, SAMPLE));
            out.push(`  ... and ${(members.length - SAMPLE).toLocaleString('en-US')} more in ${group.replace(/:$/, '')}`);
            dropped += members.length - SAMPLE;
        }
    }
    if (dropped === 0)
        return null; // nothing collapsed, no gain
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
        const capped = reduceBySize(body, { ...hint, tool: 'read' }, budget, 'head');
        return {
            content: capped.content,
            reduced: true,
            strategy: 'tree+size',
            note: `directories sampled to ${SAMPLE} entries each, then cut to fit`,
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
        strategy: 'tree',
        note: `directories sampled to ${SAMPLE} entries each; "... and N more" counts the rest`,
        stats: {
            ...base,
            outputChars: body.length,
            outputLines: splitLines(body).length,
        },
    };
}
function isSectionHeader(group) {
    return /:$/.test(group);
}
export const treeReducer = {
    name: 'tree',
    detect: detectTree,
    reduce: reduceTree,
};
export default treeReducer;
//# sourceMappingURL=tree.js.map