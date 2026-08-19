/**
 * Stack traces: keep the message and YOUR frames, collapse the framework's.
 *
 * A deep exception prints dozens of frames, and most sit inside node_modules,
 * site-packages or the runtime. The lines a model needs are the error message
 * and the frames that point into the user's own code. The rest is kept as a
 * count, plus the first and last frames so the shape of the call remains.
 */
import type { Budget, Hint, Reducer, Reduction } from '../types.js';
export declare function detectStacktrace(text: string, _hint: Hint): boolean;
export declare function reduceStacktrace(text: string, hint: Hint, budget: Budget): Reduction | null;
export declare const stacktraceReducer: Reducer;
export default stacktraceReducer;
