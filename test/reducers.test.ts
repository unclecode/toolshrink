import { describe, it, expect } from 'vitest'
import { detectDiff, reduceDiff } from '../src/reducers/diff.js'
import { detectJson, reduceJson } from '../src/reducers/json.js'
import { detectLog, reduceLog } from '../src/reducers/log.js'
import { detectTree, reduceTree } from '../src/reducers/tree.js'
import { shrink } from '../src/pipeline.js'
import { DEFAULT_BUDGET, type Budget } from '../src/types.js'

const budget = (over: Partial<Budget> = {}): Budget => ({ ...DEFAULT_BUDGET, ...over })

// ---------------------------------------------------------------- diff

const bigDiff = [
  'diff --git a/src/auth.ts b/src/auth.ts',
  'index 3f1c2aa..9e8d310 100644',
  '--- a/src/auth.ts',
  '+++ b/src/auth.ts',
  '@@ -1,300 +1,301 @@',
  ...Array.from({ length: 140 }, (_, i) => ` unchanged line ${i}`),
  '-  return token === stored',
  '+  return timingSafeEqual(token, stored)',
  ...Array.from({ length: 140 }, (_, i) => ` unchanged line ${140 + i}`),
].join('\n')

describe('diff', () => {
  it('detects git diff output', () => {
    expect(detectDiff(bigDiff, {})).toBe(true)
    expect(detectDiff('just some text\nwith lines', {})).toBe(false)
  })

  it('keeps the change and the headers, drops the unchanged bulk', () => {
    const out = reduceDiff(bigDiff, {}, budget())!
    expect(out.strategy).toBe('diff')
    expect(out.content).toContain('timingSafeEqual(token, stored)')
    expect(out.content).toContain('return token === stored')
    expect(out.content).toContain('diff --git a/src/auth.ts')
    expect(out.content).toContain('@@ -1,300 +1,301 @@')
    expect(out.content).not.toContain('unchanged line 50')
    expect(out.content).toContain('(unchanged)')
  })

  it('keeps one context line each side of a change', () => {
    const out = reduceDiff(bigDiff, {}, budget())!
    expect(out.content).toContain('unchanged line 139') // just before the -
    expect(out.content).toContain('unchanged line 140') // just after the +
  })

  it('declines a diff that is all changes', () => {
    const allNew = [
      'diff --git a/new.ts b/new.ts',
      '--- /dev/null',
      '+++ b/new.ts',
      '@@ -0,0 +1,3 @@',
      '+a', '+b', '+c',
    ].join('\n')
    expect(reduceDiff(allNew, {}, budget())).toBeNull()
  })
})

// ---------------------------------------------------------------- json

const bigJson = JSON.stringify({
  total: 1000,
  page: 1,
  items: Array.from({ length: 1000 }, (_, i) => ({
    id: i, name: `user-${i}`, email: `user${i}@example.com`, active: i % 2 === 0,
  })),
}, null, 2)

describe('json', () => {
  it('detects JSON and rejects almost-JSON', () => {
    expect(detectJson(bigJson, {})).toBe(true)
    expect(detectJson('{broken', { path: 'x.txt' })).toBe(false)
    expect(detectJson('plain text', {})).toBe(false)
  })

  it('samples long arrays and keeps the envelope', () => {
    const out = reduceJson(bigJson, {}, budget())!
    expect(out.strategy).toBe('json')
    const parsed = JSON.parse(out.content)
    expect(parsed.total).toBe(1000)
    expect(parsed.items).toHaveLength(4) // 3 samples + marker
    expect(parsed.items[3]).toBe('... 997 more items ...')
    expect(parsed.items[0].email).toBe('user0@example.com')
  })

  it('output is valid JSON', () => {
    const out = reduceJson(bigJson, {}, budget())!
    expect(() => JSON.parse(out.content)).not.toThrow()
  })

  it('declines short arrays and non-JSON', () => {
    expect(reduceJson(JSON.stringify({ a: [1, 2, 3] }), {}, budget())).toBeNull()
    expect(reduceJson('not json at all', {}, budget())).toBeNull()
  })

  it('cuts very long strings inside values', () => {
    const text = JSON.stringify({ blob: 'x'.repeat(10_000), items: Array.from({ length: 100 }, i => i) })
    const out = reduceJson(text, {}, budget())!
    const parsed = JSON.parse(out.content)
    expect(parsed.blob).toContain('(+9,500 chars)')
  })
})

// ---------------------------------------------------------------- log

