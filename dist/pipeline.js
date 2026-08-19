/**
 * The pipeline: pick a cut, apply it, spill the original.
 *
 * Cuts are plugins. Each lives in its own file under `reducers/` and default-
 * exports a `Reducer`. The file name is the cut name. Users add a cut by
 * dropping a file into their own directory and passing it to `loadReducers`;
 * they never edit this package.
 *
 * Order matters and is explicit: the first reducer whose `detect` says yes and
 * whose `reduce` returns a result wins. The `size` fallback runs last and
 * always succeeds, so `shrink` always returns text within budget.
 */
import { readdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { countLines } from './text.js';
import { DEFAULT_BUDGET } from './types.js';
import { sizeReducer } from './reducers/size.js';
import testsReducer from './reducers/tests.js';
import diffReducer from './reducers/diff.js';
import jsonReducer from './reducers/json.js';
import buildReducer from './reducers/build.js';
import logReducer from './reducers/log.js';
import treeReducer from './reducers/tree.js';
import stacktraceReducer from './reducers/stacktrace.js';
import repeatReducer from './reducers/repeat.js';
import lintReducer from './reducers/lint.js';
import installReducer from './reducers/install.js';
import csvReducer from './reducers/csv.js';
import gitlogReducer from './reducers/gitlog.js';
/**
 * The built-in cuts, in the order they are tried. Most-certain detectors
 * first: a diff and JSON have strict shapes, tests have strong markers, a log
 * is looser, a tree is loosest. The size fallback is not in this list; the
 * pipeline runs it when every cut declines.
 */
export const BUILTIN_REDUCERS = [
    diffReducer,
    jsonReducer,
    csvReducer,
    testsReducer,
    buildReducer,
    lintReducer,
    stacktraceReducer,
    gitlogReducer,
    installReducer,
    logReducer,
    treeReducer,
    repeatReducer,
];
export function shrink(text, hint = {}, options = {}) {
    const budget = { ...DEFAULT_BUDGET, ...options.budget };
    const inputLines = countLines(text);
    const fits = text.length <= budget.maxChars && inputLines <= budget.maxLines;
    if (fits && budget.maxLineChars <= 0) {
        return {
            content: text,
            reduced: false,
            strategy: 'none',
            note: '',
            stats: {
                inputChars: text.length, inputLines,
                outputChars: text.length, outputLines: inputLines,
            },
        };
    }
    const reduction = runReducers(text, hint, budget, options);
    if (!reduction.reduced || !options.spill)
        return reduction;
    // Save the complete original and tell the model how to ask for it.
    const locator = options.spill.save(text, { ...(hint.tool !== undefined ? { tool: hint.tool } : {}) });
    const retrievalHint = `[full output saved as ${locator}: ${reduction.note}]`;
    return {
        ...reduction,
        content: `${reduction.content}\n${retrievalHint}`,
        note: `${reduction.note}; full original at ${locator}`,
    };
}
function runReducers(text, hint, budget, options) {
    const pool = [...(options.extra ?? []), ...BUILTIN_REDUCERS];
    const ordered = options.only
        ? options.only
            .map(name => pool.find(reducer => reducer.name === name))
            .filter((reducer) => reducer !== undefined)
        : pool.filter(reducer => !(options.disable ?? []).includes(reducer.name));
    for (const reducer of ordered) {
        if (!reducer.detect(text, hint))
            continue;
        const result = reducer.reduce(text, hint, budget);
        if (result)
            return result;
    }
    return sizeReducer.reduce(text, hint, budget);
}
/**
 * Load user cuts from a directory. Each `.js` or `.mjs` file must default-
 * export a `Reducer`; the file name becomes the expected cut name. A file that
 * exports something else fails loud with its path, never silently.
 */
export async function loadReducers(dir) {
    const reducers = [];
    for (const entry of readdirSync(dir).sort()) {
        const ext = extname(entry);
        if (ext !== '.js' && ext !== '.mjs')
            continue;
        const path = join(dir, entry);
        const module = await import(pathToFileURL(path).href);
        const candidate = module.default;
        if (!candidate ||
            typeof candidate.name !== 'string' ||
            typeof candidate.detect !== 'function' ||
            typeof candidate.reduce !== 'function') {
            throw new Error(`${path}: default export is not a Reducer (needs name, detect, reduce)`);
        }
        const expected = basename(entry, ext);
        if (candidate.name !== expected) {
            throw new Error(`${path}: reducer name "${candidate.name}" must match file name "${expected}"`);
        }
        reducers.push(candidate);
    }
    return reducers;
}
//# sourceMappingURL=pipeline.js.map