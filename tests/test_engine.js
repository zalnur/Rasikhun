// tests/test_engine.js
// فحوص ذاتية لمحرك generateQuestion: المواضع، عدم التكرار، السقف، المجال/المصدر.
// شغّل: node tests/test_engine.js
const fs = require('fs');
const path = require('path');

global.window = {};
const root = path.resolve(__dirname, '..');
const load = (rel) => {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  // تنفيذ ملفات window.* في سياق الـ mock
  eval(src);
};

load('data/quran_text.js');
load('data/page_juz_map.js');
load('js/scope.js');
load('js/diffEngine.js');
const groups = JSON.parse(fs.readFileSync(path.join(root, 'data/similarities.json'), 'utf8'));

const map = window.pageJuzMap.byGid;
const DE = window.DiffEngine;
let failures = 0;
const assert = (cond, msg) => { if (!cond) { failures++; console.log('  ✗', msg); } };
const sameLocations = (a, b) => a.length === b.length && a.every(g => b.includes(g));

const gen = (n, settings) => {
  const qs = [];
  for (let i = 0; i < n; i++) {
    const g = groups[Math.floor(Math.random() * groups.length)];
    const q = DE.generateQuestion(g, groups, settings);
    qs.push(q);
  }
  return qs.filter(Boolean);
};

// === 1. Invariants الأساسية ===
console.log('1) invariants (all, adaptive, cap 3, full gap)');
const base = gen(400, { quranTextFormat: 'uthmani', gapMode: 'full', selection: { mode: 'all' }, pool: 'all', optionCap: 3, distractorStrategy: 'adaptive' });
base.forEach(q => {
  assert(typeof q.correctAnswer === 'number', 'correctAnswer must be a gid (number)');
  assert(q.options.length >= 2 && q.options.length <= 3, `option count out of [2,3]: ${q.options.length}`);
  const texts = q.options.map(o => o.text);
  assert(new Set(texts).size === texts.length, 'duplicate option texts present (bug 1 regression)');
  const correctOpts = q.options.filter(o => o.locations.includes(q.correctAnswer));
  assert(correctOpts.length === 1, `expected exactly one correct option, got ${correctOpts.length}`);
  q.options.forEach(o => assert(Array.isArray(o.locations) && o.locations.length >= 1, 'option missing locations'));
});

// === 2. وضع الفروق ===
console.log('2) invariants (diff gap mode)');
const diff = gen(400, { gapMode: 'diff', selection: { mode: 'all' }, pool: 'all', optionCap: 3, distractorStrategy: 'adaptive' });
diff.forEach(q => {
  const texts = q.options.map(o => o.text);
  assert(new Set(texts).size === texts.length, 'diff mode: duplicate option texts');
  assert(q.options.length >= 2 && q.options.length <= 3, 'diff mode: option count');
  assert(q.options.some(o => o.locations.includes(q.correctAnswer)), 'diff mode: correct option exists');
});

// === 3. السقف مع مجموعات كبيرة ===
console.log('3) cap respected for large groups');
const bigGroups = groups.filter(g => g.verses.length >= 6);
const bigQs = bigGroups.map(g => DE.generateQuestion(g, groups, { gapMode: 'full', selection: { mode: 'all' }, pool: 'all', optionCap: 3 })).filter(Boolean);
console.log(`   large groups tested: ${bigQs.length}, max options seen: ${Math.max(...bigQs.map(q => q.options.length))}`);
bigQs.forEach(q => assert(q.options.length <= 3, `large group exceeded cap: ${q.options.length}`));

// === 4. المجال: juz محدد ===
console.log('4) selection confined to juz 2');
const juz2 = gen(300, { gapMode: 'full', selection: { mode: 'juz', juz: 2 }, pool: 'all', optionCap: 3 });
juz2.forEach(q => {
  assert(map[q.targetGid].juz === 2, `target not in juz 2: gid ${q.targetGid} → juz ${map[q.targetGid]?.juz}`);
});

// === 5. المصدر confined: يجب أن تكون المشتتات داخل المجال ===
console.log('5) pool confined keeps distractors inside selection (juz 28)');
const confined = gen(300, { gapMode: 'full', selection: { mode: 'juz', juz: 28 }, pool: 'confined', optionCap: 3 }).filter(Boolean);
console.log(`   confined juz28 questions generated: ${confined.length} (narrow scopes naturally yield fewer)`);
confined.forEach(q => {
  const allLocs = q.options.flatMap(o => o.locations);
  allLocs.forEach(g => assert(map[g].juz === 28, `confined pool leaked: gid ${g} juz ${map[g].juz}`));
});

// === 6. bug التكرار: مجموعة بنص متطابق ===
console.log('6) identical-wording collapse');
let foundIdentical = false;
for (const g of groups) {
  const cleans = g.verses.map(v => v.text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '').trim());
  const uniq = new Set(cleans);
  if (uniq.size < cleans.length) {
    foundIdentical = true;
    const oldRandom = Math.random;
    Math.random = () => 0;
    const q = DE.generateQuestion(g, groups, { gapMode: 'full', selection: { mode: 'all' }, pool: 'all', optionCap: 3 });
    Math.random = oldRandom;
    if (q) {
      const correctOpt = q.options.find(o => o.locations.includes(q.correctAnswer));
      assert(correctOpt && correctOpt.locations.length >= 2, 'identical-wording target should carry 2+ locations');
      console.log(`   identical group ${g.id}: correct option has ${correctOpt?.locations.length} locations (refs: ${correctOpt?.refs.join('; ')})`);
    }
    break;
  }
}
if (!foundIdentical) console.log('   (no identical-wording group found in dataset — invariant N/A)');

