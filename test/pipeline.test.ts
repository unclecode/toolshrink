import { describe, it, expect, beforeEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { shrink, loadReducers } from '../src/pipeline.js'
import { FileSpillStore } from '../src/spill.js'
import type { Reducer } from '../src/types.js'

const vitestOutput = [
  ...Array.from({ length: 400 }, (_, i) => ` ✓ ok-${i}.test.ts`),
  ' ✗ bad.test.ts > breaks',
  '   AssertionError: expected 1 to be 2',
  ' Tests  1 failed | 400 passed (401)',
].join('\n')

describe('shrink', () => {
  it('passes small text through untouched', () => {
    const out = shrink('small output', { tool: 'bash' })
    expect(out.reduced).toBe(false)
    expect(out.content).toBe('small output')
    expect(out.strategy).toBe('none')
  })

  it('routes test output to the tests cut', () => {
    const out = shrink(vitestOutput, { tool: 'bash' }, { budget: { maxChars: 2_000 } })
    expect(out.strategy).toBe('tests')
    expect(out.content).toContain('AssertionError')
  })

  it('falls back to the size cut for unrecognised text', () => {
    // Varied words, so no cut (including repeat) recognises a pattern.
    const words = ['alpha', 'bridge', 'copper', 'delta', 'ember', 'forest', 'granite']
    const plain = Array.from({ length: 3_000 }, (_, i) =>
      `${words[i % 7]} ${words[(i * 3 + 1) % 7]} entry ${words[(i * 5 + 2) % 7]}`).join('\n')
    const out = shrink(plain, { tool: 'bash' }, { budget: { maxChars: 1_000 } })
    expect(out.strategy).toBe('size:tail')
    expect(out.content.length).toBeLessThanOrEqual(1_000)
  })

  it('disable skips a cut by name', () => {
    const out = shrink(vitestOutput, { tool: 'bash' }, { budget: { maxChars: 2_000 }, disable: ['tests'] })
    // The tests cut must not run; a later cut may still recognise the text.
    expect(out.strategy).not.toMatch(/^tests/)
    const none = shrink(vitestOutput, { tool: 'bash' },
      { budget: { maxChars: 2_000 }, disable: ['tests', 'repeat'] })
    expect(none.strategy).toBe('size:tail')
  })

  it('only restricts and orders the cuts', () => {
    const out = shrink(vitestOutput, { tool: 'bash' }, { budget: { maxChars: 2_000 }, only: ['tests'] })
    expect(out.strategy).toBe('tests')
    const none = shrink(vitestOutput, { tool: 'bash' }, { budget: { maxChars: 2_000 }, only: [] })
    expect(none.strategy).toBe('size:tail')
  })

  it('extra cuts run before the built-ins', () => {
    const custom: Reducer = {
      name: 'custom',
      detect: () => true,
      reduce: text => ({
        content: 'CUSTOM WON',
        reduced: true,
        strategy: 'custom',
        note: 'custom note',
        stats: {
          inputChars: text.length, inputLines: 1,
          outputChars: 10, outputLines: 1,
        },
      }),
    }
    const out = shrink(vitestOutput, {}, { budget: { maxChars: 2_000 }, extra: [custom] })
    expect(out.strategy).toBe('custom')
    expect(out.content).toContain('CUSTOM WON')
  })
})

describe('spill', () => {
  const dir = join(tmpdir(), 'toolshrink-spill-test')
  beforeEach(() => rmSync(dir, { recursive: true, force: true }))

  it('saves the full original and appends the locator for the model', () => {
    const store = new FileSpillStore({ dir })
    const out = shrink(vitestOutput, { tool: 'bash' }, { budget: { maxChars: 2_000 }, spill: store })
    const locator = /spill:[a-z0-9_-]+/.exec(out.content)?.[0]
    expect(locator).toBeDefined()
    expect(out.content).toContain('[full output saved as')
    // The complete original comes back, character for character.
    expect(store.load(locator as string)).toBe(vitestOutput)
  })

  it('does not spill when nothing was cut', () => {
    const store = new FileSpillStore({ dir })
    const out = shrink('tiny', { tool: 'bash' }, { spill: store })
    expect(out.content).toBe('tiny')
  })

  it('rejects a malicious locator instead of reading a path', () => {
    const store = new FileSpillStore({ dir })
    expect(() => store.load('spill:../../etc/passwd')).toThrow(/bad spill locator/)
  })

  it('same content spills to the same locator', () => {
    const store = new FileSpillStore({ dir })
    const a = store.save('identical text', { tool: 'bash' })
    const b = store.save('identical text', { tool: 'bash' })
    expect(a).toBe(b)
  })
})

describe('loadReducers', () => {
  const dir = join(tmpdir(), 'toolshrink-plugins-test')
  beforeEach(() => {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
  })

  it('loads a valid cut from a file, name taken from the file name', async () => {
    writeFileSync(join(dir, 'mycut.mjs'), `
      export default {
        name: 'mycut',
        detect: () => false,
        reduce: () => null,
      }
    `)
    const loaded = await loadReducers(dir)
    expect(loaded.map(reducer => reducer.name)).toEqual(['mycut'])
  })

  it('fails loud when the file name and the cut name differ', async () => {
    writeFileSync(join(dir, 'wrongname.mjs'), `
      export default { name: 'other', detect: () => false, reduce: () => null }
    `)
    await expect(loadReducers(dir)).rejects.toThrow(/must match file name/)
  })

  it('fails loud when the export is not a cut', async () => {
    writeFileSync(join(dir, 'broken.mjs'), `export default { hello: true }`)
    await expect(loadReducers(dir)).rejects.toThrow(/not a Reducer/)
  })

  it('ignores files that are not JavaScript', async () => {
    writeFileSync(join(dir, 'README.md'), '# not code')
    expect(await loadReducers(dir)).toEqual([])
  })
})
