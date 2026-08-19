/**
 * Linter output: group by rule, keep the worst files, drop the repetition.
 *
 * A lint run over a large project prints thousands of lines, and the same rule
 * fires hundreds of times. The model does not need every occurrence. It needs
 * to know which rules fire, how often, and where the damage concentrates.
 *
 * Handles the three common shapes: eslint stylish (a file header, then
 * indented `line:col level message rule-name`), and the one-line-per-problem
 * form used by ruff, clippy and eslint compact.
 */
import type { Budget, Hint, Reducer, Reduction } from '../types.js';
export declare function detectLint(text: string, hint: Hint): boolean;
export declare function reduceLint(text: string, hint: Hint, budget: Budget): Reduction | null;
export declare const lintReducer: Reducer;
export default lintReducer;