const bigLog = [
  ...Array.from({ length: 300 }, (_, i) =>
    `2026-08-17T10:${String(i % 60).padStart(2, '0')}:00 INFO request ${i} handled in 12ms`),
  '2026-08-17T10:45:00 INFO connecting to db-replica-3',
  '2026-08-17T10:45:01 ERROR connection refused: db-replica-3:5432',
  '2026-08-17T10:45:01 WARN falling back to primary',
  ...Array.from({ length: 300 }, (_, i) =>
    `2026-08-17T11:${String(i % 60).padStart(2, '0')}:00 INFO request ${300 + i} handled in 14ms`),
].join('\n')

describe('log', () => {
  it('detects timestamped logs', () => {
    expect(detectLog(bigLog, {})).toBe(true)
    expect(detectLog('short\ntext', {})).toBe(false)
  })

  it('keeps the error with the lines that led to it, drops the routine', () => {
    const out = reduceLog(bigLog, {}, budget())!
    expect(out.strategy).toBe('log')
    expect(out.content).toContain('ERROR connection refused')
    expect(out.content).toContain('connecting to db-replica-3') // the BEFORE context
    expect(out.content).toContain('WARN falling back')
    expect(out.content).not.toContain('request 100 handled')
    expect(out.content).toContain('(routine)')
  })

  it('keeps the tail of the log', () => {
    const out = reduceLog(bigLog, {}, budget())!
    expect(out.content).toContain('request 599 handled')
  })

  it('declines a log that is mostly errors', () => {
    const noisy = Array.from({ length: 100 }, (_, i) =>
      `2026-08-17T10:00:00 ERROR failure ${i}`).join('\n')
    expect(reduceLog(noisy, {}, budget())).toBeNull()
  })
})

// ---------------------------------------------------------------- tree

const bigFind = [
  ...Array.from({ length: 300 }, (_, i) => `src/components/Widget${i}.tsx`),
  ...Array.from({ length: 200 }, (_, i) => `src/utils/helper${i}.ts`),
  'src/index.ts',
  'package.json',
].join('\n')

describe('tree', () => {
  it('detects path-per-line listings', () => {
    expect(detectTree(bigFind, { command: 'find src' })).toBe(true)
    expect(detectTree('hello\nworld', {})).toBe(false)
  })

  it('samples each directory and counts the rest', () => {
    const out = reduceTree(bigFind, {}, budget())!
    expect(out.strategy).toBe('tree')
    expect(out.content).toContain('src/components/Widget0.tsx')
    expect(out.content).toContain('and 292 more in src/components')
    expect(out.content).toContain('and 192 more in src/utils')
    expect(out.content).toContain('src/index.ts') // small groups kept whole
    expect(out.content).not.toContain('Widget100.tsx')
  })

  it('declines when no directory is crowded', () => {
    const small = Array.from({ length: 40 }, (_, i) => `dir${i}/file.ts`).join('\n')
    expect(reduceTree(small, { command: 'find .' }, budget())).toBeNull()
  })
})

// ---------------------------------------------------------------- routing

describe('pipeline routing', () => {
  it('sends each shape to its own cut', () => {
    const tiny = { budget: { maxChars: 3_000 } }
    expect(shrink(bigDiff, {}, tiny).strategy).toMatch(/^diff/)
    expect(shrink(bigJson, {}, tiny).strategy).toMatch(/^json/)
    expect(shrink(bigLog, {}, tiny).strategy).toMatch(/^log/)
    expect(shrink(bigFind, { command: 'find src' }, tiny).strategy).toMatch(/^tree/)
  })

  it('every cut respects every budget', () => {
    for (const [text, hint] of [
      [bigDiff, {}], [bigJson, {}], [bigLog, {}],
      [bigFind, { command: 'find src' }],
    ] as const) {
      for (const maxChars of [800, 3_000, 20_000]) {
        const out = shrink(text, hint, { budget: { maxChars } })
        expect(out.content.length, `${out.strategy} at ${maxChars}`).toBeLessThanOrEqual(maxChars)
      }
    }
  })
})

describe('json objects with many keys', () => {
  it('samples keys the way it samples array items', () => {
    const lock = JSON.stringify({
      name: 'demo', lockfileVersion: 3,
      packages: Object.fromEntries(Array.from({ length: 800 }, (_, i) =>
        [`node_modules/pkg-${i}`, { version: '1.0.0', resolved: `https://r/pkg-${i}.tgz` }])),
    })
    const out = reduceJson(lock, { path: 'package-lock.json' }, budget())!
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out.content)
    expect(parsed.name).toBe('demo')
    expect(parsed.packages['node_modules/pkg-0'].version).toBe('1.0.0')
    expect(parsed.packages['...']).toBe('795 more keys omitted')
    expect(Object.keys(parsed.packages)).toHaveLength(6)
  })
})
