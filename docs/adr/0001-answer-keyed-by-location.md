# Answer correctness is keyed by Location (gid), not by text

The Correct Answer to a Question is the target **Location** (`gid`), not a wording
string. Options are keyed by Location; an Option is correct iff its set of
Locations contains the target. Identical-wording verses (same text, different
surahs) collapse to a single Option at question time, and their distinct
Locations are revealed only after answering.

## Considered options

- **Location-keyed (chosen).** Options carry one-or-more Locations; correctness
  is Location-membership. Fixes duplicate-identical options structurally and
  gives the "reveal where it appears" behavior a real data anchor.
- **Cosmetic text-dedup only.** Keep judging by `option.text === correctAnswer`,
  just hide visual dupes. Rejected: it leaves identical-wording verses genuinely
  indistinguishable, so the "show where it appears" reveal has nothing precise
  to point at, and the bug's root cause (string identity) stays.

## Consequences

- Question objects change shape: `correctAnswer` becomes a `gid`; `options`
  becomes a list of `{ text, locations: gid[] }`.
- The post-answer reveal and the result-review screen render per-Location, not
  per-string.
- The Quranpedia `/similar` scholarly note (التوجيه) can later attach to a
  Location, since identity is now locational.
