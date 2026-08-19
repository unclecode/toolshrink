/**
 * Table data (CSV, TSV): keep the header and a few rows, count the rest.
 *
 * The same idea as the json cut, for the other shape data arrives in. A model
 * asked about a 50,000-row export needs the columns, the row count, and enough
 * rows to see the format. It does not need row 24,000.
 *
 * Column widths are preserved by leaving the rows exactly as they were, so the
 * result is still parseable as the same format.
 */
import type { Budget, Hint, Reducer, Reduction } from '../types.js';
export declare function detectCsv(text: string, hint: Hint): boolean;
export declare function reduceCsv(text: string, hint: Hint, budget: Budget): Reduction | null;
export declare const csvReducer: Reducer;
export default csvReducer;
