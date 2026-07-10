# Runtime JS dependencies are vendored, not installed or CDN-linked

The app is a no-build static SPA: a plain `index.html` loaded straight from
disk and served as static assets by Cloudflare. It previously pulled Vue,
canvas-confetti, and lucide from CDNs (`unpkg` / `jsdelivr`), so it broke
whenever it was opened without internet — "Vue is not available."

We vendor the runtime JS dependencies into `vendor/` and reference them
locally. Vue (`vendor/vue.global.prod.js`, pinned 3.5.39) and canvas-confetti
(`vendor/canvas-confetti.min.js`, pinned 1.6.0) are committed to the repo at
exact versions. lucide was removed entirely: it had zero `data-lucide` hooks
in the DOM, so its only call site (`lucide.createIcons()`) was a no-op and
every icon was already inline `<svg>`.

This matches how the repo already ships other third-party assets: the Amiri
Quran font lives in `assets/fonts/` and the compiled Tailwind CSS is committed
as `css/tailwind.css`. Vendoring keeps the same single delivery shape — one
static directory — and removes all runtime network dependency.

## Considered options

- **Introduce a dev mode / bundler (Vite or similar) with npm-installed runtime deps.**
  The intuitive fix, but it changes the architecture: it adds a build step, a
  `dist/` artifact, and runtime `node_modules` to the delivery path for a problem
  that is three files on someone else's server. Rejected — incompatible with the
  no-build static-site design and a far larger change than the bug warrants.
- **Keep the CDNs, add offline fallback/cache.** More moving parts than
  vendoring and still dependent on a first online load. Rejected.
- **Vendor the files locally (chosen).** Smallest diff, zero runtime network
  dependency, version-pinned, consistent with existing font/CSS handling.

## Consequences

- The app is fully offline-capable; every `src`/`href` in `index.html` resolves
  to a local file.
- Updating Vue or canvas-confetti is now a manual, deliberate act (download a
  pinned build into `vendor/`). The floating `@latest` / `@3` tags are gone, so
  builds are reproducible and no longer drift on CDN updates.
- `vendor/` must not be gitignored. It is part of the delivery, not a
  regenerable artifact like `node_modules`.
- If a future dependency genuinely needs a build step (e.g. `.vue` SFCs, JSX),
  revisit this decision and supersede it — but do so for a real need, not to
  fix an outage caused by a missing file.
