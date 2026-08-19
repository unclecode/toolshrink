/**
 * Test output: keep the failures, drop the passes.
 *
 * This is the clearest case for reducing by meaning. A suite of 5,000 passing
 * tests and 3 failures is mostly noise, and the three agents I read would all
 * keep the first and last few thousand characters of it. If the failures sit in
 * the middle, every one of them loses the only lines that mattered.
 *
 * A passing line carries no information beyond its own existence, and the
 * summary already counts them. A failing line is followed by the detail that
 * explains it, so failures are kept as blocks, not as single lines.
 */
import type { Budget, Hint, Reducer, Reduction } from '../types.js';
export declare function detectTestOutput(text: string, hint: Hint): boolean;
export declare function reduceTestOutput(text: string, hint: Hint, budget: Budget): Reduction | null;
export declare const testsReducer: Reducer;
export default testsReducer;
