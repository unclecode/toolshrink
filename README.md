# toolshrink

**Cut large agent tool output by what it means, not by where it was cut.**

I use Claude Code every day, and I always wanted to intervene in how it manages
context. In the early days you could edit the session JSONL directly. Then that
door closed.

When DeepSeek open-sourced Harness, where everything is a plugin, I looked
inside. Tool output there is cut by size: keep the head, keep the tail, drop
the middle. I read Codex and pi, and they do the same. None of them look at
what the text contains.

That fails in a predictable way. Your test suite prints 5,000 passing lines and
3 failures in the middle. A size cut keeps the passes and throws away the
failures. The model reads it, believes the run, and answers wrong.

So I built the shrinker I always wished Claude Code had. It reads the output
first, recognizes its shape, and keeps the part that carries the information:

```
input: a vitest run, 31,958 chars, 805 lines, budget 2,000 chars

head+tail cut:   1,904 chars   the model learns: the summary
toolshrink:        255 chars   the model learns: which test failed,
                               why, at which line, and the summary
```

Everything removed is counted in a marker the model can read, and the complete
original is saved to disk with a locator. Nothing is lost silently.

## The cuts

Each cut recognizes one shape of text. The first one that recognizes the input
runs. When none does, the size fallback runs, so the result always fits the
budget.

| Cut | Recognizes | Keeps | Drops |
| --- | --- | --- | --- |
| `diff` | git diff, patches | changed lines, file and hunk headers, 1 context line each side | unchanged context |
| `json` | one JSON value | the structure, 3 samples per long array, 5 keys per wide object, counts | repeated records |
| `tests` | vitest, jest, pytest, cargo test, go test | failures with their explanation, the summary | passing tests |
| `build` | tsc, cargo, gcc, webpack, esbuild | errors and warnings with their code frame, the summary | build progress |
| `stacktrace` | node, Python, Java, Ruby traces | the message and frames in YOUR code | dependency frames, counted |
| `log` | timestamped logs | errors and warnings with the lines before them, the ending | routine lines |
| `tree` | find, ls -R, file listings | the structure, 8 entries per directory, counts | crowded directories |
| `repeat` | retry storms, progress spam | 2 samples per run plus "2,998 similar lines omitted" | consecutive near-identical lines |
| `size` | everything (fallback) | bash: the end · grep/read: the start · unknown: both ends | the rest, counted |

Nine cuts ship today. Each one is a plain file with a shared interface, so
adding your own is one file, not a fork.

Every cut follows four rules, taken from the three agents I read:

- never return a partial line (from pi)
- never split a UTF-16 surrogate pair (from DeepSeek Harness)
- say exactly how much was removed: `... 15,903 characters, 401 lines omitted ...` (from Codex)
- a second pass changes nothing

## Use it with DeepSeek Harness, complete setup

Copy-paste the whole block. It installs the library, configures Harness, and
starts the web UI with toolshrink active.

```sh
# 1. Get and build the library
git clone https://github.com/unclecode/toolshrink.git
cd toolshrink && npm install && npm run build

# 2. Mount the adapter on every Harness start
mkdir -p ~/.dsh
cat >> ~/.dsh/cordis.patch.yml <<EOF
- insert:
    - id: toolshrink
      name: $PWD/adapters/harness/toolshrink.mjs
      config:
        maxChars: 50000
EOF

# 3. Run Harness (installs itself through npx on first use)
npx @deepseek-ai/dsh@latest web
```

`~/.dsh/cordis.patch.yml` is read on every Harness start, for every profile.
To try toolshrink per run instead, put the same YAML in its own file and pass
`--patch that-file.yml`.

### Adapter config

```yaml
- insert:
    - id: toolshrink
      name: /path/to/toolshrink/adapters/harness/toolshrink.mjs
      config:
        maxChars: 50000        # cut above this many characters (default 50000)
        maxLines: 2000         # or above this many lines (default 2000)
        maxLineChars: 0        # cap single long lines, 0 = off (default 0)
        disable: [json]        # skip named cuts (default none)
        spillDir: ~/.dsh-toolshrink   # where full originals go
        log: /tmp/toolshrink.log      # one line per cut, omit for silence
```

