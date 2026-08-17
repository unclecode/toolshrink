import { describe, it, expect } from 'vitest'
import { detectTestOutput, reduceTestOutput } from '../src/reducers/tests.js'
import { DEFAULT_BUDGET, type Budget } from '../src/types.js'

const budget = (over: Partial<Budget> = {}): Budget => ({ ...DEFAULT_BUDGET, ...over })

/** Real output shapes, written from each runner's documented format. */
const vitest = (passing: number) => [
  ' RUN  v2.1.9 /repo',
  ...Array.from({ length: passing }, (_, i) => ` ✓ test/unit-${i}.test.ts (4 tests) 12ms`),
  ' ✗ test/payment.test.ts > refunds a cancelled order',
  '   AssertionError: expected 0 to be 250',
  '    ❯ test/payment.test.ts:88:24',
  '      expect(refund.amount).toBe(250)',
  ...Array.from({ length: passing }, (_, i) => ` ✓ test/later-${i}.test.ts (2 tests) 8ms`),
  ' Test Files  1 failed | 40 passed (41)',
  '      Tests  1 failed | 812 passed (813)',
].join('\n')

const pytest = [
  '============================= test session starts ==============================',
  'tests/test_auth.py::test_login PASSED                                     [ 10%]',
  'tests/test_auth.py::test_logout PASSED                                    [ 20%]',
  'tests/test_cart.py::test_total FAILED                                     [ 30%]',
  'tests/test_cart.py::test_empty PASSED                                     [ 40%]',
  '=================================== FAILURES ===================================',
  '_________________________________ test_total __________________________________',
  '    def test_total():',
  '>       assert cart.total() == 30',
  'E       assert 25 == 30',
  '=========================== short test summary info ============================',
  'FAILED tests/test_cart.py::test_total - assert 25 == 30',
  '========================= 1 failed, 3 passed in 0.42s ==========================',
].join('\n')

const cargo = [
  'running 200 tests',
  ...Array.from({ length: 199 }, (_, i) => `test module::case_${i} ... ok`),
  'test module::parses_utf8 ... FAILED',
  'failures:',
  '---- module::parses_utf8 stdout ----',
  "thread 'module::parses_utf8' panicked at src/lib.rs:42:9:",
  'assertion failed: parse("é").is_ok()',
  'test result: FAILED. 199 passed; 1 failed; 0 ignored',
].join('\n')

const goTest = [
  ...Array.from({ length: 150 }, (_, i) => `--- PASS: TestHandler${i} (0.00s)`),
  '--- FAIL: TestTimeout (2.01s)',
  '    handler_test.go:91: expected 200, got 504',
  'FAIL',
  'FAIL\texample.com/api\t2.114s',
].join('\n')

describe('detectTestOutput', () => {
  it('recognises vitest, pytest, cargo and go output', () => {
    expect(detectTestOutput(vitest(40), {})).toBe(true)
    expect(detectTestOutput(pytest, {})).toBe(true)
    expect(detectTestOutput(cargo, {})).toBe(true)
    expect(detectTestOutput(goTest, {})).toBe(true)
  })

  it('uses the command as a hint for short output', () => {
    const short = ' ✓ a.test.ts\n ✓ b.test.ts'
    expect(detectTestOutput(short, {})).toBe(false)
    expect(detectTestOutput(short, { command: 'npm test' })).toBe(true)
  })

  it('does not fire on ordinary output that happens to contain "ok"', () => {
    expect(detectTestOutput('ok\nfile written\ndone', {})).toBe(false)
    expect(detectTestOutput('Reading config...\nok\n', {})).toBe(false)
  })

  it('does not fire on a git log or a diff', () => {
    const log = Array.from({ length: 200 }, (_, i) => `commit ${i} fix a thing`).join('\n')
    expect(detectTestOutput(log, {})).toBe(false)
  })
})

describe('reduceTestOutput', () => {
  it('keeps the failure that sits in the middle, which a size cut would lose', () => {
    const text = vitest(400)
    const out = reduceTestOutput(text, {}, budget({ maxChars: 4_000 }))
    expect(out).not.toBeNull()
    expect(out!.content).toContain('refunds a cancelled order')
    expect(out!.content).toContain('expected 0 to be 250')
    expect(out!.content).toContain('test/payment.test.ts:88:24')
  })

  it('drops the passing lines', () => {
    const out = reduceTestOutput(vitest(400), {}, budget())!
    expect(out.content).not.toContain('unit-200.test.ts')
    expect(out.stats.droppedLines).toBeGreaterThan(700)
  })

  it('always keeps the summary', () => {
    const out = reduceTestOutput(vitest(400), {}, budget())!
    expect(out.content).toContain('Tests  1 failed | 812 passed (813)')
  })

  it('keeps pytest failures with their assertion detail', () => {
    const out = reduceTestOutput(pytest, {}, budget())!
    expect(out.content).toContain('FAILED')
    expect(out.content).toContain('assert 25 == 30')
    expect(out.content).toContain('1 failed, 3 passed')
    expect(out.content).not.toContain('test_login PASSED')
  })

  it('keeps a cargo panic message', () => {
    const out = reduceTestOutput(cargo, {}, budget())!
    expect(out.content).toContain('parses_utf8 ... FAILED')
    expect(out.content).toContain('panicked at src/lib.rs:42:9')
    expect(out.content).toContain('test result: FAILED')
    expect(out.content).not.toContain('case_100 ... ok')
  })

  it('keeps a go failure and its file and line', () => {
    const out = reduceTestOutput(goTest, {}, budget())!
    expect(out.content).toContain('--- FAIL: TestTimeout')
    expect(out.content).toContain('handler_test.go:91')
    expect(out.content).not.toContain('TestHandler100')
  })

  it('says how many lines it removed', () => {
    const out = reduceTestOutput(vitest(400), {}, budget())!
    expect(out.content).toMatch(/\.\.\. [\d,]+ characters, [\d,]+ lines omitted \.\.\./)
  })

  it('declines when every line is a failure, so nothing is gained', () => {
    const allFail = Array.from({ length: 50 }, (_, i) => `FAILED test_${i}`).join('\n')
    expect(reduceTestOutput(allFail, {}, budget())).toBeNull()
  })

  it('declines when nothing is recognised', () => {
    expect(reduceTestOutput('some\nplain\ntext', {}, budget())).toBeNull()
  })

  it('falls back to a size cut when the failures alone are still too big', () => {
    const many = [
      ...Array.from({ length: 500 }, (_, i) => ` ✓ ok-${i}.test.ts`),
      ...Array.from({ length: 500 }, (_, i) => ` ✗ broken-${i}.test.ts\n   AssertionError: bad ${i}`),
      ' Tests  500 failed | 500 passed',
    ].join('\n')
    const out = reduceTestOutput(many, {}, budget({ maxChars: 2_000 }))!
    expect(out.strategy).toBe('tests+size')
    expect(out.content.length).toBeLessThanOrEqual(2_000)
    expect(out.content).toContain('broken-0.test.ts')
  })

  it('respects the budget for every runner format', () => {
    for (const text of [vitest(400), pytest, cargo, goTest]) {
      for (const maxChars of [500, 2_000, 10_000]) {
        const out = reduceTestOutput(text, {}, budget({ maxChars }))
        if (out) expect(out.content.length).toBeLessThanOrEqual(maxChars)
      }
    }
  })
})
