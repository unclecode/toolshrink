import { describe, it, expect } from 'vitest'
import { detectLint, reduceLint } from '../src/reducers/lint.js'
import { detectInstall, reduceInstall } from '../src/reducers/install.js'
import { detectCsv, reduceCsv } from '../src/reducers/csv.js'
import { detectGitLog, reduceGitLog } from '../src/reducers/gitlog.js'
import { shrink } from '../src/pipeline.js'
import { DEFAULT_BUDGET, type Budget } from '../src/types.js'

const budget = (over: Partial<Budget> = {}): Budget => ({ ...DEFAULT_BUDGET, ...over })

// ---------------------------------------------------------------- lint

const eslintStylish = [
  '/repo/src/api/handler.ts',
  ...Array.from({ length: 40 }, (_, i) =>
    `  ${i + 10}:5   error    'req' is defined but never used            @typescript-eslint/no-unused-vars`),
  '',
  '/repo/src/db/query.ts',
  ...Array.from({ length: 25 }, (_, i) =>
    `  ${i + 3}:12  warning  Unexpected any. Specify a different type   @typescript-eslint/no-explicit-any`),
  '  8:1   error    Missing return type on function            @typescript-eslint/explicit-function-return-type',
].join('\n')

const ruffOutput = Array.from({ length: 60 }, (_, i) =>
  `src/module${i % 8}.py:${i + 4}:1: F401 \`os\` imported but unused`).join('\n')

describe('lint', () => {
  it('detects eslint and ruff output', () => {
    expect(detectLint(eslintStylish, { command: 'npx eslint .' })).toBe(true)
    expect(detectLint(ruffOutput, { command: 'ruff check .' })).toBe(true)
    expect(detectLint('hello\nworld\nnothing here', {})).toBe(false)
  })

  it('groups by rule with counts instead of listing every hit', () => {
    const out = reduceLint(eslintStylish, { command: 'eslint' }, budget())!
    expect(out.strategy).toBe('lint')
    expect(out.content).toContain('no-unused-vars x40')
    expect(out.content).toContain('no-explicit-any x25')
    expect(out.content).toContain('66 problems')
  })

  it('names the worst files', () => {
    const out = reduceLint(eslintStylish, { command: 'eslint' }, budget())!
    expect(out.content).toContain('files with the most problems')
    expect(out.content).toContain('handler.ts')
  })

  it('keeps a few example locations per rule', () => {
    const out = reduceLint(eslintStylish, { command: 'eslint' }, budget())!
    expect(out.content).toMatch(/handler\.ts:\d+:\d+/)
    expect(out.content).toContain('and 37 more')
  })

  it('declines when there is almost nothing to group', () => {
    const tiny = 'src/a.py:1:1: F401 `os` imported but unused'
    expect(reduceLint(tiny, { command: 'ruff' }, budget())).toBeNull()
  })
})

// ---------------------------------------------------------------- install

const npmInstall = [
  ...Array.from({ length: 200 }, (_, i) => `Downloading package-${i}@1.0.0`),
  'npm WARN deprecated request@2.88.2: request has been deprecated',
  ...Array.from({ length: 150 }, (_, i) => `Using cached lib-${i}`),
  'added 1247 packages, and audited 1248 packages in 34s',
  '3 vulnerabilities (1 moderate, 2 high)',
].join('\n')

describe('install', () => {
  it('detects npm install output', () => {
    expect(detectInstall(npmInstall, { command: 'npm install' })).toBe(true)
    expect(detectInstall('short\ntext\nhere', {})).toBe(false)
  })

  it('keeps the summary and the audit, drops the fetch chatter', () => {
    const out = reduceInstall(npmInstall, { command: 'npm install' }, budget())!
    expect(out.strategy).toBe('install')
    expect(out.content).toContain('added 1247 packages')
    expect(out.content).toContain('3 vulnerabilities')
    expect(out.content).toContain('deprecated request@2.88.2')
    expect(out.content).not.toContain('Downloading package-100')
    expect(out.content).toContain('(progress)')
  })
})

// ---------------------------------------------------------------- csv

const bigCsv = [
  'id,name,email,country,signup_date',
  ...Array.from({ length: 5000 }, (_, i) =>
    `${i},user${i},user${i}@example.com,SG,2026-0${(i % 9) + 1}-15`),
].join('\n')

