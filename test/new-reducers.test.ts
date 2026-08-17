import { describe, it, expect } from 'vitest'
import { detectBuild, reduceBuild } from '../src/reducers/build.js'
import { detectStacktrace, reduceStacktrace } from '../src/reducers/stacktrace.js'
import { detectRepeat, reduceRepeat } from '../src/reducers/repeat.js'
import { shrink } from '../src/pipeline.js'
import { DEFAULT_BUDGET, type Budget } from '../src/types.js'

const budget = (over: Partial<Budget> = {}): Budget => ({ ...DEFAULT_BUDGET, ...over })

// ---------------------------------------------------------------- build

const tscOutput = [
  ...Array.from({ length: 200 }, (_, i) => `Compiling module ${i}...`),
  "src/auth.ts(42,7): error TS2339: Property 'token' does not exist on type 'Session'.",
  '  42     return session.token',
  '            ~~~~~',
  ...Array.from({ length: 200 }, (_, i) => `Emitting chunk ${i}...`),
  'Found 1 error in src/auth.ts:42',
].join('\n')

const cargoOutput = [
  ...Array.from({ length: 150 }, (_, i) => `   Compiling crate-${i} v0.1.0`),
  'error[E0308]: mismatched types',
  '  --> src/lib.rs:88:20',
  '   |',
  '88 |     let count: u32 = items.len();',
  '   |                ---   ^^^^^^^^^^^ expected `u32`, found `usize`',
  'error: could not compile `demo` (lib) due to 1 previous error',
].join('\n')

describe('build', () => {
  it('detects tsc and cargo output', () => {
    expect(detectBuild(tscOutput, {})).toBe(true)
    expect(detectBuild(cargoOutput, { command: 'cargo build' })).toBe(true)
    expect(detectBuild('installing things\ndone', {})).toBe(false)
  })

  it('keeps the error with its code frame, drops the progress', () => {
    const out = reduceBuild(tscOutput, {}, budget())!
    expect(out.strategy).toBe('build')
    expect(out.content).toContain("error TS2339: Property 'token'")
    expect(out.content).toContain('return session.token')
    expect(out.content).toContain('Found 1 error')
    expect(out.content).not.toContain('Compiling module 100')
  })

  it('keeps a cargo error with its arrow context', () => {
    const out = reduceBuild(cargoOutput, { command: 'cargo build' }, budget())!
    expect(out.content).toContain('error[E0308]: mismatched types')
    expect(out.content).toContain('--> src/lib.rs:88:20')
    expect(out.content).toContain('could not compile')
    expect(out.content).not.toContain('crate-100')
  })
})

// ---------------------------------------------------------------- stacktrace

const nodeTrace = [
  "TypeError: Cannot read properties of undefined (reading 'id')",
  '    at getUser (/app/src/services/user.ts:44:18)',
  '    at handleRequest (/app/src/routes/api.ts:102:9)',
  ...Array.from({ length: 40 }, (_, i) =>
    `    at wrapped (/app/node_modules/express/lib/layer-${i}.js:${i + 1}:12)`),
  '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
].join('\n')

const pythonTrace = [
  'Traceback (most recent call last):',
  ...Array.from({ length: 30 }, (_, i) => [
    `  File "/usr/lib/python3.11/site-packages/django/core/handler${i}.py", line ${i + 10}, in handle`,
    '    response = get_response(request)',
  ]).flat(),
  '  File "/app/shop/views.py", line 31, in checkout',
  '    total = cart.total_price()',
  "AttributeError: 'NoneType' object has no attribute 'total_price'",
].join('\n')

describe('stacktrace', () => {
  it('detects deep traces and leaves short ones alone', () => {
    expect(detectStacktrace(nodeTrace, {})).toBe(true)
    expect(detectStacktrace(pythonTrace, {})).toBe(true)
    const short = 'Error: nope\n    at a (/app/x.ts:1:1)\n    at b (/app/y.ts:2:2)'
    expect(detectStacktrace(short, {})).toBe(false)
  })

  it('keeps the message and app frames, collapses dependency frames', () => {
    const out = reduceStacktrace(nodeTrace, {}, budget())!
    expect(out.strategy).toBe('stacktrace')
    expect(out.content).toContain("Cannot read properties of undefined")
    expect(out.content).toContain('/app/src/services/user.ts:44:18')
    expect(out.content).toContain('/app/src/routes/api.ts:102:9')
    expect(out.content).toContain('(dependency frames)')
    expect(out.content).not.toContain('layer-20')
  })

  it('keeps the python message, which sits at the END', () => {
    const out = reduceStacktrace(pythonTrace, {}, budget())!
    expect(out.content).toContain("AttributeError: 'NoneType'")
    expect(out.content).toContain('/app/shop/views.py')
    expect(out.content).not.toContain('handler15.py')
  })
})

// ---------------------------------------------------------------- repeat

const retryStorm = [
  'starting worker',
  ...Array.from({ length: 3000 }, (_, i) =>
    `2026-08-17T10:00:${String(i % 60).padStart(2, '0')} WARN retry ${i} for job 8f3a2c91d4e5: connection refused`),
  'giving up after 3000 attempts',
].join('\n')

describe('repeat', () => {
  it('detects a retry storm', () => {
    expect(detectRepeat(retryStorm, {})).toBe(true)
    const varied = Array.from({ length: 100 }, (_, i) => `completely different line about topic ${'abcdefghij'[i % 10]} ${'xyz'[i % 3]}`).join('\n')
    expect(detectRepeat('short\ntext', {})).toBe(false)
  })

  it('collapses the run to a sample and a count', () => {
    const out = reduceRepeat(retryStorm, {}, budget())!
    expect(out.strategy).toBe('repeat')
    expect(out.content).toContain('starting worker')
    expect(out.content).toContain('retry 0 for job')
    expect(out.content).toContain('... 2,998 similar lines omitted ...')
    expect(out.content).toContain('giving up after 3000 attempts')
    expect(out.content).not.toContain('retry 1500')
  })

  it('leaves interleaved output alone', () => {
    const interleaved = Array.from({ length: 100 }, (_, i) =>
      i % 2 === 0 ? `request ${i} received` : `worker idle, queue empty at depth ${i}`).join('\n')
    expect(reduceRepeat(interleaved, {}, budget())).toBeNull()
  })
})

// ---------------------------------------------------------------- routing

describe('routing for the new cuts', () => {
  it('sends each shape to its own cut', () => {
    const small = { budget: { maxChars: 2_000 } }
    expect(shrink(tscOutput, { command: 'tsc' }, small).strategy).toMatch(/^build/)
    expect(shrink(nodeTrace, {}, { budget: { maxChars: 1_000 } }).strategy).toMatch(/^stacktrace/)
    expect(shrink(retryStorm, {}, small).strategy).toMatch(/^repeat/)
  })

  it('the new cuts respect every budget', () => {
    for (const text of [tscOutput, cargoOutput, nodeTrace, pythonTrace, retryStorm]) {
      for (const maxChars of [800, 3_000, 20_000]) {
        const out = shrink(text, {}, { budget: { maxChars } })
        expect(out.content.length, `${out.strategy} at ${maxChars}`).toBeLessThanOrEqual(maxChars)
      }
    }
  })
})
