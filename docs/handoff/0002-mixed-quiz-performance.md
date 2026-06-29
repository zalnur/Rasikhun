# Mutashabeh handoff, 2026-06-29

This handoff covers the mixed quiz performance work after
`docs/handoff/0001-init-handoff-prod.md`. The user pushed back on treating
`0.7ms` as good enough. The working rule for this pass was simple: improve warm
Mixed generation if we can do it without reducing user experience, correctness,
or completeness.

## current state

The working tree is not committed. Current changed files:

```text
M  js/diffEngine.js
M  js/sharedPartIndex.js
M  package.json
M  tests/test_perf.js
?? scripts/run-tests.sh
?? docs/handoff/0002-mixed-quiz-performance.md
```

No secrets or credentials were found or added.

## strategy used

The public Interface stayed the same:

```text
window.DiffEngine.generateMixedQuestions(targetGroups, allGroups, settings, length)
```

The optimization was kept inside that Module. Callers still pass the same
Selection, Comparison Pool, settings, and requested length. Tests still exercise
the public engine path rather than private helpers.

The work used a small TDD loop:

1. Add a tighter performance guard for the real page-range case.
2. Watch it fail on the old path.
3. Change only the Mixed generation implementation.
4. Run the full correctness suite, not only perf.
5. Keep the stricter guard once the full suite passed.

The domain model did not change. Selection still controls which Locations can be
correct. Comparison Pool still controls distractor eligibility. Shared-Part
correctness is still the full set of matching Locations in the active Selection.
No `CONTEXT.md` edit was needed, and no ADR was added because this is a
reversible implementation optimization.

## what was slow

`generateMixedQuestions` did extra work in the warm random path.

Before this pass, `take(type, 1)` restarted from the beginning of `corpusShared`
and `groups` each time the random strategy wanted one Question. The `used` set
kept correctness intact, but the implementation repeatedly scanned already-used
items. That hurt 30-question random mixed quizzes and made 100-question random
mixed quizzes much worse.

There was also a full-array random sort in the hot path:

```js
arr.sort(() => Math.random() - 0.5)
```

That is slower than needed and gives poor shuffle quality.

## what changed

`js/diffEngine.js` now uses:

- Fisher-Yates shuffle for prepared Shared-Part questions.
- Lazy Fisher-Yates for target Groups. The engine only shuffles as far as it
  needs to draw Questions.
- Per-type cursors for `completion` and `sharedPart`, so the engine advances
  through candidate Groups instead of restarting each draw.
- A separate cursor for corpus-backed Shared-Part questions.
- Cached `settingsByType`, so completion and shared-part calls do not rebuild
  settings for every candidate Group.

The implementation still uses one `used` set, so a Group or corpus Shared-Part
Question is not reused in the same Mixed quiz. If Shared-Part corpus candidates
run out, the engine can still fall back to group-backed Shared-Part generation,
same as before.

## bug caught during the refactor

The full engine suite caught a real regression before the change was finished.
An intermediate version shadowed `typedSettings` inside `nextGroupQuestion`, then
passed `undefined` settings into `generateQuestion`. That made completion
Questions fall back to default all-Quran settings and leak outside the active
Selection and Comparison Pool.

The failing assertions were in `tests/test_engine.js`, section `9) mixed quiz
generation`. The fix was to keep one `settingsByType` object and pass
`settingsByType[type]`.

This is worth remembering: the perf test alone would not have caught that bug.
Always run the correctness suite after changing quiz generation.

## performance results

Run command:

```bash
flatpak-spawn --host $USER/.nvm/versions/node/v24.17.0/bin/npm test
```

Latest passing perf output:

```text
cold all shared 30: 793.376ms
warm juz1 shared 30 p95: 0.028ms
warm all shared 30 p95: 0.024ms
warm all mixed 30 p95: 0.351ms
warm pages 1-300 mixed random 30 p95: 0.318ms
warm pages 1-300 mixed random 100 p95: 0.742ms
```

The previous handoff recorded the same page 1-300 random mixed 100 probe at
`avg=3.1994ms` and `p95=4.5413ms`. After this pass, 100-question Mixed random is
under the existing 1ms warm p95 target on this machine.

There was a second pass on cold Shared-Part preparation. The index now caches
word cleaning and plain-word normalization, builds phrase keys incrementally
instead of repeatedly slicing and joining word arrays, skips a dead
`exactEndGids` write, caches repeated Candidate Quality checks by Location set,
and avoids rebuilding a gid lookup map inside `_buildSharedPartQuestion`.

The cold guard in `tests/test_perf.js` is now:

```text
cold all-quran shared 30 < 900ms
```

That is intentionally separate from the warm guards. Cold preparation is still
the largest remaining cost, but this pass brought the latest Node 24 runs down
to about `791ms` to `793ms` on this machine.

The npm warning still appears when the npm executable is launched directly:

```text
npm v11.13.0 does not support Node.js v18.19.1
```

That warning comes from npm's `#!/usr/bin/env node` shebang. The new test runner
in `scripts/run-tests.sh` makes the actual test payload run with the Node binary
that belongs to the npm install, so the warning is noisy but the test runtime is
stable.

## verification done

These checks passed:

```bash
flatpak-spawn --host $USER/.nvm/versions/node/v24.17.0/bin/npm test
flatpak-spawn --host $USER/.nvm/versions/node/v24.17.0/bin/node --check js/diffEngine.js
git diff --check
flatpak-spawn --host env PATH=$USER/.nvm/versions/node/v24.17.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin $USER/.nvm/versions/node/v24.17.0/bin/npm run build
```

The build printed the usual Browserslist outdated notice and completed
successfully.

## test changes

`tests/test_perf.js` now has permanent guards for the page 1-300 random Mixed
case:

```text
warm pages 1-300 mixed random 30 p95 < 0.5ms
warm pages 1-300 mixed random 100 p95 < 1ms
```

The test warms the Shared-Part question bank for 100 Questions before measuring,
then measures the Mixed response path against precomputed page 1-300 target
Groups. That keeps setup work out of the timed loop.

## next likely work

Warm Mixed generation is no longer the obvious bottleneck. Cold Shared-Part
preparation is still the next serious target, even after the first pass above.
It is now under the local 900ms guard, but it is still visible work on the
all-Quran cold path.

Do not improve cold time by weakening the domain rules. Correct answers for
Shared-Part Questions must still come from a corpus scan over the active
Selection, and distractors must still obey Comparison Pool. Better next options:

- Profile `SharedPartIndex.sharedCandidates()` and `questionBank()`.
- Check whether candidate discovery can cache more per text format before
  Selection-specific filtering.
- Consider a build-time generated index only if browser-side cold preparation is
  still too visible on slower devices.
- Keep cold and warm budgets separate. A warm regression should not hide behind a
  cold prep number, and a cold prep improvement should not loosen warm response
  budgets.

## suggested skills

Use these next:

```text
diagnosing-bugs, for any reported bad answer or perf regression
tdd, before touching quiz generation again
codebase-design, if a new CompletionQuestionBank or SharedPartIndex seam is considered
domain-modeling, only if Selection, Comparison Pool, or correctness rules change
handoff, before passing the repo to another session
humanizer, when editing handoff or user-facing docs
```
