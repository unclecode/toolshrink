/**
 * Compiler and build output: keep the errors, drop the progress.
 *
 * A build prints progress, then the parts that matter: errors and warnings
 * with a file and line, and a closing summary. tsc, cargo, gcc and webpack
 * each have their own spelling of "error at file:line", but the shape is
 * shared: a problem line, then a few lines of detail under it.
 */
import type { Budget, Hint, Reducer, Reduction } from '../types.js';
export declare function detectBuild(text: string, hint: Hint): boolean;
export declare function reduceBuild(text: string, hint: Hint, budget: Budget): Reduction | null;
export declare const buildReducer: Reducer;
export default buildReducer;
