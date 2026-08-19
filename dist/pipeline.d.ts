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
import type { Budget, Hint, Reducer, Reduction } from './types.js';
import type { SpillStore } from './spill.js';
/**
 * The built-in cuts, in the order they are tried. Most-certain detectors
 * first: a diff and JSON have strict shapes, tests have strong markers, a log
 * is looser, a tree is loosest. The size fallback is not in this list; the
 * pipeline runs it when every cut declines.
 */
export declare const BUILTIN_REDUCERS: readonly Reducer[];
export interface ShrinkOptions {
    readonly budget?: Partial<Budget>;
    /** Try only these cuts, in this order. Names, e.g. ["tests", "diff"]. */
    readonly only?: readonly string[];
    /** Skip these cuts. Ignored when `only` is set. */
    readonly disable?: readonly string[];
    /** Extra cuts, tried BEFORE the built-ins, in the order given. */
    readonly extra?: readonly Reducer[];
    /** When set, the full original is saved and the note carries its locator. */
    readonly spill?: SpillStore;
}
export declare function shrink(text: string, hint?: Hint, options?: ShrinkOptions): Reduction;
/**
 * Load user cuts from a directory. Each `.js` or `.mjs` file must default-
 * export a `Reducer`; the file name becomes the expected cut name. A file that
 * exports something else fails loud with its path, never silently.
 */
export declare function loadReducers(dir: string): Promise<Reducer[]>;
