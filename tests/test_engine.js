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
const sortNums = (xs) => [...new Set(xs)].sort((a, b) => a - b);
const assertSameLocations = (actual, expected, msg) => {
  const a = sortNums(actual || []);
  const e = sortNums(expected || []);
  assert(sameLocations(a, e), `${msg}: expected [${e.join(', ')}], got [${a.join(', ')}]`);
};
const withSeed = (seed, fn) => {
  const oldRandom = Math.random;
  let t = seed >>> 0;
  Math.random = () => {
    t += 0x6D2B79F5;
    let r = t;
    r = Math.imul(r ^ r >>> 15, r | 1);
    r ^= r + Math.imul(r ^ r >>> 7, r | 61);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
  try { return fn(); } finally { Math.random = oldRandom; }
};
const textFor = (v, settings) =>
  (settings.quranTextFormat === 'uthmani' && v.uthmani) ? v.uthmani : v.text;
const corpusVerses = () => Object.entries(window.quranText).map(([gid, v]) => ({ ...v, gid: Number(gid) }));
const corpusMatches = (sharedText, settings) => {
  const key = DE._cleanText(sharedText);
  return corpusVerses()
    .filter(v => window.Scope.inSelection(v, settings.selection || { mode: 'all' }, map))
    .filter(v => DE._cleanText(textFor(v, settings)).includes(key))
    .map(v => v.gid);
};
const assertSharedQuestionMatchesCorpus = (q, settings, label) => {
  const expected = corpusMatches(q.sharedText, settings);
  assert(expected.length >= 2, `${label}: oracle found fewer than two corpus matches for "${q.sharedText}"`);
  assertSameLocations(q.correctLocations, expected, `${label}: correct locations must equal the Quran corpus matches`);
  assert(q.options.filter(o => sameLocations(sortNums(o.locations), sortNums(q.correctLocations))).length === 1, `${label}: expected exactly one correct option`);
  q.options.flatMap(o => o.locations).forEach(g => {
    const v = window.quranText[g] && { ...window.quranText[g], gid: g };
    assert(!!v, `${label}: option location missing from Quran corpus: ${g}`);
    assert(window.Scope.eligibleDistractor(v, settings.pool || 'all', settings.selection || { mode: 'all' }, map), `${label}: option leaked outside configured pool: ${g}`);
  });
};
const assertCompletionQuestion = (q, settings, label) => {
  assert(q.type === 'completion', `${label}: expected completion question`);
  const target = window.quranText[q.targetGid] && { ...window.quranText[q.targetGid], gid: q.targetGid };
  assert(!!target, `${label}: target missing from Quran corpus`);
  assert(window.Scope.inSelection(target, settings.selection || { mode: 'all' }, map), `${label}: target leaked outside selection`);
  assert(q.options.filter(o => o.locations.includes(q.correctAnswer)).length === 1, `${label}: expected exactly one correct option`);
  q.options.flatMap(o => o.locations).forEach(g => {
    const v = window.quranText[g] && { ...window.quranText[g], gid: g };
    assert(!!v, `${label}: option location missing from Quran corpus: ${g}`);
    assert(window.Scope.eligibleDistractor(v, settings.pool || 'all', settings.selection || { mode: 'all' }, map), `${label}: option leaked outside configured pool: ${g}`);
  });
};

const gen = (n, settings, seed = 123456) => withSeed(seed, () => {
  const qs = [];
  for (let i = 0; i < n; i++) {
    const g = groups[Math.floor(Math.random() * groups.length)];
    const q = DE.generateQuestion(g, groups, settings);
    qs.push(q);
  }
  return qs.filter(Boolean);
});

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
console.log('4) selection confined to juz 2 or 3');
const juz2 = gen(300, { gapMode: 'full', selection: { mode: 'juz', juzs: [2, 3] }, pool: 'all', optionCap: 3 });
juz2.forEach(q => {
  assert([2, 3].includes(map[q.targetGid].juz), `target not in juz 2/3: gid ${q.targetGid} → juz ${map[q.targetGid]?.juz}`);
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
    const q = withSeed(14, () => DE.generateQuestion(g, groups, { gapMode: 'full', selection: { mode: 'all' }, pool: 'all', optionCap: 3 }));
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
const sharedRealSettings = {
  quranTextFormat: 'uthmani',
  selection: { mode: 'all' },
  pool: 'all',
  optionMin: 3,
  optionCap: 5
};
const realSharedGroupIds = [1, 2, 5, 8, 10, 14, 20, 55, 89, 123, 200, 308];
const realSharedQuestions = withSeed(20240628, () => realSharedGroupIds
  .map(id => {
    const group = groups.find(g => g.id === id);
    return group && DE.generateSharedPartQuestion(group, groups, sharedRealSettings);
  })
  .filter(Boolean));
assert(realSharedQuestions.length === realSharedGroupIds.length, 'real shared sample should generate from every selected real group');
realSharedQuestions.forEach(q => assertSharedQuestionMatchesCorpus(q, sharedRealSettings, `real shared group ${q.id}`));

const baqarah68Group = groups.find(g => g.id === 308);
const baqarah68SourceGids = baqarah68Group.verses.map(v => v.gid);
const baqarah68Question = realSharedQuestions.find(q => q.id === 308);
assert(!!baqarah68Question, 'Baqarah 68/69 source group should produce a real shared question');
assert(baqarah68Question.correctLocations.some(g => !baqarah68SourceGids.includes(g)), 'Baqarah 68/69 source group should include matching Quran occurrences not present in the curated group');

const corpusJuz1Settings = {
  quranTextFormat: 'uthmani',
  selection: { mode: 'juz', juz: 1 },
  pool: 'confined',
  optionMin: 3,
  optionCap: 5
};
const corpusJuz1 = withSeed(9001, () => DE.generateCorpusSharedPartQuestions(groups, corpusJuz1Settings, 1000));
const laallakum = corpusJuz1.find(q => sameLocations(q.correctLocations, [28, 70]));
assert(!!laallakum, 'corpus shared questions should include Baqarah 21/63: لَعَلَّكُمۡ تَتَّقُونَ');
const baqarahCow = corpusJuz1.find(q => sameLocations(q.correctLocations, [75, 76, 78]));
assert(!!baqarahCow, 'corpus shared questions should include Baqarah 68/69/71, including verse 71');
assert(corpusJuz1.length > 6, 'corpus shared questions should not be capped by source similarity groups in juz 1');
const rankedJuz1 = withSeed(0, () => DE.generateCorpusSharedPartQuestions(groups, corpusJuz1Settings, 10));
assert(rankedJuz1.some(q => sameLocations(q.correctLocations, [28, 70])), 'candidate quality should rank Baqarah 21/63 into a short juz 1 quiz');
corpusJuz1.slice(0, 40).forEach((q, i) => {
  assertSharedQuestionMatchesCorpus(q, corpusJuz1Settings, `corpus juz 1 shared question ${i + 1}`);
  assert(q.options.length >= 3 && q.options.length <= 5, `corpus shared question option count should be within [3,5], got ${q.options.length}`);
  q.options.flatMap(o => o.locations).forEach(g => assert(map[g].juz === 1, `corpus confined option leaked outside juz 1: ${g}`));
});
assert(corpusJuz1.some(q => q.options.some(o => !sameLocations(sortNums(o.locations), sortNums(q.correctLocations)) && o.locations.length > 1)), 'corpus shared questions should include confusing multi-location wrong answers');

// === 9. الاختبار المختلط ===
console.log('9) mixed quiz generation');
const targetJuz1Groups = groups.filter(g => g.verses && g.verses.some(v => window.Scope.inSelection(v, { mode: 'juz', juz: 1 }, map)));
const mixedJuz1Settings = {
  quranTextFormat: 'uthmani',
  selection: { mode: 'juz', juz: 1 },
  pool: 'confined',
  optionMin: 3,
  optionCap: 5,
  mixedStrategy: 'balanced'
};
const mixedJuz1 = withSeed(606, () => DE.generateMixedQuestions(targetJuz1Groups, groups, mixedJuz1Settings, 10));
assert(mixedJuz1.length === 10, 'mixed juz 1 should fill the requested count with corpus shared candidates');
assert(mixedJuz1.some(q => q.type === 'completion'), 'mixed juz 1 should include completion questions');
assert(mixedJuz1.some(q => q.type === 'sharedPart'), 'mixed juz 1 should include shared-part questions');
mixedJuz1.forEach(q => {
  if (q.type === 'sharedPart') assertSharedQuestionMatchesCorpus(q, mixedJuz1Settings, `mixed shared ${q.id}`);
  else assertCompletionQuestion(q, mixedJuz1Settings, `mixed completion ${q.id}`);
});

const mixedRandomSettings = {
  ...mixedJuz1Settings,
  mixedStrategy: 'random'
};
const mixedRandom = withSeed(707, () => DE.generateMixedQuestions(targetJuz1Groups, groups, mixedRandomSettings, 10));
assert(mixedRandom.length === 10, 'random mixed should fill the requested count from real Juz 1 data');
assert(mixedRandom.some(q => q.type === 'completion'), 'random mixed should include completion questions from real data');
assert(mixedRandom.some(q => q.type === 'sharedPart'), 'random mixed should include shared-part questions from real data');
mixedRandom.forEach(q => {
  if (q.type === 'sharedPart') assertSharedQuestionMatchesCorpus(q, mixedRandomSettings, `random mixed shared ${q.id}`);
  else assertCompletionQuestion(q, mixedRandomSettings, `random mixed completion ${q.id}`);
});

console.log('\n' + (failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} FAILURE(S)`));
process.exit(failures === 0 ? 0 : 1);
