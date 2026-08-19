/**
 * git log: keep the recent commits, count the rest, name the authors.
 *
 * A long history answers three questions: what changed lately, how much
 * changed, and who did it. The middle thousand commits answer none of them,
 * and `git log` is a tool an agent reaches for constantly.
 *
 * Works on the default multi-line format and on --oneline.
 */
import type { Budget, Hint, Reducer, Reduction } from '../types.js';
export declare function detectGitLog(text: string, hint: Hint): boolean;
export declare function reduceGitLog(text: string, hint: Hint, budget: Budget): Reduction | null;
export declare const gitlogReducer: Reducer;
export default gitlogReducer;
