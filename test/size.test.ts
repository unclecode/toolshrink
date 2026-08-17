import { describe, it, expect } from 'vitest'
import { reduceBySize, defaultKeep } from '../src/reducers/size.js'
import { DEFAULT_BUDGET, type Budget } from '../src/types.js'
import { splitLines } from '../src/text.js'

const budget = (over: Partial<Budget> = {}): Budget => ({ ...DEFAULT_BUDGET, ...over })

/** 200 numbered lines, each about 12 characters. */
const numbered = (count: number, prefix = 'line') =>
  Array.from({ length: count }, (_, i) => `${prefix} ${String(i).padStart(4, '0')}`).join('\n')

describe('defaultKeep', () => {
  it('keeps the end for command output', () => {
    expect(defaultKeep({ tool: 'bash' })).toBe('tail')
    expect(defaultKeep({ tool: 'terminal' })).toBe('tail')
  })

  it('keeps the start for searches and reads', () => {
    expect(defaultKeep({ tool: 'grep' })).toBe('head')
    expect(defaultKeep({ tool: 'file_search' })).toBe('head')
    expect(defaultKeep({ tool: 'read' })).toBe('head')
  })

  it('keeps both ends when the tool is unknown', () => {
    expect(defaultKeep({})).toBe('both')
    expect(defaultKeep({ tool: 'something_new' })).toBe('both')
  })
})

describe('reduceBySize', () => {
  it('returns the input untouched when it already fits', () => {
    const text = numbered(10)
    const out = reduceBySize(text, {}, budget())
    expect(out.reduced).toBe(false)
    expect(out.strategy).toBe('none')
    expect(out.content).toBe(text)
  })

  it('keeps the end for bash, because the conclusion is there', () => {
    const text = `${numbered(500)}\nFAILED: 3 tests`
    const out = reduceBySize(text, { tool: 'bash' }, budget({ maxChars: 400 }))
    expect(out.strategy).toBe('size:tail')
    expect(out.content).toContain('FAILED: 3 tests')
    expect(out.content).not.toContain('line 0000')
    expect(out.content.startsWith('...')).toBe(true)
  })

  it('keeps the start for grep, because early matches are as good as any', () => {
    const text = numbered(500, 'match')
    const out = reduceBySize(text, { tool: 'grep' }, budget({ maxChars: 400 }))
    expect(out.strategy).toBe('size:head')
    expect(out.content).toContain('match 0000')
    expect(out.content).not.toContain('match 0499')
    expect(out.content.trimEnd().endsWith('...')).toBe(true)
  })

  it('keeps both ends and drops the middle when the tool is unknown', () => {
    const text = numbered(500)
    const out = reduceBySize(text, {}, budget({ maxChars: 400 }))
    expect(out.strategy).toBe('size:head-tail')
    expect(out.content).toContain('line 0000')
    expect(out.content).toContain('line 0499')
    expect(out.content).toContain('omitted')
  })

  it('never exceeds the character budget', () => {
    for (const max of [200, 500, 1_000, 5_000]) {
      for (const tool of ['bash', 'grep', undefined]) {
        const out = reduceBySize(numbered(5_000), { ...(tool ? { tool } : {}) }, budget({ maxChars: max }))
        expect(out.content.length, `tool=${tool} max=${max}`).toBeLessThanOrEqual(max)
      }
    }
  })

  it('never exceeds the line budget', () => {
    const out = reduceBySize(numbered(5_000), {}, budget({ maxChars: 1_000_000, maxLines: 50 }))
    expect(splitLines(out.content).length).toBeLessThanOrEqual(50 + 1) // +1 for the marker
  })

  it('never returns a partial line', () => {
    const text = numbered(500)
    const original = new Set(splitLines(text))
    const out = reduceBySize(text, { tool: 'grep' }, budget({ maxChars: 300 }))
    for (const line of splitLines(out.content)) {
      if (line.startsWith('...')) continue
      expect(original.has(line), `partial line: ${line}`).toBe(true)
    }
  })

  it('reports how much it removed', () => {
    const out = reduceBySize(numbered(500), { tool: 'bash' }, budget({ maxChars: 400 }))
    expect(out.stats.inputLines).toBe(500)
    expect(out.stats.keptLines).toBeGreaterThan(0)
    expect(out.stats.droppedLines).toBe(500 - (out.stats.keptLines ?? 0))
    expect(out.content).toMatch(/\.\.\. [\d,]+ characters, [\d,]+ lines omitted \.\.\./)
  })

  it('is idempotent: reducing twice changes nothing the second time', () => {
    const once = reduceBySize(numbered(5_000), { tool: 'bash' }, budget({ maxChars: 1_000 }))
    const twice = reduceBySize(once.content, { tool: 'bash' }, budget({ maxChars: 1_000 }))
    expect(twice.reduced).toBe(false)
    expect(twice.content).toBe(once.content)
  })

  it('caps over-long lines when asked, and reports it', () => {
    const text = `short\n${'x'.repeat(5_000)}\nshort`
    const out = reduceBySize(text, {}, budget({ maxLineChars: 100 }))
    expect(out.strategy).toBe('size:line-cap')
    expect(out.content).toContain('+4,900 chars')
    expect(out.content).toContain('short')
  })

  it('survives text with no newline at all', () => {
    const out = reduceBySize('x'.repeat(10_000), { tool: 'bash' }, budget({ maxChars: 500 }))
    expect(out.content.length).toBeLessThanOrEqual(500)
  })

  it('survives empty input', () => {
    const out = reduceBySize('', {}, budget())
    expect(out.reduced).toBe(false)
    expect(out.content).toBe('')
  })
})
