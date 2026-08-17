import { reduceTestOutput } from '../src/reducers/tests.js'
import { reduceBySize } from '../src/reducers/size.js'
import { DEFAULT_BUDGET } from '../src/types.js'

// A realistic run: 800 tests pass, 1 fails in the middle.
const lines = [
  ' RUN  v2.1.9',
  ...Array.from({ length: 400 }, (_, i) => ` ✓ test/unit-${i}.test.ts (4 tests) 12ms`),
  ' ✗ test/payment.test.ts > refunds a cancelled order',
  '   AssertionError: expected 0 to be 250',
  '    ❯ test/payment.test.ts:88:24',
  ...Array.from({ length: 400 }, (_, i) => ` ✓ test/later-${i}.test.ts (2 tests) 8ms`),
  '      Tests  1 failed | 812 passed (813)',
]
const text = lines.join('\n')
const budget = { ...DEFAULT_BUDGET, maxChars: 2000 }

const found = (s: string) => [
  s.includes('refunds a cancelled order') ? 'the failing test' : null,
  s.includes('expected 0 to be 250') ? 'why it failed' : null,
  s.includes('payment.test.ts:88') ? 'where it failed' : null,
  s.includes('1 failed | 812 passed') ? 'the summary' : null,
].filter(Boolean)

console.log(`  input: ${text.length.toLocaleString()} chars, ${lines.length} lines`)
console.log(`  budget: ${budget.maxChars.toLocaleString()} chars\n`)

const cut = reduceBySize(text, {}, budget)
console.log(`  head+tail (what Codex, pi and Harness all do)`)
console.log(`    ${cut.content.length} chars, model learns: ${found(cut.content).join(', ') || 'NOTHING'}`)

const smart = reduceTestOutput(text, {}, budget)!
console.log(`\n  toolshrink`)
console.log(`    ${smart.content.length} chars, model learns: ${found(smart.content).join(', ')}`)
console.log(`\n  ---- toolshrink output ----`)
console.log(smart.content.split('\n').map(l => '  ' + l).join('\n'))
