// UI guard: Shared-Part answer-display mode is visible in advanced settings.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

let failures = 0;
const assert = (cond, msg) => { if (!cond) { failures++; console.log('  x', msg); } };

assert(html.includes('عرض إجابات المواضع المشتركة'), 'advanced settings should expose Shared-Part answer display');
assert(html.includes("sharedPartOptionDisplay = 'openings'"), 'UI should let Shared-Part answers use verse openings');
assert(html.includes("sharedPartOptionDisplay = 'refs'"), 'UI should let Shared-Part answers use verse references');
assert(html.includes('[5, 10, 20, 30, 50, 100]'), 'quiz length selector should include 50 and 100 questions');
assert(app.includes('sharedPartOptionDisplay'), 'app settings should carry Shared-Part answer display to the engine');

console.log(failures === 0 ? 'ui) Shared-Part answer display option is visible' : `ui) ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
