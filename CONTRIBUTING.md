# Contributing

## Add a cut

The most useful contribution is a new cut. The TODO table in the README lists
the ones I want next: lint, install, csv, gitlog, semantic.

A cut is one file in `src/reducers/`. The file name is the cut name. It
default-exports `{ name, detect, reduce }`; the interface is in
`src/types.ts` and every shipped cut is an example.

Rules a cut must follow:

1. **`detect` is cheap and certain.** Read the first lines, not the whole
   text. When unsure, return false: the size fallback losing the middle is
   bad, but a wrong cut throwing away the one line that mattered is worse.
2. **`reduce` declines when it gains nothing.** Return null and the next cut
   tries. A diff that is all changes, a log that is all errors: not yours.
3. **Never return a partial line. Never split a surrogate pair.** The helpers
   in `src/text.ts` do both correctly; use them.
4. **Count what you remove.** Use `omissionMarker`. A cut the model cannot
   detect is silent data loss.
5. **Respect the budget always.** When your kept lines still exceed it, finish
   with `reduceBySize` like the shipped cuts do.
6. **Tests, with realistic fixtures.** Write the output the way the real tool
   prints it. Two of the shipped cuts had real bugs that only realistic
   fixtures caught. Include: it detects, it keeps the signal, it drops the
   noise, it declines when it should, it never exceeds the budget.

Add the cut to `BUILTIN_REDUCERS` in `src/pipeline.ts`, most-certain detector
first, and one row to the README table.

## Adapters

The pi and Codex adapters are open. Follow `adapters/harness/toolshrink.mjs`:
catch the platform's tool-result event, call `shrink`, return the replacement.
Keep all logic in the library.

## Any change

`npm test` must pass. `npx tsc --noEmit` must be clean. Explain in the pull
request what output you tested against.

## Report a problem

Open an issue with: the tool that produced the output, a sample of it (cut the
sensitive parts), which strategy the log line named, and what you expected
instead.
