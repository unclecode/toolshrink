/**
 * Stack traces: keep the message and YOUR frames, collapse the framework's.
 *
 * A deep exception prints dozens of frames, and most sit inside node_modules,
 * site-packages or the runtime. The lines a model needs are the error message
 * and the frames that point into the user's own code. The rest is kept as a
 * count, plus the first and last frames so the shape of the call remains.
 */

import type { Budget, Hint, Reducer, Reduction } from '../types.js'
import { splitLines, omissionMarker } from '../text.js'
import { reduceBySize } from './size.js'

/** One stack frame, in the common spellings. */
const FRAME = [
  /^\s+at .+ \(.+\)$/,            // node, java: "  at fn (file:1:2)"
  /^\s+at [^\s(]+(?::\d+){1,2}$/, // node: "  at file:1:2"
  /^\s*File ".+", line \d+/,      // python
  /^\s+from .+:\d+:in /,          // ruby
]

/** A frame inside dependency or runtime code, safe to collapse. */
const FOREIGN = [
  /node_modules/,
  /site-packages|dist-packages/,
  /node:internal|internal\/modules/,
  /\/usr\/lib\/|\/usr\/local\/lib\//,
  /<anonymous>/,
]

/** Frames always kept at each end of a collapsed run. */
const EDGE_FRAMES = 2

const isFrame = (line: string) => FRAME.some(p => p.test(line))
const isForeign = (line: string) => FOREIGN.some(p => p.test(line))

export function detectStacktrace(text: string, _hint: Hint): boolean {
  const sample = splitLines(text).slice(0, 400)
  const frames = sample.filter(isFrame).length
  const hasHeader = sample.some(line =>
    /Traceback \(most recent call last\)|^\w*(?:Error|Exception)[:\s]|^Caused by: /.test(line))
  // Enough frames to be worth touching; a 5-frame trace should stay whole.
  return hasHeader && frames >= 12
}

export function reduceStacktrace(text: string, hint: Hint, budget: Budget): Reduction | null {
  const lines = splitLines(text)

  // A foreign frame is dropped together with the indented code-context lines
  // under it (Python prints "File ..." then the source line). Everything else
  // is kept: messages, headers, and frames in the user's own files.
  const keep = new Array<boolean>(lines.length).fill(true)
  for (let f = 0; f < lines.length; f++) {
    const line = lines[f] as string
    if (!(isFrame(line) && isForeign(line))) continue
    keep[f] = false
    let next = f + 1
    while (next < lines.length && /^\s/.test(lines[next] as string) && !isFrame(lines[next] as string)) {
      keep[next] = false
      next++
    }
  }

  // Re-open the edges of each collapsed run, so the call shape survives.
  let i = 0
  while (i < lines.length) {
    if (keep[i]) {
      i++
      continue
    }
    let end = i
    while (end < lines.length && !keep[end]) end++
    for (let j = i; j < Math.min(i + EDGE_FRAMES, end); j++) keep[j] = true
    for (let j = Math.max(end - EDGE_FRAMES, i + EDGE_FRAMES); j < end; j++) keep[j] = true
    i = end
  }

  const keptCount = keep.filter(Boolean).length
  if (keptCount === lines.length) return null

  const out: string[] = []
  let dropChars = 0
  let dropLines = 0
  const flush = () => {
    if (dropLines > 0) out.push(`    ${omissionMarker(dropChars, dropLines)} (dependency frames)`)
    dropChars = 0
    dropLines = 0
  }
  for (let j = 0; j < lines.length; j++) {
    if (keep[j]) {
      flush()
      out.push(lines[j] as string)
    } else {
      dropChars += (lines[j] as string).length + 1
      dropLines++
    }
  }
  flush()
  const body = out.join('\n')

  const base = {
    inputChars: text.length,
    inputLines: lines.length,
    keptLines: keptCount,
    droppedLines: lines.length - keptCount,
  }

  // Still too big: in Python the message is LAST, in JS it is first. Keeping
  // both ends preserves the message wherever the language puts it.
  if (body.length > budget.maxChars || splitLines(body).length > budget.maxLines) {
    const capped = reduceBySize(body, hint, budget, 'both')
    return {
      content: capped.content,
      reduced: true,
      strategy: 'stacktrace+size',
      note: `dependency frames collapsed, then cut to both ends`,
      stats: { ...base, outputChars: capped.content.length, outputLines: splitLines(capped.content).length },
    }
  }

  return {
    content: body,
    reduced: true,
    strategy: 'stacktrace',
    note: `kept the message and your frames, ${(lines.length - keptCount).toLocaleString('en-US')} dependency frames collapsed`,
    stats: { ...base, outputChars: body.length, outputLines: splitLines(body).length },
  }
}

export const stacktraceReducer: Reducer = {
  name: 'stacktrace',
  detect: detectStacktrace,
  reduce: reduceStacktrace,
}

export default stacktraceReducer