describe('csv', () => {
  it('detects a table by consistent separators', () => {
    expect(detectCsv(bigCsv, { path: 'export.csv' })).toBe(true)
    expect(detectCsv('just\nsome\nplain\nlines\nwith\nno\ncommas\nat\nall\nhere\nreally\ntruly', {})).toBe(false)
  })

  it('keeps the header, samples rows, and states the count', () => {
    const out = reduceCsv(bigCsv, { path: 'export.csv' }, budget())!
    expect(out.strategy).toBe('csv')
    expect(out.content.startsWith('id,name,email,country,signup_date')).toBe(true)
    expect(out.content).toContain('0,user0,user0@example.com')
    // 5000 rows minus 5 kept from the head and 2 from the end
    expect(out.content).toContain('4,993 more rows omitted')
    expect(out.content).toContain('4999,user4999')      // a tail row survives
    expect(out.content).toContain('5,000 data rows, 5 columns')
  })

  it('handles tabs too', () => {
    const tsv = ['a\tb\tc', ...Array.from({ length: 40 }, (_, i) => `${i}\tx\ty`)].join('\n')
    const out = reduceCsv(tsv, { path: 'data.tsv' }, budget())!
    expect(out.content).toContain('TSV: 40 data rows, 3 columns')
  })

  it('declines a short table', () => {
    const small = ['a,b', '1,2', '3,4'].join('\n')
    expect(reduceCsv(small, { path: 'x.csv' }, budget())).toBeNull()
  })
})

// ---------------------------------------------------------------- gitlog

const gitLogFull = Array.from({ length: 300 }, (_, i) => [
  `commit ${'a'.repeat(7)}${String(i).padStart(33, '0')}`,
  `Author: ${i % 3 === 0 ? 'Alice Smith <alice@example.com>' : 'Bob Jones <bob@example.com>'}`,
  `Date:   Mon Aug 1${i % 9} 10:00:00 2026 +0800`,
  '',
  `    fix issue number ${i}`,
  '',
].join('\n')).join('\n')

const gitLogOneline = Array.from({ length: 400 }, (_, i) =>
  `${(i + 1000000).toString(16).padStart(7, '0')} commit message number ${i}`).join('\n')

describe('gitlog', () => {
  it('detects both git log formats', () => {
    expect(detectGitLog(gitLogFull, {})).toBe(true)
    expect(detectGitLog(gitLogOneline, { command: 'git log --oneline' })).toBe(true)
    expect(detectGitLog('random\ntext\nhere', {})).toBe(false)
  })

  it('keeps the newest commits and counts the rest', () => {
    const out = reduceGitLog(gitLogFull, {}, budget())!
    expect(out.strategy).toBe('gitlog')
    expect(out.content).toContain('fix issue number 0')
    expect(out.content).toContain('285 older commits omitted')
    expect(out.content).toContain('300 total')
    expect(out.content).not.toContain('fix issue number 200')
  })

  it('names the authors with their counts', () => {
    const out = reduceGitLog(gitLogFull, {}, budget())!
    expect(out.content).toContain('Alice Smith (100)')
    expect(out.content).toContain('Bob Jones (200)')
  })

  it('handles the oneline format', () => {
    const out = reduceGitLog(gitLogOneline, { command: 'git log --oneline' }, budget())!
    expect(out.content).toContain('commit message number 0')
    expect(out.content).toContain('385 older commits omitted')
  })
})

// ---------------------------------------------------------------- routing

describe('the four new cuts route correctly', () => {
  it('each shape reaches its own cut', () => {
    const small = { budget: { maxChars: 3_000 } }
    expect(shrink(eslintStylish, { command: 'eslint .' }, small).strategy).toMatch(/^lint/)
    expect(shrink(npmInstall, { command: 'npm install' }, small).strategy).toMatch(/^install/)
    expect(shrink(bigCsv, { path: 'export.csv' }, small).strategy).toMatch(/^csv/)
    expect(shrink(gitLogFull, { command: 'git log' }, small).strategy).toMatch(/^gitlog/)
  })

  it('all four respect every budget', () => {
    for (const [text, hint] of [
      [eslintStylish, { command: 'eslint .' }],
      [npmInstall, { command: 'npm install' }],
      [bigCsv, { path: 'export.csv' }],
      [gitLogFull, { command: 'git log' }],
    ] as const) {
      for (const maxChars of [600, 3_000, 20_000]) {
        const out = shrink(text, hint, { budget: { maxChars } })
        expect(out.content.length, `${out.strategy} at ${maxChars}`).toBeLessThanOrEqual(maxChars)
      }
    }
  })
})
