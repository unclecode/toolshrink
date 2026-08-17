/**
 * The fallback: reduce by size when no shape was recognised.
 *
 * This is the three agents' behaviour combined, and it must be at least as good
 * as each of them alone, because it runs whenever a content reducer declines.
 *
 *   pi        two limits (lines and bytes), whichever is reached first;
 *             never return a partial line; report what was cut
 *   Codex     symmetric head and tail, drop the middle, exact omission count
 *   Harness   never split a surrogate pair; output strictly smaller than input
 *
 * `keep` decides which end survives when only one can. pi taught this: command
 * output ends with its conclusion, a file read starts with its declarations.
 */

import type { Budget, Hint, Reducer, Reduction } from '../types.js'
import { splitLines, omissionMarker, capLines, takeHeadLines, takeTailLines } from '../text.js'

export type Keep = 'head' | 'tail' | 'both'

/**
 * Which end matters for this tool, before any content is examined.
 * A caller that knows better passes `keep` directly to `reduceBySize`.
 */
export function defaultKeep(hint: Hint): Keep {
  const tool = hint.tool?.toLowerCase() ?? ''
  // Command output: the exit line, the error, the summary are all at the end.
  if (tool.includes('bash') || tool.includes('shell') || tool.includes('exec') || tool.includes('terminal')) {
    return 'tail'
  }
  // Search output: the first matches are as good as any, and there may be
  // thousands. pi caps grep and find from the head for this reason.
  if (tool.includes('grep') || tool.includes('search') || tool.includes('find') || tool.includes('glob')) {
    return 'head'
  }
  // A file read starts with the imports, the signature, the header.
  if (tool.includes('read') || tool.includes('cat') || tool.includes('view')) return 'head'
  return 'both'
}

export function reduceBySize(
  text: string,
  hint: Hint,
  budget: Budget,
  keep: Keep = defaultKeep(hint),
): Reduction {
  const capped = capLines(text, budget.maxLineChars)
  const lines = splitLines(capped)
  const inputChars = text.length
  const inputLines = splitLines(text).length

  const fits = capped.length <= budget.maxChars && lines.length <= budget.maxLines
  if (fits) {
    return {
      content: capped,
      reduced: capped !== text,
      strategy: capped !== text ? 'size:line-cap' : 'none',
      note: capped !== text ? `long lines capped at ${budget.maxLineChars} characters` : '',
      stats: {
        inputChars, inputLines,
        outputChars: capped.length, outputLines: lines.length,
      },
    }
  }

  // Reserve room for the marker so the result cannot exceed the budget.
  const markerAllowance = 80
  const usable = Math.max(0, budget.maxChars - markerAllowance)

  let kept: string[]
  let markerAt: 'start' | 'middle' | 'end'

  if (keep === 'head') {
    kept = limitLines(takeHeadLines(lines, usable), budget.maxLines, 'head')
    markerAt = 'end'
  } else if (keep === 'tail') {
    kept = limitLines(takeTailLines(lines, usable), budget.maxLines, 'tail')
    markerAt = 'start'
  } else {
    // Codex's symmetric split: half the budget to each end, middle dropped.
    const half = Math.floor(usable / 2)
    const halfLines = Math.floor(budget.maxLines / 2)
    const head = limitLines(takeHeadLines(lines, half), halfLines, 'head')
    const tail = limitLines(takeTailLines(lines.slice(head.length), half), halfLines, 'tail')
    kept = [...head, ...tail]
    markerAt = 'middle'
    const droppedLines = lines.length - kept.length
    const body = [
      ...head,
      omissionMarker(charsOf(lines) - charsOf(kept), droppedLines),
      ...tail,
    ].join('\n')
    return finish(body, 'size:head-tail', inputChars, inputLines, lines.length, kept.length)
  }

  const droppedLines = lines.length - kept.length
  const marker = omissionMarker(charsOf(lines) - charsOf(kept), droppedLines)
  const body = markerAt === 'end' ? [...kept, marker].join('\n') : [marker, ...kept].join('\n')
  return finish(body, `size:${keep}`, inputChars, inputLines, lines.length, kept.length)
}

function limitLines(lines: string[], max: number, from: 'head' | 'tail'): string[] {
  if (lines.length <= max) return lines
  return from === 'head' ? lines.slice(0, max) : lines.slice(lines.length - max)
}

function charsOf(lines: readonly string[]): number {
  let total = 0
  for (const line of lines) total += line.length + 1
  return total
}

function finish(
  content: string, strategy: string,
  inputChars: number, inputLines: number,
  countedLines: number, keptLines: number,
): Reduction {
  const droppedLines = countedLines - keptLines
  return {
    content,
    reduced: true,
    strategy,
    note: `kept ${keptLines.toLocaleString('en-US')} of ${countedLines.toLocaleString('en-US')} lines by size`,
    stats: {
      inputChars, inputLines,
      outputChars: content.length,
      outputLines: splitLines(content).length,
      keptLines, droppedLines,
    },
  }
}

export const sizeReducer: Reducer = {
  name: 'size',
  // The fallback always applies. The pipeline only reaches it last.
  detect: () => true,
  reduce: (text, hint, budget) => reduceBySize(text, hint, budget),
}

export default sizeReducer
