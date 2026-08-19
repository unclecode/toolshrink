/**
 * Diff output: keep the changes, shrink the context around them.
 *
 * A unified diff is mostly unchanged context: three lines around every hunk by
 * default, and often whole hunks of a large file that moved. The changed lines
 * (starting with + or -) are the reason the diff exists.
 *
 * This cut keeps every changed line, every file header and hunk header, and
 * one context line on each side of a change. It drops the rest, counted.
 * Structure is preserved, so the result still reads as a diff.
 */
import type { Budget, Hint, Reducer, Reduction } from '../types.js';
export declare function detectDiff(text: string, hint: Hint): boolean;
export declare function reduceDiff(text: string, hint: Hint, budget: Budget): Reduction | null;
export declare const diffReducer: Reducer;
export default diffReducer;