The log line format: `bash  64151 -> 2942 via tree+size`.

## Use it as a library

```js
import { shrink, FileSpillStore } from 'toolshrink'

const out = shrink(bigText, { tool: 'bash', command: 'npm test' }, {
  budget: { maxChars: 20_000 },
  spill: new FileSpillStore({ dir: '/tmp/spills' }),  // optional
})

out.content   // the text to give the model
out.reduced   // false when the input already fit
out.strategy  // "tests", "diff+size", "size:tail", "none", ...
out.note      // one human-readable line about what happened
out.stats     // inputChars, outputChars, keptLines, droppedLines, ...
```

The `hint` (second argument) is optional and improves routing: `tool` picks the
size direction, `command` helps detect test runs and diffs, `path` helps detect
JSON and logs.

## Write your own cut

A cut is one file that default-exports three members. The file name is the cut
name.

```js
// mycut.mjs
export default {
  name: 'mycut',
  // Cheap and certain. When unsure, return false: a wrong match is worse
  // than the size fallback.
  detect(text, hint) {
    return hint.command?.startsWith('kubectl') ?? false
  },
  // Return null to decline after a closer look; the next cut then tries.
  reduce(text, hint, budget) {
    const content = text.slice(0, budget.maxChars) // your real logic here
    return {
      content,
      reduced: true,
      strategy: 'mycut',
      note: 'kept the part I know matters',
      stats: {
        inputChars: text.length, inputLines: 0,
        outputChars: content.length, outputLines: 0,
      },
    }
  },
}
```

Use it:

```js
import { shrink, loadReducers } from 'toolshrink'

const mine = await loadReducers('/path/to/my-cuts')   // reads the directory
shrink(text, hint, { extra: mine })                    // tried BEFORE built-ins
```

Or control the built-ins: `{ only: ['tests', 'diff'] }` restricts and orders,
`{ disable: ['json'] }` skips.

## Spill: nothing is lost

With a spill store, the complete original is saved before any cut, and the cut
text ends with:

```
[full output saved as spill:bash-d63d2aebb643: directories sampled to 8 entries each]
```

`store.load('spill:bash-d63d2aebb643')` returns the original, byte for byte.
Files are cleaned after 24 hours. The store is an interface; the default writes
files, a host can plug its own storage.

## What I saw in live use

With a 3,000-character budget, the agent got a 60,000-character `find` result
cut down to its head. Its reply began: *"The output was truncated. Let me get a
count by directory"* - it saw the omission marker, re-queried with aggregation,
and answered correctly from 4,000 total characters instead of 60,000.

That is the design working: an honest marker turns a cut from silent data loss
into a signal the model acts on. This is the intervention I always wanted, and
now it is a YAML row.

## TODO: cuts I want next

Each of these is one file with the same interface. Pick one and send a pull
request.

| Cut | Recognizes | Would keep |
| --- | --- | --- |
| `lint` | eslint, ruff, clippy | issues grouped by rule with counts, the worst files |
| `install` | npm, pip, cargo install | the summary, versions, vulnerabilities |
| `csv` | CSV and TSV bodies | header, a few rows, the row count |
| `gitlog` | git log | recent commits, the total count, the authors |
| `semantic` | anything, given the agent's current goal | the chunks most relevant to the goal. Two stages: lexical scoring (BM25, no model needed), then optional embedding scoring for meaning beyond shared words |

The `semantic` cut is the interesting one: every cut above decides by SHAPE,
this one would decide by RELEVANCE. It needs one extra input, a query for what
the agent is working on right now, which the host adapter can pass through the
`hint`.

## Adapters for other agents

The library knows nothing about any agent. The Harness adapter is 70 lines:
catch the result event, call `shrink`, return the replacement.

- **pi** (`earendil-works/pi`) has an extension API with tool-result access.
- **Codex** (`openai/codex`) has a plugin system in `codex-rs/core-plugins`.

Both adapters are open work. If you write one, a pull request is welcome.

## License

MIT. Use it, change it, no need to ask.

Built by [@unclecode](https://x.com/unclecode), author of
[Crawl4AI](https://github.com/unclecode/crawl4ai).
