# Mutashabeh handoff, 2026-06-29

This handoff covers the current state of the quiz engine work in `$USER/Documents/projects/mutashabeh`. It is meant for the next Codex session, not for end-user docs.

## current state

The app is a static Vue 3 Quran mutashabihat quiz. The current work adds a faster and more complete path for Shared-Part questions, keeps the newer mixed quiz type, and improves the tests so they use real Quran corpus scenarios instead of toy fixtures.

The working tree is not committed. Current changed files:

```text
M  index.html
M  js/app.js
M  js/diffEngine.js
M  package.json
M  tests/test_engine.js
?? docs/adr/0003-index-backed-shared-part-generation.md
?? js/sharedPartIndex.js
?? tests/test_perf.js
```

No secrets or credentials were found or added.

## where the domain rules are recorded

Read `CONTEXT.md` first. It defines the vocabulary the code now tries to follow: Group, Verse occurrence, Location, Question, Shared-Part Question, Selection, Comparison Pool, and Candidate Quality.

The important ADRs are:

```text
docs/adr/0001-answer-keyed-by-location.md
docs/adr/0002-corpus-derived-shared-part-candidates.md
docs/adr/0003-index-backed-shared-part-generation.md
```

Do not duplicate those decisions in a new doc unless the decision changes. Link to them.

## how question generation works

`js/app.js` owns the Vue state and turns the UI choices into engine settings. The main settings are quiz type, text format, Selection, Comparison Pool, option bounds, gap mode, context count, distractor strategy, and mixed strategy.

Selection has one active mode at a time:

```text
all
surahs, with one or more surah numbers
juz, with one or more juz numbers
pages, with pageFrom and pageTo
```

Comparison Pool is separate from Selection. `confined` means answer options and distractors stay inside the selected range. `all` means distractors may come from the whole Quran. Shared-Part correct answers never expand beyond the active Selection.

Completion questions still come mainly from curated similarity groups in `data/similarities.json`. `DiffEngine.generateQuestion` chooses a target Location, hides either the full target text or only the differing part, and builds options keyed by Location. If two Locations have identical wording, the UI shows one option but the option carries all matching Locations internally.

Shared-Part questions use `js/sharedPartIndex.js`. This module scans the Quran corpus, discovers repeated two to five word phrases, scores them, and builds a cached question bank per active settings shape. The public interface is intentionally small:

```text
window.SharedPartIndex.create(...)
index.sharedCandidates(settings)
index.questionBank(settings, needed)
index.sampleQuestions(settings, limit)
index.warm(settings)
```

The correct answer for a Shared-Part question is not the source group. It is the full set of Quran Locations in the active Selection whose cleaned text contains the shared segment. That rule fixed the earlier Al-Baqara 68, 69, 71 bug: verse 71 is included because the corpus oracle finds it, even if the curated source group missed it.

The index uses a plain-word inverted map to avoid scanning every verse for every candidate. It strips common Arabic clitic prefixes when looking up candidate words, then still verifies the final match with cleaned text containment. That lookup step is only a shortcut. It does not decide correctness by itself.

Mixed quizzes call the Shared-Part path plus the completion path. Shared-Part is now indexed and warm-sampled. Completion generation is still live work at quiz time.

## why performance changed

The previous Shared-Part path discovered repeated text and searched the corpus during quiz generation. That was fine for tiny scopes, but too slow for bigger question sets.

The new design pays that cost once per settings key, then samples from a prepared question bank. `js/app.js` also prewarms Shared-Part and Mixed settings during idle time after the user changes the advanced options.

Warm response is now the fast path. Cold preparation for a new Selection can still take hundreds of milliseconds, especially for all Quran or large page ranges. That is expected with the current browser-only design.

If the product needs 100-question mixed quizzes below 1ms too, the next likely step is a prepared Completion question bank or a full QuizPlan module that caches both quiz types under the same settings key.

## tests and verification

Commands were run on 2026-06-29 from `$USER/Documents/projects/mutashabeh`.

Main test command:

```bash
flatpak-spawn --host $USER/.nvm/versions/node/v24.17.0/bin/npm test
```

Result:

