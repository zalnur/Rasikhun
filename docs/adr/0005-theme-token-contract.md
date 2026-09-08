# 0005 — Theme token contract

## Context

Rasikhun ships a switchable theme system: `<html data-theme="…">` flips a set of
CSS-variable design tokens; Tailwind colors (`brand`, `ink`, `ink-soft`, `muted`,
`surface`, `surface-2`, `line`, `good`, `good-soft`, `good-ink`, `on-good`) resolve
to those tokens via `rgb(var(--x) / <alpha-value>)` in `tailwind.config.js`. Light/dark
is orthogonal, toggled by the `.dark` class on `<html>`. Default theme is `sukun`,
defined on `:root`; `glass` overrides via `[data-theme="glass"]`. Six more bespoke
themes (rasikhun, nur, mizan, nizam, tin, layl) are added per-theme, sourced from the
`design/<name>.html` mockups.

The design mockups and production CSS **do not share a token vocabulary**. This ADR is
the authoritative map so every theme block speaks production's language, not the
mockups'.

## The mandatory token set — every `[data-theme="X"]` block MUST set all of these

Tokens not set are inherited from `:root` (sukun) — the "inherit-what-you-don't-set"
footgun. To avoid sukun leaking through, set the full set, in both light and a
`.dark` companion (`[data-theme="X"].dark`):

**Colors (space-separated RGB triplets, no `#`):**
`--bg`, `--surface`, `--surface-2`, `--ink`, `--ink-soft`, `--muted`, `--line`,
`--verse-bg`, `--verse-border`, `--good`, `--good-ink`, `--good-soft`, `--on-good`.

**Accent scale (map the mockup's single `--accent` onto this ramp — `index.html`
actually uses `brand-100/400/500/600/700`, so set at least 100 + 400..700):**
`--brand-50 … --brand-900`. Use the mockup `--accent` for 500/600/700; derive
100/200/300 (soft tints) and 800/900 (deep) by lightening/darkening the same hue.

**Surfaces / chrome:**
`--bg-image`, `--bg-size`, `--bg-anim` (flat themes: opaque, `--bg-anim: none`,
a faint pattern in `--bg-image`; glass: animated gradient), `--panel-bg`,
`--panel-blur`, `--panel-border`, `--card-bg`, `--card-blur`, `--card-border`
(flat themes: `rgb(var(--surface))` opaque, `--panel-blur: none`).

**Fonts:**
`--font-ui`, `--font-display`, `--font-quran` (`--font-quran` is normally the vendored
`'Rasikhun Quran'` = AmiriQuran.ttf; keep it unless a theme truly differs).

## Mockup → production name map

The `design/*.html` `:root` blocks use these names; translate when porting:

| Mockup token        | Production equivalent                                   |
|---------------------|---------------------------------------------------------|
| `--accent`          | `--brand-500/600/700` (and a derived ramp)              |
| `--accent-soft`     | `--good-soft` (for success) or a derived `--brand-100`  |
| `--accent-ink`      | `--on-good` (for on-accent text) — decide per use       |
| `--border`          | `--line`                                                |
| `--pattern`/`--pattern-size` | `--bg-image` / `--bg-size`                     |
| `--faint`           | (inactive dots) map to a value; production dots default to `--line` |
| `--gap-bg`/`--gap-shadow` | hardcoded in markup today; keep per-theme inline if needed |
| `--shadow`          | not tokenized; shadows are Tailwind utilities           |
| `--radius`/`--radius-lg` | NOT token-driven — see "Radius" below              |
| `--line-strong` (nizam) | theme-local; consume inside the structural block     |
| `--good-solid` (tin) | map onto `--good`                                      |
| layl `--page*`/`--amber*` | theme-local; see "Structural themes"               |

`--accent-line` was removed (it had 0 consumers). If a theme needs an accent-line,
define **and consume** it inside that theme's block — do not re-add to `:root`.

## Accent model decision

**Keep `--brand-*` as the bridge.** Do not introduce parallel `--accent` consumers.
Each theme generates a `--brand-50..900` ramp from its mockup accent so every
`bg-brand-*` / `text-brand-*` / `ring-brand-*` utility re-skins automatically.

## Feedback-color policy (deliberate split)

- **Quiz correct-answer option card + disc + pulse glow**: theme-token-driven
  (`--good-soft` / `--good` / `--good-ink` / `--on-good`). Each theme's success
  color applies. (Dark `--on-good` is the near-black value so the disc passes AA.)
- **Score badge + result-screen pass/fail rows**: universal stoplight
  (`emerald-*` for correct, `red-*` for wrong), intentionally NOT themed. Pass/fail
  is a universal semantic, not a per-theme aesthetic.

## Radius — NOT token-driven (scoped overrides instead)

Corner radius is expressed as Tailwind utilities (`rounded-xl/2xl/3xl/full`) in the
markup. A global `--radius` bridge + migrating ~70 utilities was rejected as a risky,
low-value refactor. **Structural themes that need different radii use scoped overrides:**

```css
[data-theme="nizam"] .rounded-2xl,
[data-theme="nizam"] .rounded-3xl,
[data-theme="nizam"] .rounded-xl { border-radius: 0; }   /* sharp editorial */
```

This touches only the structural theme; sukun/glass are unaffected.

## Structural themes (nizam, layl) need markup hooks + scoped CSS, not just tokens

Color tokens cannot express these. Put structural overrides in a `[data-theme="X"] …`
scoped block (do not touch sukun/glass selectors):

- **nizam** — sharp corners (scoped radius-0 above), ruled-list options
  (`grid` → single-column ledger with hairline row dividers), segmented bar-scale
  progress, prompt underline + ruled metabar flourishes.
- **layl** — dark-first: define `[data-theme="layl"]` = night and
  `[data-theme="layl"]:not(.dark)` = room-lights-on. The verse sits on a lit
  `.verse-box` (a stable class on the quiz verse container, added for this purpose)
  styled `background: var(--page)` with a heavy drop shadow. layl has no standard
  `--surface-2`/`--brand` — map its `--amber*` onto the `--brand-*` ramp so
  `bg-brand-600` buttons render amber.

## Per-theme recipe (Round 2)

1. **Fonts**: add the family to `scripts/vendor_fonts.js` `FAMILIES` (`{query, display}`,
   copy weights exactly from the mockup's `<link>`), run `node scripts/vendor_fonts.js`.
2. **Tokens**: add `[data-theme="NAME"] { …full mandatory set… }` + `.dark` companion
   to `css/style.css`, translating names per the map above. Opaque surfaces unless the
   mockup is glass.
3. **Structure** (nizam/layl only): add the scoped `[data-theme="NAME"] …` block.
4. **Registry**: in `js/app.js` `themes[]`, drop the `soon: true` flag (and fix the
   swatch colors to match the theme's palette).
5. **Verify**: contrast ≥4.5 (aim 4.7) for every text/surface pair in both modes;
   `npm run build && npm test`; no new external URLs.

## Consequences

- Adding a theme is mostly one CSS block + one registry entry + fonts.
- The full-set rule prevents silent sukun leakage.
- layl's dark-first model is the one inversion; documented so the dark-mode toggle
  isn't shipped broken under layl.
