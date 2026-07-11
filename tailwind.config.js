/** @type {import('tailwindcss').Config} */
// Design tokens are CSS-variable-backed so a `data-theme` attribute on <html>
// re-skins the whole app. Token VALUES live in css/style.css
// (as space-separated RGB triplets, e.g. `--ink: 29 43 40`).
module.exports = {
  darkMode: "class",
  content: ["./index.html", "./js/**/*.js"],
  theme: {
    extend: {
      colors: {
        // Accent scale, theme-driven (teal for sukun, green for glass).
        brand: {
          50:  "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
        },
        // Semantic surfaces / text — auto-flip via .dark in style.css,
        // so markup uses one class (e.g. text-ink) in both modes.
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          soft:    "rgb(var(--ink-soft) / <alpha-value>)",
        },
        muted:   "rgb(var(--muted) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          2:       "rgb(var(--surface-2) / <alpha-value>)",
        },
        line: "rgb(var(--line) / <alpha-value>)",
        // Success state — theme-driven (sukun green, etc.). Used by the
        // correct-answer disc so each theme's success color applies.
        good: {
          DEFAULT: "rgb(var(--good) / <alpha-value>)",
          soft:    "rgb(var(--good-soft) / <alpha-value>)",
          ink:     "rgb(var(--good-ink) / <alpha-value>)",
        },
        "on-good": "rgb(var(--on-good) / <alpha-value>)",
        // Keep custom slate shades; default slate scale still available for glass.
        slate: { 750: "#273449", 850: "#172033" },
      },
    },
  },
};
