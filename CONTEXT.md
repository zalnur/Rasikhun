# Rasikhun — اختبار متشابهات القرآن (Mutashabihat Quiz)

A quiz app that tests a ḥāfiẓ's mastery of the *mutashabihāt* — Quranic verses that resemble each other in wording but differ in location or detail — by asking which completion is correct for a given context.

## Language

### Core domain

**Group** (مجموعة متشابهات):
A cluster of verses deemed textually similar. The unit a single question is built from. Each Group carries a similarity `score` and a stable `id`.
_Avoid_: similarity set, verse family.

**Verse occurrence** (ورود الآية):
One ayah appearing in one Group — a *text* plus the *Location* where that text occurs. The same verse text can recur as distinct occurrences across Groups and across surahs.
_Avoid_: ayah (too generic), line, entry.

**Location** (موضع):
The canonical identity of an occurrence: the combination of global index (`gid`), surah, and ayah number. Two occurrences with identical wording but different gids are **different Locations** and therefore different answers.
_Avoid_: position, reference, place.

### Quiz mechanics

**Question** (سؤال):
What the user is tested on: a target Location is hidden (in full or in part) inside its verse's displayed text, and the user must identify it.
_Avoid_: prompt, item.

**Shared-Part Question** (سؤال المواضع المشتركة):
A Question that names a wording segment discovered from a Group, and asks which selected Locations contain that segment. Its Correct Answer is the full set of matching Locations in the active Selection, not just the Locations present in the source Group. The Comparison Pool may widen distractor/options, but never widens the Correct Answer.
_Avoid_: phrase quiz, count quiz.

**Option** (خيار):
An answer choice offered for a Question. In a completion Question it offers wording; in a Shared-Part Question it offers a set of Locations. An Option has a *display text* (which may be shared by several Locations) and is *keyed by Location*. Identical-wording Locations collapse to a single Option at question time; their distinct Locations are revealed only after answering.
_Avoid_: choice, answer-button, distractor.

**Correct Answer** (الموضع الصحيح):
For a completion Question: the target Location. For a Shared-Part Question: the set of Locations that contain the named shared segment. Correctness is judged by Location identity, never by text equality.
_Avoid_: the right text, matching string.

### Scoping

**Selection** (المجال المختار):
The region the target verse (Question's Location) is drawn from. Exactly one **mode** is active at a time — mutually exclusive: *All*, *Surahs* (one or more), *Juz* (one or more), *Pages* (a contiguous range). Modes never combine.
_Avoid_: filter, scope (ambiguous), range (reserved for Pages).

**Comparison Pool** (مصدر المُشتّتات):
The region distractor Options are drawn from — an orthogonal toggle applied to whatever Selection is active. Two values only: **Confined** (distractors come from within the Selection) or **Against-all** (distractors come from the whole Quran). Reused across every Selection mode.
_Avoid_: difficulty, scope (that's Selection).

**Distractor Selection** (اختيار المُشتّتات):
When a Group offers more distinct Option texts than the cap allows, the rule deciding which distractors survive. Two modes: **Adaptive** (default — keep the most textually similar distractors, i.e. the nearest twins) and **Random** (a side option — pick distractors at random for replay variety). The cap (3) is a fixed maximum, not a guaranteed count.
_Avoid_: difficulty, filtering.