```text
ALL CHECKS PASSED

perf) warm Shared-Part and Mixed response budgets
   cold all shared 30: 1142.324ms
   warm juz1 shared 30 p95: 0.037ms
   warm all shared 30 p95: 0.034ms
   warm all mixed 30 p95: 0.590ms

PERF CHECKS PASSED
```

The npm wrapper printed a Node version warning before running the tests, but the test process exited with code 0.

Extra checks:

```bash
flatpak-spawn --host $USER/.nvm/versions/node/v24.17.0/bin/node --check js/app.js
flatpak-spawn --host $USER/.nvm/versions/node/v24.17.0/bin/node --check js/sharedPartIndex.js
flatpak-spawn --host $USER/.nvm/versions/node/v24.17.0/bin/node --check js/diffEngine.js
git diff --check
flatpak-spawn --host $USER/.nvm/versions/node/v24.17.0/bin/npm run build
```

Result:

```text
node --check: passed
git diff --check: passed
npm run build: passed
```

The build printed the usual Browserslist outdated notice. It finished successfully and rebuilt `css/tailwind.css`.

The page 1 to page 300 mixed random stress probe was also rerun:

```text
pages 1-300 targetGroups=209
cold shared 30=727.510ms count=30
warm shared 30 pages 1-300:
  count=30
  types={"sharedPart":30}
  avg=0.0297ms
  p50=0.0272ms
  p95=0.0396ms
  p99=0.0620ms
  max=0.8298ms

warm mixed random 30 pages 1-300:
  count=30
  types={"sharedPart":21,"completion":9}
  avg=0.4972ms
  p50=0.4681ms
  p95=0.8043ms
  p99=1.0549ms
  max=2.5854ms

warm mixed random 100 pages 1-300:
  count=100
  types={"completion":47,"sharedPart":53}
  avg=3.1994ms
  p50=3.1812ms
  p95=4.5413ms
  p99=5.1501ms
  max=5.6588ms
```

Interpretation: Shared-Part is comfortably under the 1ms warm p95 budget. Mixed random 30 is also under 1ms at p95 for this page range. Mixed random 100 is not under 1ms because completion questions are still generated live.

## what the tests protect

`tests/test_engine.js` now checks real Quran data. It verifies basic invariants, location-keyed answer behavior, confined pool behavior, identical wording collapse, starved scopes, Shared-Part correctness against an independent corpus scan, mixed quiz behavior, and the known Al-Baqara regressions.

Specific real-data cases protected:

```text
Baqarah 21 and 63: "لَعَلَّكُمۡ تَتَّقُونَ"
Baqarah 68, 69, and 71: the missing verse 71 regression
Juz 1 Shared-Part generation has more than the old six-question ceiling
Shared-Part wrong options stay inside the confined pool
Wrong Shared-Part options include confusing multi-location sets
Mixed Juz 1 fills the requested count with both completion and Shared-Part questions
```

`tests/test_perf.js` guards the warm response budget for Shared-Part and Mixed generation. It treats cold all-Quran Shared-Part preparation as a separate budget with a higher ceiling, currently 2000ms.

## known limits

Cold preparation is still visible work. The app hides most of that by warming during idle time, but a brand-new large Selection can still cost around 700ms to 1150ms in the current measurements.

The 100-question Mixed path is not below 1ms. That is not a Shared-Part issue anymore. It comes from the completion side still doing live generation.

The current design is in-memory and browser-side. If cold preparation becomes unacceptable on slow devices, consider a build-time generated index file. That would trade payload size and build complexity for faster first-use behavior.

## suggested next work

Add the page 1 to page 300 mixed random probe to `tests/test_perf.js` if that scenario should become a permanent guard.

Design a `CompletionQuestionBank` or `QuizPlan` module if the product needs large mixed quizzes under 1ms. Keep the same rule as Shared-Part: expensive discovery and scoring happens once per settings key, quiz start only samples prepared questions.

After that, take a quick visual pass in Brave. The UI work before this was good, but performance changes can still affect loading states and "limited range" prompts.

## suggested skills

Use these in the next session if the work continues:

```text
diagnosing-bugs, for any reported bad answer or perf regression
codebase-design, for the CompletionQuestionBank or QuizPlan boundary
domain-modeling, if Selection, Comparison Pool, or correctness rules change
tdd, before touching quiz generation again
frontend-design, if the next work affects loading or quiz UI
handoff, before handing this to another session
```
