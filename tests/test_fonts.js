// Regression check for Quran text rendering: it must not depend on host fonts.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const fontPath = path.join(root, 'assets/fonts/AmiriQuran.ttf');

const fail = (msg) => {
  console.error('  x', msg);
  process.exit(1);
};

if (!fs.existsSync(fontPath)) fail('missing bundled Quran font asset');
if (!/@font-face\s*{[^}]*font-family:\s*'Rasikhun Quran'[^}]*AmiriQuran\.ttf/s.test(css)) {
  fail('Rasikhun Quran @font-face is not wired to AmiriQuran.ttf');
}
if (!/--font-quran:\s*'Rasikhun Quran'/.test(css)) {
  fail('Quran text is not pinned to the bundled font first');
}
if (!/\.quran-text\s*{[^}]*font-family:\s*var\(--font-quran\)[^}]*font-synthesis:\s*none/s.test(css)) {
  fail('quran-text must use the pinned font without synthetic weight');
}

console.log('font) Quran text is pinned to bundled Rasikhun Quran');
