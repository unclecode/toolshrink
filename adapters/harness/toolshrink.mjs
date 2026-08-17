// toolshrink adapter for DeepSeek Harness.
//
// Listens on `tools/post-execute`, the waterfall that may accept, replace,
// enrich, or block a tool result before the model sees it. Delegates with
// next() first; when the settled decision leaves the result's text in place
// and that text is over budget, replaces it with the library's cut and
// returns `{ kind: 'accept', content }`, the documented replacement form.
//
// The full original is spilled to disk before any cut, and the cut text ends
// with the spill locator, so the model can ask for the complete output.
//
// Config (all optional):
//   maxChars, maxLines, maxLineChars   the budget; defaults 50000 / 2000 / 0
//   disable: ['json', ...]             skip named cuts
//   spillDir                           where originals go; default ~/.dsh-toolshrink
//   log                                a file that receives one line per cut

import { appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { shrink, FileSpillStore, DEFAULT_BUDGET } from 'toolshrink'

export const name = 'toolshrink'
export const inject = ['tools']

export function apply(ctx, config = {}) {
  const budget = {
    maxChars: config.maxChars ?? DEFAULT_BUDGET.maxChars,
    maxLines: config.maxLines ?? DEFAULT_BUDGET.maxLines,
    maxLineChars: config.maxLineChars ?? DEFAULT_BUDGET.maxLineChars,
  }
  const disable = config.disable ?? []
  const spill = new FileSpillStore({ dir: config.spillDir ?? join(homedir(), '.dsh-toolshrink') })
  const note = (text) => {
    if (config.log) appendFileSync(config.log, text + '\n')
  }

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()

    // Respect upstream: a block, or a replacement that already rewrote the
    // content, is not ours to second-guess. We only shrink text that is
    // actually going to the model unchanged.
    if (decision && decision.kind !== 'accept') return decision
    if (decision?.value !== undefined) return decision
    const blocks = decision?.content ?? result?.content
    if (!Array.isArray(blocks)) return decision

    const args = exec?.arguments ?? {}
    const hint = {
      tool: String(exec?.name ?? ''),
      ...(typeof args.command === 'string' ? { command: args.command } : {}),
      ...(typeof args.file_path === 'string' ? { path: args.file_path }
        : typeof args.path === 'string' ? { path: args.path } : {}),
    }

    let changed = false
    const smaller = blocks.map((block) => {
      if (block?.type !== 'text' || typeof block.text !== 'string') return block
      const out = shrink(block.text, hint, { budget, disable, spill })
      if (!out.reduced) return block
      changed = true
      note(`${hint.tool.padEnd(14)} ${out.stats.inputChars} -> ${out.stats.outputChars} via ${out.strategy}`)
      return { ...block, text: out.content }
    })

    if (!changed) return decision
    return { ...(decision ?? {}), kind: 'accept', content: smaller }
  })

  ctx.effect(() => () => note('# toolshrink unloaded'))
}
