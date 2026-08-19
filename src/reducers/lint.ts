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

import type { Budget, Hint, Reducer, Reduction } from '../types.js'
import { splitLines } from '../text.js'
import { reduceBySize } from './size.js'

/** How many example locations to show per rule. */
const EXAMPLES = 3
/** A rule with fewer hits than this is listed in full, not summarised. */
const SUMMARISE_ABOVE = 3

interface Problem {
  file: string
  where: string      // "line:col"
  level: string      // error | warning
  rule: string
  message: string
}

/** eslint stylish: an unindented path line, then indented problem lines. */
const STYLISH_PROBLEM = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s\s+([\w@/-]+)\s*$/
/** ruff, clippy, eslint compact: everything on one line. */
const ONELINE = [
  /^(?<file>[^\s:]+):(?<line>\d+):(?<col>\d+):\s+(?<rule>[A-Z]+\d+)\s+(?<message>.+)$/,      // ruff
  /^(?<file>[^\s:]+):\s*line\s+(?<line>\d+),\s*col\s+(?<col>\d+),\s+(?<level>Error|Warning)\s+-\s+(?<message>.+?)\s+\((?<rule>[\w@/-]+)\)$/, // eslint compact
  /^(?<level>warning|error)(?:\[(?<rule>[\w:]+)\])?:\s+(?<message>.+)$/,                      // clippy
]

const isFileHeader = (line: string) => /^[^\s].*\.\w+$/.test(line) || /^[^\s].*[/\\].+$/.test(line)

function parse(lines: readonly string[]): Problem[] {
  const problems: Problem[] = []
  let currentFile = ''

  for (const line of lines) {
    const stylish = STYLISH_PROBLEM.exec(line)
    if (stylish && currentFile) {
      problems.push({
        file: currentFile,
        where: `${stylish[1]}:${stylish[2]}`,
        level: stylish[3] as string,
        rule: stylish[5] as string,
        message: stylish[4] as string,
      })
      continue
    }
    // Problem patterns FIRST. A ruff line like `src/a.py:4:1: F401 ...` also
    // looks like a file header (it starts unindented and contains a slash),
    // so checking the header first would swallow every problem line.
    let matched = false
    for (const pattern of ONELINE) {
      const m = pattern.exec(line)
      if (!m?.groups) continue
      const g = m.groups
      problems.push({
        file: g['file'] ?? currentFile ?? '?',
        where: g['line'] ? `${g['line']}:${g['col'] ?? 0}` : '',
        level: (g['level'] ?? 'error').toLowerCase(),
        rule: g['rule'] ?? 'unknown',
        message: (g['message'] ?? '').trim(),
      })
      matched = true
      break
    }
    if (matched) continue

    if (isFileHeader(line) && !line.startsWith(' ')) {
      currentFile = line.trim()
    }
  }
  return problems
}

export function detectLint(text: string, hint: Hint): boolean {
  const command = hint.command?.toLowerCase() ?? ''
  const commandLints = /\b(?:eslint|ruff|clippy|cargo\s+clippy|flake8|pylint|golangci|biome|oxlint|stylelint)\b/.test(command)

  const sample = splitLines(text).slice(0, 300)
  if (sample.length < 10) return false
  const problems = parse(sample)
  if (commandLints && problems.length >= 2) return true
  // Without a command hint, demand that problems dominate the text.
  return problems.length >= 12 && problems.length >= sample.length * 0.3
}

export function reduceLint(text: string, hint: Hint, budget: Budget): Reduction | null {
  const lines = splitLines(text)
  const problems = parse(lines)
  if (problems.length < 5) return null

  const byRule = new Map<string, Problem[]>()
  for (const problem of problems) {
    const list = byRule.get(problem.rule)
    if (list) list.push(problem)
    else byRule.set(problem.rule, [problem])
  }
  const byFile = new Map<string, number>()
  for (const problem of problems) {
    byFile.set(problem.file, (byFile.get(problem.file) ?? 0) + 1)
  }

  const errors = problems.filter(p => p.level === 'error').length
  const warnings = problems.length - errors
  const out: string[] = [
    `${problems.length.toLocaleString('en-US')} problems (${errors} errors, ${warnings} warnings)`
    + ` across ${byFile.size.toLocaleString('en-US')} files, ${byRule.size} rules`,
    '',
  ]

  // Rules first, worst offender first: this is the actionable ordering.
  for (const [rule, hits] of [...byRule.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const first = hits[0] as Problem
    if (hits.length <= SUMMARISE_ABOVE) {
      for (const hit of hits) out.push(`${hit.level} ${rule}: ${hit.message}  (${hit.file}:${hit.where})`)
      continue
    }
    out.push(`${first.level} ${rule} x${hits.length}: ${first.message}`)
    for (const hit of hits.slice(0, EXAMPLES)) out.push(`    ${hit.file}:${hit.where}`)
    if (hits.length > EXAMPLES) {
      out.push(`    ... and ${(hits.length - EXAMPLES).toLocaleString('en-US')} more`)
    }
  }

  const worst = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  if (worst.length > 1) {
    out.push('', 'files with the most problems:')
    for (const [file, count] of worst) out.push(`    ${count.toString().padStart(4)}  ${file}`)
  }

  const body = out.join('\n')
  if (body.length >= text.length) return null

  const base = {
    inputChars: text.length,
    inputLines: lines.length,
    keptLines: splitLines(body).length,
    droppedLines: Math.max(0, lines.length - splitLines(body).length),
  }

  if (body.length > budget.maxChars || splitLines(body).length > budget.maxLines) {
    const capped = reduceBySize(body, { ...hint, tool: 'read' }, budget, 'head')
    return {
      content: capped.content,
      reduced: true,
      strategy: 'lint+size',
      note: `${problems.length} problems grouped into ${byRule.size} rules, then cut to fit`,
      stats: { ...base, outputChars: capped.content.length, outputLines: splitLines(capped.content).length },
    }
  }

  return {
    content: body,
    reduced: true,
    strategy: 'lint',
    note: `${problems.length.toLocaleString('en-US')} problems grouped into ${byRule.size} rules with counts and example locations`,
    stats: { ...base, outputChars: body.length, outputLines: splitLines(body).length },
  }
}

export const lintReducer: Reducer = {
  name: 'lint',
  detect: detectLint,
  reduce: reduceLint,
}

export default lintReducer
