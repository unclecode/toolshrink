/**
 * Log output: keep the problems and the ending, drop the routine.
 *
 * A log's information lives in two places: the lines that report trouble
 * (error, warn, fatal, exceptions) and the last lines, which say how things
 * stood when the log stopped. The bulk in between is repetitive info/debug.
 *
 * This cut keeps every trouble line with a little context before it (the lines
 * that led up to the problem), plus the tail of the log. It refuses to run
 * unless the text clearly looks like a log AND the trouble lines are a small
 * minority, because a log that is all errors gains nothing from this.
 */
import type { Budget, Hint, Reducer, Reduction } from '../types.js';
export declare function detectLog(text: string, hint: Hint): boolean;
export declare function reduceLog(text: string, hint: Hint, budget: Budget): Reduction | null;
export declare const logReducer: Reducer;
export default logReducer;
