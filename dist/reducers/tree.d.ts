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
import type { Budget, Hint, Reducer, Reduction } from '../types.js';
export declare function detectTree(text: string, hint: Hint): boolean;
export declare function reduceTree(text: string, hint: Hint, budget: Budget): Reduction | null;
export declare const treeReducer: Reducer;
export default treeReducer;