// === 7. starved scope يعيد null ===
console.log('7) starved scope returns null gracefully');
let nulls = 0, nonNull = 0;
for (let i = 0; i < 200; i++) {
  const g = groups[Math.floor(Math.random() * groups.length)];
  const q = DE.generateQuestion(g, groups, { gapMode: 'full', selection: { mode: 'juz', juz: 1 }, pool: 'confined', optionCap: 3 });
  q ? nonNull++ : nulls++;
}
console.log(`   juz1-confined over random groups: ${nonNull} questions, ${nulls} nulls (expected many nulls)`);

// === 8. سؤال المواضع المشتركة ===
console.log('8) shared-part question chooses a location set');
const toyGroup = {
  id: 'toy',
  verses: [
    { gid: 900001, sura_id: 1, aya_id: 1, sura_name: 'A', text: 'danny rode bike' },
    { gid: 900002, sura_id: 1, aya_id: 2, sura_name: 'A', text: 'mark rode car' },
    { gid: 900003, sura_id: 1, aya_id: 3, sura_name: 'A', text: 'dave ate chocolate' }
  ]
};
const oldQuranText = window.quranText;
const oldPageJuzMap = window.pageJuzMap;
window.quranText = {
  900001: { sura_id: 1, aya_id: 1, sura_name: 'A', text: 'danny rode bike' },
  900002: { sura_id: 1, aya_id: 2, sura_name: 'A', text: 'mark rode car' },
  900003: { sura_id: 1, aya_id: 3, sura_name: 'A', text: 'dave ate chocolate' },
  900004: { sura_id: 1, aya_id: 4, sura_name: 'A', text: 'sara rode bus' }
};
window.pageJuzMap = { byGid: {
  900001: { juz: 1, page: 1 },
  900002: { juz: 1, page: 1 },
  900003: { juz: 1, page: 1 },
  900004: { juz: 2, page: 22 }
} };
const sharedToy = DE.generateSharedPartQuestion(toyGroup, [toyGroup], { quranTextFormat: 'standard', selection: { mode: 'all' }, pool: 'all', optionCap: 3 });
const sharedToyJuz1 = DE.generateSharedPartQuestion(toyGroup, [toyGroup], { quranTextFormat: 'standard', selection: { mode: 'juz', juz: 1 }, pool: 'all', optionCap: 3 });
window.quranText = oldQuranText;
window.pageJuzMap = oldPageJuzMap;
assert(sharedToy && sharedToy.sharedText === 'rode', 'toy shared phrase should be "rode"');
assert(sharedToy && sameLocations(sharedToy.correctLocations, [900001, 900002, 900004]), 'toy correct locations should include corpus occurrence 900004');
assert(sharedToy && sharedToy.options.filter(o => sameLocations(o.locations, sharedToy.correctLocations)).length === 1, 'shared question should have exactly one correct option');
assert(sharedToyJuz1 && sameLocations(sharedToyJuz1.correctLocations, [900001, 900002]), 'shared question should honor selected juz for correct locations');

let sharedReal = null;
for (const g of groups) {
  sharedReal = DE.generateSharedPartQuestion(g, groups, { selection: { mode: 'all' }, pool: 'all', optionCap: 3 });
  if (sharedReal) break;
}
assert(!!sharedReal, 'should generate at least one shared-part question from real data');
if (sharedReal) {
  assert(sharedReal.correctLocations.length >= 2, 'real shared question needs 2+ correct locations');
  assert(sharedReal.options.length >= 2 && sharedReal.options.length <= 3, 'real shared question option count');
}

// === 9. الاختبار المختلط ===
console.log('9) mixed quiz generation');
const mixedBalanced = DE.generateMixedQuestions([toyGroup], [toyGroup], {
  quranTextFormat: 'standard',
  selection: { mode: 'all' },
  pool: 'all',
  optionCap: 3,
  mixedStrategy: 'balanced'
}, 2);
assert(mixedBalanced.length === 2, 'balanced mixed should fill requested count when both types exist');
assert(mixedBalanced.some(q => q.type === 'completion'), 'balanced mixed should include a completion question');
assert(mixedBalanced.some(q => q.type === 'sharedPart'), 'balanced mixed should include a shared-part question');

const oldRandomForMixed = Math.random;
Math.random = () => 0.99;
const mixedRandom = DE.generateMixedQuestions([toyGroup], [toyGroup], {
  quranTextFormat: 'standard',
  selection: { mode: 'all' },
  pool: 'all',
  optionCap: 3,
  mixedStrategy: 'random'
}, 2);
Math.random = oldRandomForMixed;
assert(mixedRandom.length === 2, 'random mixed should fall back to the other type when needed');

console.log('\n' + (failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} FAILURE(S)`));
process.exit(failures === 0 ? 0 : 1);
