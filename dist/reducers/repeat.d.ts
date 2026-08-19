/**
 * Repeated lines: keep one, count the rest.
 *
 * Retry storms, progress spam, polling loops: output where thousands of lines
 * are the same sentence with different numbers. syslog solved this decades ago
 * with "last message repeated N times". This cut does the same, by template:
 * two lines match when they are equal after digits, hex ids and timestamps are
 * masked out.
 *
 * Only CONSECUTIVE runs collapse. Interleaved output stays untouched, because
 * collapsing across distance can reorder meaning.
 */
import type { Budget, Hint, Reducer, Reduction } from '../types.js';
export declare function detectRepeat(text: string, _hint: Hint): boolean;
export declare function reduceRepeat(text: string, hint: Hint, budget: Budget): Reduction | null;
export declare const repeatReducer: Reducer;
export default repeatReducer;
