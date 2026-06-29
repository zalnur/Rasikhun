# Shared-Part generation uses a prepared index

Shared-Part Questions must keep their Correct Answer as the full set of matching
Locations in the active Selection, but discovering those matches by scanning the
Quran corpus at quiz-start time is too slow for large Selections.

We prepare a Shared-Part index in memory and sample from a cached Question bank
for the active Selection, Comparison Pool, text format, and option bounds. The
runtime response path is lookup, ranking jitter, and small-array shuffling; corpus
tokenization, phrase discovery, candidate scoring, and wrong Location-set
construction happen behind the index module.

## Considered options

- **Runtime corpus scan.** Simple and always fresh, but whole-Quran Shared-Part
  generation can exceed practical response time by orders of magnitude.
- **Build-time generated data file.** Fastest response path, but increases payload
  size and makes the corpus build pipeline more complex. Keep as a future option
  if in-browser preparation becomes too expensive.
- **Prepared in-memory index (chosen).** Preserves current data files and
  Location-keyed correctness while moving expensive work out of repeated quiz
  response.

## Consequences

- Shared-Part and Mixed quiz response can stay under a 1ms warm p95 budget.
- First preparation for a new Selection may still take noticeable time, so the app
  warms Shared-Part/Mixed settings during idle time.
- Correctness tests must keep comparing generated Shared-Part answers against an
  independent Quran corpus oracle.
- Performance tests guard the warm response budget separately from cold
  preparation time.
