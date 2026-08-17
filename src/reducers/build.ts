/**
 * Compiler and build output: keep the errors, drop the progress.
 *
 * A build prints progress, then the parts that matter: errors and warnings
 * with a file and line, and a closing summary. tsc, cargo, gcc and webpack
 * each have their own spelling of "error at file:line", but the shape is
 * shared: a problem line, then a few lines of detail under it.
 */

import type { Budget, Hint, Reducer, Reduction } from '../types.js'
import { splitLines, omissionMarker } from '../text.js'
import { reduceBySize } from './size.js'

/** A line that reports one problem, in each compiler's spelling. */
const PROBLEM = [
  /^[^\s].*\(\d+,\d+\): (?:error|warning) TS\d+:/,       // tsc
  /^(?:error|warning)(?:\[[A-Z]\d+\])?:/,                 // cargo, rustc
  /^[^\s:]+:\d+(?::\d+)?: (?:fatal error|error|warning):/, // gcc, clang, go
  /^(?:ERROR|WARNING) in /,                               // webpack
  /^\s*(?:✘|✖|x) \[ERROR\]/,                              // esbuild
]

/** A line that summarises the build. Always kept. */
const SUMMARY = [
  /^Found \d+ errors? /,                                  // tsc
  /^error: could not compile/,                            // cargo
  /(?:^|\s)\d+ errors?, \d+ warnings?/,
  /^webpack \d.* compiled/,
  /^(?:Build|Compilation) (?:failed|succeeded|complete)/i,
  /^error: aborting due to/,                              // rustc
]

/** Detail lines kept under a problem: the code frame, the note, the caret. */
const PROBLEM_CONTEXT_LINES = 6

const matches = (patterns: readonly RegExp[], line: string) => patterns.some(p => p.test(line))

export function detectBuild(text: string, hint: Hint): boolean {
  const command = hint.command?.toLowerCase() ?? ''
  const commandBuilds =
    /\b(?:tsc\b|cargo\s+(?:build|check)|go\s+build|make\b|gcc|clang|g\+\+|webpack|vite\s+build|esbuild|rustc)/.test(command)

  // Problems appear anywhere, summaries at the END. Sample both.
  const lines = splitLines(text)
  const sample = lines.length > 500
    ? [...lines.slice(0, 400), ...lines.slice(-100)]
    : lines
  let problems = 0
  let summaries = 0
  for (const line of sample) {
    if (matches(SUMMARY, line)) summaries++
    else if (matches(PROBLEM, line)) problems++
  }

  if (summaries > 0 && problems > 0) return true
  if (commandBuilds && problems >= 1) return true
  return problems >= 5
}

export function reduceBuild(text: string, hint: Hint, budget: Budget): Reduction | null {
  const lines = splitLines(text)
  const keep = new Array<boolean>(lines.length).fill(false)

  let contextLeft = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    if (matches(SUMMARY, line)) {
      keep[i] = true
      contextLeft = 0
      continue
    }
    if (matches(PROBLEM, line)) {
      keep[i] = true
      contextLeft = PROBLEM_CONTEXT_LINES
      continue
    }
    if (contextLeft > 0) {
      keep[i] = true
      contextLeft--
    }
  }

  const keptCount = keep.filter(Boolean).length
  if (keptCount === 0) return null
  if (keptCount === lines.length) return null

  const out: string[] = []
  let dropChars = 0
  let dropLines = 0
  const flush = () => {
    if (dropLines > 0) out.push(omissionMarker(dropChars, dropLines))
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

  // Still too big: the FIRST errors matter most, later ones often cascade.
  if (body.length > budget.maxChars || splitLines(body).length > budget.maxLines) {
    const capped = reduceBySize(body, { ...hint, tool: 'read' }, budget, 'head')
    return {
      content: capped.content,
      reduced: true,
      strategy: 'build+size',
      note: `kept ${keptCount.toLocaleString('en-US')} of ${lines.length.toLocaleString('en-US')} lines (errors, warnings, summary), then cut to the first`,
      stats: { ...base, outputChars: capped.content.length, outputLines: splitLines(capped.content).length },
    }
  }

  return {
    content: body,
    reduced: true,
    strategy: 'build',
    note: `kept ${keptCount.toLocaleString('en-US')} of ${lines.length.toLocaleString('en-US')} lines: errors, warnings and summary, build progress dropped`,
    stats: { ...base, outputChars: body.length, outputLines: splitLines(body).length },
  }
}

export const buildReducer: Reducer = {
  name: 'build',
  detect: detectBuild,
  reduce: reduceBuild,
}

export default buildReducer
