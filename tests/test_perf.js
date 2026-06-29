// tests/test_perf.js
// Performance guard for index-backed Shared-Part generation.
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

global.window = {};
const root = path.resolve(__dirname, '..');
const load = (rel) => {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  eval(src);
};

load('data/quran_text.js');
load('data/page_juz_map.js');
load('js/scope.js');
load('js/diffEngine.js');
load('js/sharedPartIndex.js');

const groups = JSON.parse(fs.readFileSync(path.join(root, 'data/similarities.json'), 'utf8'));
const map = window.pageJuzMap.byGid;
const DE = window.DiffEngine;
let failures = 0;
const assert = (cond, msg) => { if (!cond) { failures++; console.log('  x', msg); } };

const settings = (selection, extra = {}) => Object.assign({
  quranTextFormat: 'uthmani',
  selection,
  pool: 'confined',
  optionMin: 3,
  optionCap: 5,
  gapMode: 'full',
  contextCountBefore: 1,
  contextCountAfter: 1,
  distractorStrategy: 'adaptive',
  mixedStrategy: 'balanced'
}, extra);

const targetGroups = (selection) =>
  groups.filter(g => g.verses && g.verses.some(v => window.Scope.inSelection(v, selection, map)));

const measure = (iterations, fn) => {
  const times = [];
  let result = null;
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    result = fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return {
    result,
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    avg: times.reduce((a, b) => a + b, 0) / times.length
  };
};

console.log('perf) warm Shared-Part and Mixed response budgets');
const juz1 = settings({ mode: 'juz', juz: 1 });
const all = settings({ mode: 'all' }, { pool: 'all' });
const pages1To300Random = settings(
  { mode: 'pages', pageFrom: 1, pageTo: 300 },
  { mixedStrategy: 'random' }
);
const pages1To300TargetGroups = targetGroups(pages1To300Random.selection);

let t0 = performance.now();
DE._sharedPartIndexCache = null;
const coldAll = DE.generateCorpusSharedPartQuestions(groups, all, 30);
const coldAllMs = performance.now() - t0;
assert(coldAll.length === 30, 'cold all-quran shared generation should produce 30 questions');
assert(coldAllMs < 900, `cold all-quran shared generation should stay below 900ms, got ${coldAllMs.toFixed(2)}ms`);

DE.generateCorpusSharedPartQuestions(groups, juz1, 30);
DE.generateCorpusSharedPartQuestions(groups, pages1To300Random, 100);
const sharedJuz = measure(1000, () => DE.generateCorpusSharedPartQuestions(groups, juz1, 30));
const sharedAll = measure(1000, () => DE.generateCorpusSharedPartQuestions(groups, all, 30));
const mixedAll = measure(1000, () => DE.generateMixedQuestions(targetGroups({ mode: 'all' }), groups, all, 30));
const mixedPagesRandom = measure(1000, () => DE.generateMixedQuestions(pages1To300TargetGroups, groups, pages1To300Random, 30));
const mixedPagesRandom100 = measure(1000, () => DE.generateMixedQuestions(pages1To300TargetGroups, groups, pages1To300Random, 100));

console.log(`   cold all shared 30: ${coldAllMs.toFixed(3)}ms`);
console.log(`   warm juz1 shared 30 p95: ${sharedJuz.p95.toFixed(3)}ms`);
console.log(`   warm all shared 30 p95: ${sharedAll.p95.toFixed(3)}ms`);
console.log(`   warm all mixed 30 p95: ${mixedAll.p95.toFixed(3)}ms`);
console.log(`   warm pages 1-300 mixed random 30 p95: ${mixedPagesRandom.p95.toFixed(3)}ms`);
console.log(`   warm pages 1-300 mixed random 100 p95: ${mixedPagesRandom100.p95.toFixed(3)}ms`);

assert(sharedJuz.result.length === 30, 'warm juz1 shared should produce 30 questions');
assert(sharedAll.result.length === 30, 'warm all shared should produce 30 questions');
assert(mixedAll.result.length === 30, 'warm all mixed should produce 30 questions');
assert(mixedPagesRandom.result.length === 30, 'warm pages 1-300 mixed random should produce 30 questions');
assert(mixedPagesRandom100.result.length === 100, 'warm pages 1-300 mixed random should produce 100 questions');
assert(sharedJuz.p95 < 1, `warm juz1 shared p95 should stay below 1ms, got ${sharedJuz.p95.toFixed(3)}ms`);
assert(sharedAll.p95 < 1, `warm all shared p95 should stay below 1ms, got ${sharedAll.p95.toFixed(3)}ms`);
assert(mixedAll.p95 < 1, `warm all mixed p95 should stay below 1ms, got ${mixedAll.p95.toFixed(3)}ms`);
assert(mixedPagesRandom.p95 < 0.5, `warm pages 1-300 mixed random p95 should stay below 0.5ms, got ${mixedPagesRandom.p95.toFixed(3)}ms`);
assert(mixedPagesRandom100.p95 < 1, `warm pages 1-300 mixed random 100 p95 should stay below 1ms, got ${mixedPagesRandom100.p95.toFixed(3)}ms`);

console.log('\n' + (failures === 0 ? '✅ PERF CHECKS PASSED' : `❌ ${failures} PERF FAILURE(S)`));
process.exit(failures === 0 ? 0 : 1);
