/**
 * Package installer output: keep the outcome, drop the progress.
 *
 * npm, pip, cargo and pnpm print a line per package, a progress bar per
 * download, and then the three things anyone needs: what got installed, what
 * is vulnerable, and whether it worked. The bulk is fetch chatter that says
 * nothing once it has succeeded.
 */
import type { Budget, Hint, Reducer, Reduction } from '../types.js';
export declare function detectInstall(text: string, hint: Hint): boolean;
export declare function reduceInstall(text: string, hint: Hint, budget: Budget): Reduction | null;
export declare const installReducer: Reducer;
export default installReducer;
