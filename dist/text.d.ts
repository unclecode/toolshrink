/**
 * Text helpers shared by every reducer.
 *
 * The safety rules here are borrowed from the three agents I read:
 *   - never return a partial line (pi)
 *   - never split a UTF-16 surrogate pair (DeepSeek Harness)
 *   - say exactly how much was removed (Codex)
 */
/**
 * Split into lines without inventing a trailing empty one.
 *
 * "a\nb\n" is two lines, not three. Getting this wrong makes every line count
 * in every reducer off by one.
 */
export declare function splitLines(text: string): string[];
export declare function countLines(text: string): number;
/**
 * Codex's marker, with its exact wording, extended to report lines too.
 * The model is told how much it lost, so it can decide to ask for the rest.
 */
export declare function omissionMarker(chars: number, lines?: number): string;
/**
 * Cut a string to at most `limit` UTF-16 code units without splitting a
 * surrogate pair.
 *
 * A code point outside the Basic Multilingual Plane (an emoji, many CJK
 * extension characters) is stored as two UTF-16 units. Cutting between them
 * produces an unpaired half that renders as a replacement character and can
 * break a JSON encoder downstream. Harness guards against this and so do we.
 */
export declare function sliceSafely(text: string, limit: number): string;
/** Cap one over-long line, marking what went. pi does this for grep matches. */
export declare function capLine(line: string, maxChars: number): string;
/** Apply `capLine` to every line. Returns the input when nothing changed. */
export declare function capLines(text: string, maxChars: number): string;
/**
 * Keep whole lines from the start until a character budget is spent.
 * Returns the kept lines, never a partial one.
 */
export declare function takeHeadLines(lines: readonly string[], maxChars: number): string[];
/** The same from the end. Used for command output, whose conclusion matters. */
export declare function takeTailLines(lines: readonly string[], maxChars: number): string[];
