import { describe, it, expect } from 'vitest'
import {
  splitLines, countLines, omissionMarker, sliceSafely,
  capLine, capLines, takeHeadLines, takeTailLines,
} from '../src/text.js'

describe('splitLines', () => {
  it('does not invent a trailing empty line', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b'])
    expect(splitLines('a\nb')).toEqual(['a', 'b'])
    expect(countLines('a\nb\n')).toBe(2)
  })

  it('handles the empty string and a lone newline', () => {
    expect(splitLines('')).toEqual([])
    expect(splitLines('\n')).toEqual([''])
    expect(countLines('')).toBe(0)
  })

  it('keeps blank lines in the middle', () => {
    expect(splitLines('a\n\nb\n')).toEqual(['a', '', 'b'])
  })
})

describe('sliceSafely', () => {
  it('never splits a surrogate pair', () => {
    // Every emoji here is two UTF-16 units, so an odd limit lands mid-pair.
    const text = '🚀🚀🚀'
    expect(text.length).toBe(6)

    // A plain slice at 3 leaves a lone high surrogate. This is the bug we guard.
    expect(text.slice(0, 3).isWellFormed()).toBe(false)

    const cut = sliceSafely(text, 3)
    expect(cut).toBe('🚀')
    expect(cut.isWellFormed()).toBe(true)
    expect([...cut].length).toBe(1)
  })

  it('leaves a whole pair alone when the limit lands cleanly', () => {
    const cut = sliceSafely('🚀🚀🚀', 4)
    expect(cut).toBe('🚀🚀')
    expect(cut.isWellFormed()).toBe(true)
  })

  it('cuts plain text at the exact limit', () => {
    expect(sliceSafely('abcdef', 3)).toBe('abc')
  })

  it('returns the input when it already fits', () => {
    expect(sliceSafely('abc', 10)).toBe('abc')
  })

  it('returns empty for a limit of zero or less', () => {
    expect(sliceSafely('abc', 0)).toBe('')
    expect(sliceSafely('abc', -5)).toBe('')
  })
})

describe('omissionMarker', () => {
  it('reports characters, and lines when given', () => {
    expect(omissionMarker(1234)).toBe('... 1,234 characters omitted ...')
    expect(omissionMarker(1234, 56)).toBe('... 1,234 characters, 56 lines omitted ...')
  })

  it('leaves out a zero line count', () => {
    expect(omissionMarker(10, 0)).toBe('... 10 characters omitted ...')
  })
})

describe('capLine', () => {
  it('caps a long line and says how much went', () => {
    expect(capLine('x'.repeat(20), 5)).toBe('xxxxx ... +15 chars')
  })

  it('leaves a short line alone', () => {
    expect(capLine('short', 100)).toBe('short')
  })

  it('is disabled by a cap of zero', () => {
    const long = 'x'.repeat(500)
    expect(capLine(long, 0)).toBe(long)
    expect(capLines(long, 0)).toBe(long)
  })

  it('returns the identical string when no line needs capping', () => {
    const text = 'a\nb\nc'
    expect(capLines(text, 100)).toBe(text)
  })
})

describe('takeHeadLines and takeTailLines', () => {
  const lines = ['1111', '2222', '3333', '4444']

  it('take whole lines only, never a partial one', () => {
    // Each line costs 5 characters with its newline, so 12 fits exactly two.
    expect(takeHeadLines(lines, 12)).toEqual(['1111', '2222'])
    expect(takeTailLines(lines, 12)).toEqual(['3333', '4444'])
  })

  it('return nothing when even the first line does not fit', () => {
    expect(takeHeadLines(lines, 2)).toEqual([])
    expect(takeTailLines(lines, 2)).toEqual([])
  })

  it('return everything when the budget is large', () => {
    expect(takeHeadLines(lines, 10_000)).toEqual(lines)
    expect(takeTailLines(lines, 10_000)).toEqual(lines)
  })
})
