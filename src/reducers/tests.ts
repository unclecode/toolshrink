/**
 * Test output: keep the failures, drop the passes.
 *
 * This is the clearest case for reducing by meaning. A suite of 5,000 passing
 * tests and 3 failures is mostly noise, and the three agents I read would all
 * keep the first and last few thousand characters of it. If the failures sit in
 * the middle, every one of them loses the only lines that mattered.
 *
 * A passing line carries no information beyond its own existence, and the
 * summary already counts them. A failing line is followed by the detail that
 * explains it, so failures are kept as blocks, not as single lines.
 */

import type { Budget, Hint, Reducer, Reduction } from '../types.js'
import { splitLines, omissionMarker } from '../text.js'
import { reduceBySize } from './size.js'

/** A line that reports one test passing, and nothing else. */
const PASS_LINE = [
  /^\s*(?:✓|√|✔|PASS(?:ED)?|ok)\s/i,               // vitest, jest, mocha, tap
  /\bPASSED\b/,                                     // pytest verbose
  /^\s*test .+ \.\.\. ok\s*$/,                      // cargo test
  /^\s*--- PASS:/,                                  // go test
  /^\s*ok\s+\S+\s+[\d.]+m?s\s*$/,                   // go package result
]

/** A line that reports a failure. Kept, with the lines that follow it. */
const FAIL_LINE = [
  /^\s*(?:✗|×|✖|FAIL(?:ED)?|not ok)\s/i,
  /\bFAILED\b/,
  /^\s*test .+ \.\.\. FAILED\s*$/,
  /^\s*--- FAIL:/,
  /^\s*(?:E\s{3}|>\s{3})/,                          // pytest error and context lines
  /\b(?:AssertionError|ERROR|Error:|panic:|Traceback)\b/,
]

/** A line that summarises the run. Always kept, wherever it appears. */
const SUMMARY_LINE = [
  /\b\d+\s+(?:passed|failed|skipped|error)/i,
  /\bTests?\s+run:/i,
  /^\s*=+\s*(?:FAILURES|ERRORS|short test summary|test session starts)/i,
  /^\s*Test Files\s/,
  /^\s*Tests\s+\d/,
  /^\s*(?:OK|FAILED)\s*\(/,                          // python unittest
  /^\s*test result:/,                                // cargo
]

const matches = (patterns: readonly RegExp[], line: string) => patterns.some(p => p.test(line))

/**
 * How many lines after a failure to keep as its explanation.
 * A stack trace or an assertion diff is usually shorter than this. The block
 * ends early at the next pass line, so a generous value costs little.
 */
const FAILURE_CONTEXT_LINES = 25

export function detectTestOutput(text: string, hint: Hint): boolean {
  const command = hint.command?.toLowerCase() ?? ''
  const commandLooksLikeTests =
    /\b(?:test|pytest|jest|vitest|mocha|gotest|cargo\s+test|go\s+test|npm\s+t\b|rspec|phpunit)/.test(command)

  // Read a bounded sample. Detection must stay cheap on a 10 MB result.
  const sample = splitLines(text).slice(0, 400)
  let passes = 0
  let fails = 0
  let summaries = 0
  for (const line of sample) {
    if (matches(SUMMARY_LINE, line)) summaries++
    else if (matches(PASS_LINE, line)) passes++
    else if (matches(FAIL_LINE, line)) fails++
  }

  // A summary line plus any test line is certain. Otherwise several test lines
  // are needed, because one stray "ok" proves nothing.
  if (summaries > 0 && passes + fails > 0) return true
  if (commandLooksLikeTests && passes + fails >= 2) return true
  return passes + fails >= 8
}

export function reduceTestOutput(text: string, hint: Hint, budget: Budget): Reduction | null {
  const lines = splitLines(text)
  const keep = new Array<boolean>(lines.length).fill(false)

  let contextLeft = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string

    if (matches(SUMMARY_LINE, line)) {
      keep[i] = true
      contextLeft = 0
      continue
    }
    if (matches(PASS_LINE, line)) {
      // A pass ends any failure block that was still collecting lines.
      contextLeft = 0
      continue
    }
    if (matches(FAIL_LINE, line)) {
      keep[i] = true
      contextLeft = FAILURE_CONTEXT_LINES
      continue
    }
    if (contextLeft > 0) {
      keep[i] = true
      contextLeft--
      continue
    }
    // An unclassified line outside a failure block is dropped. Test runners
    // print a lot of these: progress dots, timings, blank separators.
  }

  const keptCount = keep.filter(Boolean).length
  if (keptCount === 0) return null          // nothing recognised, let size run
  if (keptCount === lines.length) return null // nothing dropped, no gain

  const body = joinWithMarkers(lines, keep)

  // The kept failures can still be too large. Reduce them by size, keeping the
  // start: a failure explains itself in its first lines.
  if (body.length > budget.maxChars || splitLines(body).length > budget.maxLines) {
    const capped = reduceBySize(body, { ...hint, tool: 'read' }, budget, 'head')
    return {
      content: capped.content,
      reduced: true,
      strategy: 'tests+size',
      note: `kept ${keptCount.toLocaleString('en-US')} of ${lines.length.toLocaleString('en-US')} lines (failures and summary), then cut to fit`,
      stats: {
        inputChars: text.length, inputLines: lines.length,
        outputChars: capped.content.length, outputLines: splitLines(capped.content).length,
        keptLines: keptCount, droppedLines: lines.length - keptCount,
      },
    }
  }

  return {
    content: body,
    reduced: true,
    strategy: 'tests',
    note: `kept ${keptCount.toLocaleString('en-US')} of ${lines.length.toLocaleString('en-US')} lines: failures and summary, passing tests dropped`,
    stats: {
      inputChars: text.length, inputLines: lines.length,
      outputChars: body.length, outputLines: splitLines(body).length,
      keptLines: keptCount, droppedLines: lines.length - keptCount,
    },
  }
}

/** Join the kept lines, replacing each dropped run with one counted marker. */
function joinWithMarkers(lines: readonly string[], keep: readonly boolean[]): string {
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
  return out.join('\n')
}

export const testsReducer: Reducer = {
  name: 'tests',
  detect: detectTestOutput,
  reduce: reduceTestOutput,
}

export default testsReducer
