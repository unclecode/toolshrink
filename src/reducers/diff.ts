/**
 * Diff output: keep the changes, shrink the context around them.
 *
 * A unified diff is mostly unchanged context: three lines around every hunk by
 * default, and often whole hunks of a large file that moved. The changed lines
 * (starting with + or -) are the reason the diff exists.
 *
 * This cut keeps every changed line, every file header and hunk header, and
 * one context line on each side of a change. It drops the rest, counted.
 * Structure is preserved, so the result still reads as a diff.
 */

import type { Budget, Hint, Reducer, Reduction } from '../types.js'
import { splitLines, omissionMarker } from '../text.js'
import { reduceBySize } from './size.js'

/** Lines that carry the diff's structure. Always kept. */
const STRUCTURE = [
  /^diff --git /,
  /^index [0-9a-f]+\.\.[0-9a-f]+/,
  /^(?:---|\+\+\+) /,
  /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/,
  /^(?:new|deleted) file mode /,
  /^rename (?:from|to) /,
  /^Binary files /,
  /^similarity index /,
]

/** Context lines kept on each side of a run of changed lines. */
const CONTEXT = 1

export function detectDiff(text: string, hint: Hint): boolean {
  const command = hint.command?.toLowerCase() ?? ''
  const commandIsDiff = /\b(?:git\s+diff|git\s+show|diff\b)/.test(command)

  const sample = splitLines(text).slice(0, 200)
  const headers = sample.filter(line => /^diff --git |^@@ -\d/.test(line)).length
  const changes = sample.filter(line => /^[+-][^+-]/.test(line) || line === '+' || line === '-').length

  if (headers >= 1 && changes >= 1) return true
  return commandIsDiff && changes >= 2
}

export function reduceDiff(text: string, hint: Hint, budget: Budget): Reduction | null {
  const lines = splitLines(text)
  const keep = new Array<boolean>(lines.length).fill(false)

  const isStructure = (line: string) => STRUCTURE.some(pattern => pattern.test(line))
  const isChange = (line: string) =>
    (line.startsWith('+') && !line.startsWith('+++')) ||
    (line.startsWith('-') && !line.startsWith('---'))

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    if (isStructure(line)) {
      keep[i] = true
      continue
    }
    if (isChange(line)) {
      // The change and its immediate neighbours.
      for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j++) {
        keep[j] = true
      }
    }
  }

  const keptCount = keep.filter(Boolean).length
  if (keptCount === 0) return null
  if (keptCount === lines.length) return null

  const out: string[] = []
  let dropChars = 0
  let dropLines = 0
  const flush = () => {
    if (dropLines > 0) out.push(omissionMarker(dropChars, dropLines) + ' (unchanged)')
    dropChars = 0
    dropLines = 0
  }
  for (let i = 0; i < lines.length; i++) {
    if (keep[i]) {
      flush()
      out.push(lines[i] as string)
    } else {
      dropChars += (lines[i] as string).length + 1
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

  // Still too big: a huge diff is best kept from the head, where the first
  // files' full changes survive, rather than half-keeping everything.
  if (body.length > budget.maxChars || splitLines(body).length > budget.maxLines) {
    const capped = reduceBySize(body, { ...hint, tool: 'read' }, budget, 'head')
    return {
      content: capped.content,
      reduced: true,
      strategy: 'diff+size',
      note: `kept ${keptCount.toLocaleString('en-US')} of ${lines.length.toLocaleString('en-US')} lines (changes and headers), then cut to fit`,
      stats: {
        ...base,
        outputChars: capped.content.length,
        outputLines: splitLines(capped.content).length,
      },
    }
  }

  return {
    content: body,
    reduced: true,
    strategy: 'diff',
    note: `kept ${keptCount.toLocaleString('en-US')} of ${lines.length.toLocaleString('en-US')} lines: changes and headers, unchanged context dropped`,
    stats: {
      ...base,
      outputChars: body.length,
      outputLines: splitLines(body).length,
    },
  }
}

export const diffReducer: Reducer = {
  name: 'diff',
  detect: detectDiff,
  reduce: reduceDiff,
}

export default diffReducer
