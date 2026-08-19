/**
 * Big JSON: keep the shape, sample the repetition.
 *
 * A large JSON result is almost always large in one way: an array of records
 * that look alike. Ten thousand rows teach the model nothing that three rows
 * and a count do not. Objects are kept whole; arrays over a small length are
 * cut to their first records plus a counted marker.
 *
 * The output is VALID JSON with one extension: a marker string inside each
 * shortened array. The model reads it as data, and the note explains it.
 */
import type { Budget, Hint, Reducer, Reduction } from '../types.js';
export declare function detectJson(text: string, hint: Hint): boolean;
export declare function reduceJson(text: string, hint: Hint, budget: Budget): Reduction | null;
export declare const jsonReducer: Reducer;
export default jsonReducer;
