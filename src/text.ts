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
export function splitLines(text: string): string[] {
  if (text.length === 0) return []
  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

export function countLines(text: string): number {
  return splitLines(text).length
}

/**
 * Codex's marker, with its exact wording, extended to report lines too.
 * The model is told how much it lost, so it can decide to ask for the rest.
 */
export function omissionMarker(chars: number, lines?: number): string {
  const parts = [`${chars.toLocaleString('en-US')} characters`]
  if (lines !== undefined && lines > 0) parts.push(`${lines.toLocaleString('en-US')} lines`)
  return `... ${parts.join(', ')} omitted ...`
}

/**
 * Cut a string to at most `limit` UTF-16 code units without splitting a
 * surrogate pair.
 *
 * A code point outside the Basic Multilingual Plane (an emoji, many CJK
 * extension characters) is stored as two UTF-16 units. Cutting between them
 * produces an unpaired half that renders as a replacement character and can
 * break a JSON encoder downstream. Harness guards against this and so do we.
 */
export function sliceSafely(text: string, limit: number): string {
  if (limit <= 0) return ''
  if (text.length <= limit) return text
  const code = text.charCodeAt(limit - 1)
  // A high surrogate at the last kept position has its pair at `limit`.
  const isHighSurrogate = code >= 0xd800 && code <= 0xdbff
  return text.slice(0, isHighSurrogate ? limit - 1 : limit)
}

/** Cap one over-long line, marking what went. pi does this for grep matches. */
export function capLine(line: string, maxChars: number): string {
  if (maxChars <= 0 || line.length <= maxChars) return line
  const dropped = line.length - maxChars
  return `${sliceSafely(line, maxChars)} ... +${dropped.toLocaleString('en-US')} chars`
}

/** Apply `capLine` to every line. Returns the input when nothing changed. */
export function capLines(text: string, maxChars: number): string {
  if (maxChars <= 0) return text
  const lines = splitLines(text)
  if (!lines.some(line => line.length > maxChars)) return text
  return lines.map(line => capLine(line, maxChars)).join('\n')
}

/**
 * Keep whole lines from the start until a character budget is spent.
 * Returns the kept lines, never a partial one.
 */
export function takeHeadLines(lines: readonly string[], maxChars: number): string[] {
  const kept: string[] = []
  let used = 0
  for (const line of lines) {
    const cost = line.length + 1
    if (used + cost > maxChars) break
    kept.push(line)
    used += cost
  }
  return kept
}

/** The same from the end. Used for command output, whose conclusion matters. */
export function takeTailLines(lines: readonly string[], maxChars: number): string[] {
  const kept: string[] = []
  let used = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] as string
    const cost = line.length + 1
    if (used + cost > maxChars) break
    kept.unshift(line)
    used += cost
  }
  return kept
}
