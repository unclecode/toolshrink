/**
 * The shared contract. Every reducer takes text and returns smaller text.
 * Nothing here knows what an agent is, so the same reducers work in any host.
 */
/** What the caller knows about where the text came from. All fields optional. */
export interface Hint {
    /** The tool that produced it: "bash", "read", "grep". */
    readonly tool?: string;
    /** The command, when the tool ran one. Helps a detector decide fast. */
    readonly command?: string;
    /** The file path, when the text is a file. Its extension is a strong hint. */
    readonly path?: string;
    /** True when the tool reported failure. Failures change what matters. */
    readonly failed?: boolean;
}
export interface Budget {
    /** Give up reducing above this many characters. */
    readonly maxChars: number;
    /** And above this many lines. Whichever is reached first wins (from pi). */
    readonly maxLines: number;
    /** Cap one very long line at this width, 0 to leave lines alone (from pi). */
    readonly maxLineChars: number;
}
export declare const DEFAULT_BUDGET: Budget;
export interface Reduction {
    /** The text to give the model. */
    readonly content: string;
    /** False when the input already fit and content is the input unchanged. */
    readonly reduced: boolean;
    /** Which reducer ran. "none" when nothing was needed. */
    readonly strategy: string;
    /** One line a human can read in a log, and the model can read in context. */
    readonly note: string;
    readonly stats: ReductionStats;
}
export interface ReductionStats {
    readonly inputChars: number;
    readonly inputLines: number;
    readonly outputChars: number;
    readonly outputLines: number;
    /** Lines the reducer judged worth keeping. Undefined for the size fallback. */
    readonly keptLines?: number;
    /** Lines dropped as noise. Undefined for the size fallback. */
    readonly droppedLines?: number;
}
/**
 * One content shape.
 *
 * `detect` must be cheap and certain. It runs on every oversized result, and a
 * wrong match is worse than no match: the size fallback loses the middle, but a
 * wrong reducer can throw away the one line that mattered. When unsure, return
 * false and let the fallback run.
 */
export interface Reducer {
    /** Stable name, reported in `Reduction.strategy` and used to disable one. */
    readonly name: string;
    /** Cheap and certain. Read the first lines, not the whole text. */
    detect(text: string, hint: Hint): boolean;
    /** Return null to decline after a closer look. The next reducer then tries. */
    reduce(text: string, hint: Hint, budget: Budget): Reduction | null;
}
