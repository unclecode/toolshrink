/**
 * The fallback: reduce by size when no shape was recognised.
 *
 * This is the three agents' behaviour combined, and it must be at least as good
 * as each of them alone, because it runs whenever a content reducer declines.
 *
 *   pi        two limits (lines and bytes), whichever is reached first;
 *             never return a partial line; report what was cut
 *   Codex     symmetric head and tail, drop the middle, exact omission count
 *   Harness   never split a surrogate pair; output strictly smaller than input
 *
 * `keep` decides which end survives when only one can. pi taught this: command
 * output ends with its conclusion, a file read starts with its declarations.
 */
import type { Budget, Hint, Reducer, Reduction } from '../types.js';
export type Keep = 'head' | 'tail' | 'both';
/**
 * Which end matters for this tool, before any content is examined.
 * A caller that knows better passes `keep` directly to `reduceBySize`.
 */
export declare function defaultKeep(hint: Hint): Keep;
export declare function reduceBySize(text: string, hint: Hint, budget: Budget, keep?: Keep): Reduction;
export declare const sizeReducer: Reducer;
export default sizeReducer;
