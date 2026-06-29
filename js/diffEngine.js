// diffEngine.js
// يحتوي هذا الملف على الخوارزمية البرمجية لمقارنة الآيات واستخراج الفروق بدقة،
// وتوليد الأسئلة بمفاتيح المواضع (Location-keyed). انظر CONTEXT.md و ADR-0001.

window.DiffEngine = {
  _cleanText: function (text) {
    return text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
  },

  _formatVerseText: function (v, settings) {
    return (settings.quranTextFormat === 'uthmani' && window.quranText && window.quranText[v.gid] && window.quranText[v.gid].uthmani)
      ? window.quranText[v.gid].uthmani : v.text;
  },

  _corpusByGid: function (allGroups, settings) {
    const corpusByGid = new Map();
    if (window.quranText) {
      Object.entries(window.quranText).forEach(([gid, v]) => {
        const g = parseInt(gid);
        corpusByGid.set(g, { ...v, gid: g, text: this._formatVerseText({ ...v, gid: g }, settings) });
      });
    }
    (allGroups || []).forEach(g => (g.verses || []).forEach(v => {
      if (!corpusByGid.has(v.gid)) corpusByGid.set(v.gid, { ...v, text: this._formatVerseText(v, settings) });
    }));
    return corpusByGid;
  },

  _getSharedPartIndex: function (allGroups) {
    if (!window.SharedPartIndex) return null;
    if (!this._sharedPartIndexCache ||
      this._sharedPartIndexCache.groups !== allGroups ||
      this._sharedPartIndexCache.quranText !== window.quranText ||
      this._sharedPartIndexCache.pageJuzMap !== window.pageJuzMap) {
      this._sharedPartIndexCache = {
        groups: allGroups,
        quranText: window.quranText,
        pageJuzMap: window.pageJuzMap,
        index: window.SharedPartIndex.create({
          groups: allGroups,
          quranText: window.quranText,
          pageJuzMap: window.pageJuzMap
        })
      };
    }
    return this._sharedPartIndexCache.index;
  },

  /**
   * مقارنة آيتين واستخراج الجزء المختلف مع سياق بسيط حوله
   */
  getDiff: function (textA, textB) {
    const cleanText = (text) => text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();

    const wordsA = textA.split(/\s+/);
    const wordsB = textB.split(/\s+/);

    let prefix = 0;
    while (prefix < wordsA.length && prefix < wordsB.length && cleanText(wordsA[prefix]) === cleanText(wordsB[prefix])) prefix++;

    let suffix = 0;
    while (suffix < wordsA.length - prefix && suffix < wordsB.length - prefix && cleanText(wordsA[wordsA.length - 1 - suffix]) === cleanText(wordsB[wordsB.length - 1 - suffix])) suffix++;

    return {
      before: wordsA.slice(0, prefix).join(" "),
      after: wordsA.slice(wordsA.length - suffix).join(" "),
      correct: wordsA.slice(prefix, wordsA.length - suffix).join(" "),
      distractor: wordsB.slice(prefix, wordsB.length - suffix).join(" ") || "بدون إضافة"
    };
  },

  /** عدد الكلمات المختلفة بين نصّين — كلما قلّ كانا أقرب تشابهاً. يعيد استخدام getDiff. */
  _diffWordCount: function (a, b) {
    const d = this.getDiff(a, b);
    const cc = d.correct ? d.correct.split(/\s+/).filter(Boolean).length : 0;
    const cd = d.distractor ? d.distractor.split(/\s+/).filter(Boolean).length : 0;
    return cc + cd; // ponytail: sum of differing-span lengths as similarity proxy
  },

  /** يرتّب المرشحين حسب الأقرب نصياً لمرجع، مع كسر عشوائي للتعادل. */
  _rankBySimilarity: function (refText, items, getText = (x) => x.text) {
    return items
      .map((it) => ({ it, score: this._diffWordCount(refText, getText(it)), r: Math.random() }))
      .sort((a, b) => a.score - b.score || a.r - b.r)
      .map((x) => x.it);
  },

  _optionLimit: function (settings) {
    const max = Math.max(2, settings.optionCap || 3);
    const min = Math.max(2, Math.min(max, settings.optionMin || max));
    return min + Math.floor(Math.random() * (max - min + 1));
  },

  _plainWord: function (word) {
    return this._cleanText(word)
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
      .replace(/[إأٱآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/[ؤ]/g, "و")
      .replace(/[ئ]/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[^\u0621-\u064A]/g, "");
  },

  _contentWordCount: function (text) {
    const stop = new Set([
      "و", "ف", "ثم", "او", "ام", "بل", "لا", "ما", "من", "في", "عن", "علي", "الى",
      "ان", "انما", "قد", "لقد", "كل", "هذا", "هذه", "ذلك", "تلك", "هو", "هي", "هم",
      "الذي", "الذين", "التي", "يا", "ايها"
    ]);
    return text.split(/\s+/).map(w => this._plainWord(w)).filter(w => w.length > 1 && !stop.has(w)).length;
  },

  _groupPairSet: function (allGroups) {
    const pairs = new Set();
    (allGroups || []).forEach(g => {
      const gids = (g.verses || []).map(v => v.gid).filter(Boolean);
      for (let i = 0; i < gids.length; i++) {
        for (let j = i + 1; j < gids.length; j++) pairs.add([gids[i], gids[j]].sort((a, b) => a - b).join(':'));
      }
    });
    return pairs;
  },

  _isGroupBacked: function (gids, groupPairs) {
    for (let i = 0; i < gids.length; i++) {
      for (let j = i + 1; j < gids.length; j++) {
        if (groupPairs.has([gids[i], gids[j]].sort((a, b) => a - b).join(':'))) return true;
      }
    }
    return false;
  },

  _scoreSharedCandidate: function (phrase, groupPairs) {
    const wordScore = ({ 2: 8, 3: 9, 4: 7, 5: 5 })[phrase.wordCount] || 0;
    const locationCount = phrase.gids.size;
    const locationScore = locationCount === 2 ? 10 : locationCount === 3 ? 8 : locationCount <= 5 ? 6 : locationCount <= 8 ? 3 : 0;
    const contentScore = Math.min(6, this._contentWordCount(phrase.text) * 2);
    const concisePairBonus = phrase.wordCount === 2 && locationCount === 2 ? 4 : 0;
    const endingBonus = phrase.endGids && phrase.endGids.size === locationCount ? 4 : 0;
    const groupBonus = this._isGroupBacked(Array.from(phrase.gids), groupPairs) ? 3 : 0;
    const broadPenalty = locationCount > 12 ? 6 : 0;
    const emptyPenalty = contentScore === 0 ? 12 : 0;
    return wordScore + locationScore + contentScore + concisePairBonus + endingBonus + groupBonus - broadPenalty - emptyPenalty;
  },

  _buildSharedPartQuestion: function (id, sharedText, correctLocations, corpusByGid, settings) {
    const map = (window.pageJuzMap && window.pageJuzMap.byGid) || {};
    const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
    const sample = (arr, count) => {
      if (count >= arr.length) return shuffle(arr);
      const out = [];
      const used = new Set();
      while (out.length < count && used.size < arr.length) {
        const idx = Math.floor(Math.random() * arr.length);
        if (used.has(idx)) continue;
        used.add(idx);
        out.push(arr[idx]);
      }
      return out;
    };
    const refOf = (v) => v.sura_name + " " + v.aya_id;
    const sameSet = (a, b) => a.length === b.length && a.every(g => b.includes(g));
    const eligibleForPool = (v) => window.Scope.eligibleDistractor(v, settings.pool, settings.selection, map);
    const byGid = new Map(Array.from(corpusByGid.values()).map(v => [v.gid, v]));
    const optionFrom = (locations) => {
      const ordered = Array.from(new Set(locations)).filter(g => byGid.has(g)).sort((a, b) => a - b);
      const refs = ordered.map(g => refOf(byGid.get(g)));
      return { text: refs.join(" • "), locations: ordered, refs: refs };
    };

    correctLocations = Array.from(new Set(correctLocations)).filter(g => byGid.has(g)).sort((a, b) => a - b);
    if (correctLocations.length < 2) return null;

    const wrongSets = [];
    const addWrong = (locations) => {
      const ordered = optionFrom(locations).locations;
      if (!ordered.length || sameSet(ordered, correctLocations) || wrongSets.some(s => sameSet(s, ordered))) return;
      wrongSets.push(ordered);
    };

    const optionLimit = this._optionLimit(settings);
    const fakePoolGids = settings._poolGids || Array.from(corpusByGid.values()).filter(eligibleForPool).map(v => v.gid);
    const outsiders = fakePoolGids.filter(g => !correctLocations.includes(g));

    correctLocations.forEach((gid, idx) => sample(outsiders, 8).forEach(g => addWrong(correctLocations.map((x, i) => i === idx ? g : x))));
    sample(outsiders, 8).forEach(g => addWrong([...correctLocations, g]));
    correctLocations.forEach(g => addWrong([g]));
    sample(fakePoolGids, 12).forEach(g => addWrong([g]));

    for (let i = 0; i < 80 && wrongSets.length < optionLimit * 4; i++) {
      const maxSize = Math.min(fakePoolGids.length, Math.max(2, correctLocations.length + 2));
      const minSize = Math.min(maxSize, correctLocations.length > 1 ? 2 : 1);
      const size = minSize + Math.floor(Math.random() * (maxSize - minSize + 1));
      addWrong(sample(fakePoolGids, size));
    }

    const options = shuffle([
      optionFrom(correctLocations),
      ...shuffle(wrongSets).slice(0, optionLimit - 1).map(optionFrom)
    ]);
    if (options.length < 2) return null;

    return {
      id: id,
      type: 'sharedPart',
      sharedText: sharedText,
      correctAnswer: correctLocations[0],
      correctLocations: correctLocations,
      options: options,
      matchingVerses: correctLocations.map(g => byGid.get(g)).map(v => ({
        gid: v.gid,
        ref: refOf(v),
        text: v.text
      }))
    };
  },

  generateCorpusSharedPartQuestions: function (allGroups, settings = {}, limit = 20) {
    settings = Object.assign({
      quranTextFormat: 'uthmani', selection: { mode: 'all' }, pool: 'all', optionCap: 3
    }, settings);

    const index = this._getSharedPartIndex(allGroups);
    if (index) {
      return index.sampleQuestions(settings, limit);
    }

    const map = (window.pageJuzMap && window.pageJuzMap.byGid) || {};
    const corpusByGid = this._corpusByGid(allGroups, settings);
    const selectedVerses = Array.from(corpusByGid.values())
      .filter(v => window.Scope.inSelection(v, settings.selection, map));
    const phrases = new Map();

    selectedVerses.forEach(v => {
      const words = v.text.split(/\s+/).filter(Boolean);
      const seen = new Set();
      for (let len = Math.min(5, words.length); len >= 2; len--) {
        for (let i = 0; i <= words.length - len; i++) {
          const text = words.slice(i, i + len).join(" ");
          const key = this._cleanText(text);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          if (!phrases.has(key)) phrases.set(key, { text, wordCount: len, gids: new Set(), endGids: new Set() });
          const p = phrases.get(key);
          p.gids.add(v.gid);
          if (i + len === words.length) p.endGids.add(v.gid);
        }
      }
    });

    const groupPairs = this._groupPairSet(allGroups);
    const cleanVerseByGid = new Map(selectedVerses.map(v => [v.gid, this._cleanText(v.text)]));
    const byLocations = new Map();
    Array.from(phrases.entries()).forEach(([key, p]) => {
      const matchedGids = selectedVerses
        .filter(v => cleanVerseByGid.get(v.gid).includes(key))
        .map(v => v.gid);
      if (matchedGids.length < 2) return;
      const candidate = {
        ...p,
        gids: new Set(matchedGids),
        endGids: new Set(matchedGids.filter(g => cleanVerseByGid.get(g).endsWith(key)))
      };
      const locKey = matchedGids.sort((a, b) => a - b).join(',');
      const current = byLocations.get(locKey);
      const score = this._scoreSharedCandidate(candidate, groupPairs);
      if (score <= 0) return;
      if (!current || score > current.score) byLocations.set(locKey, { key, p: candidate, score });
    });
    const candidates = Array.from(byLocations.values())
      .map(x => ({ ...x, r: Math.random() * 2 }))
      .sort((a, b) => (b.score + b.r) - (a.score + a.r));

    const out = [];
    for (const { key, p } of candidates) {
      const q = this._buildSharedPartQuestion('corpus:' + key, p.text, Array.from(p.gids), corpusByGid, settings);
      if (q) out.push(q);
      if (out.length >= limit) break;
    }
    return out;
  },

  /**
   * توليد سؤال من مجموعة متشابهات، بمفاتيح المواضع.
   * settings: {quranTextFormat, gapMode:'full'|'diff', contextCountBefore, contextCountAfter,
   *            selection:{mode, surahs?, juz?, juzs?, pageFrom?, pageTo?}, pool:'confined'|'all',
   *            optionMin?, optionCap=3, distractorStrategy:'adaptive'|'random'}
   * @returns {object|null} كائن السؤال أو null إن تعذّر توليده.
   */
  generateQuestion: function (group, allGroups, settings = {}) {
    settings = Object.assign({
      quranTextFormat: 'uthmani', gapMode: 'full', contextCountBefore: 1, contextCountAfter: 1,
      selection: { mode: 'all' }, pool: 'all', optionCap: 3, distractorStrategy: 'adaptive'
    }, settings);

    if (!group || !group.verses || group.verses.length < 2) return null;

    const map = (window.pageJuzMap && window.pageJuzMap.byGid) || {};
    const cleanText = (text) => text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
    const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

    const formatVerseText = (v) =>
      (settings.quranTextFormat === 'uthmani' && window.quranText && window.quranText[v.gid] && window.quranText[v.gid].uthmani)
        ? window.quranText[v.gid].uthmani : v.text;

    group = { ...group, verses: group.verses.map(v => ({ ...v, text: formatVerseText(v) })) };

    // (1) الهدف يجب أن يكون داخل المجال المختار
    const inSelection = (v) => window.Scope.inSelection(v, settings.selection, map);
    const targetsInScope = group.verses.filter(inSelection);
    if (targetsInScope.length === 0) return null;
    const targetVerse = targetsInScope[Math.floor(Math.random() * targetsInScope.length)];
    const targetGid = targetVerse.gid;
    const cleanTarget = cleanText(targetVerse.text);

    // (2) مصدر المشتتات: أوراد المجموعة (نفس المجموعة = متشابهات حقيقية)، مُصفّاة حسب pool
    const eligibleForPool = (v) => window.Scope.eligibleDistractor(v, settings.pool, settings.selection, map);

    // (3) اختيار compVerse لتعريف حدود الفراغ
    let compVerse = null, diffData = null;
    if (settings.gapMode === 'full') {
      compVerse =
        group.verses.find(v => v.gid !== targetGid && eligibleForPool(v) && cleanText(v.text) !== cleanTarget) ||
        group.verses.find(v => v.gid !== targetGid && eligibleForPool(v)) ||
        group.verses.find(v => v.gid !== targetGid && cleanText(v.text) !== cleanTarget) ||
        group.verses.find(v => v.gid !== targetGid);
      if (!compVerse) return null;
      diffData = { before: "", after: "", correct: targetVerse.text, distractor: compVerse.text };
    } else {
      // diff: الأقرب نصياً للهدف (يفضّل المؤهل في pool)
      const ranked = this._rankBySimilarity(targetVerse.text, group.verses.filter(v => v.gid !== targetGid), v => v.text);
      for (const cv of ranked) {
        const d = this.getDiff(targetVerse.text, cv.text);
        if (d.correct && d.correct.trim()) { compVerse = cv; diffData = d; break; }
      }
      if (!compVerse) return null;
    }

    // (4) بناء الخيارات المميّزة بالنص، كل خيار يحمل مواضعه (Location-keyed + dedup)
    const beforeN = diffData.before ? diffData.before.split(/\s+/).filter(Boolean).length : 0;
    const afterN = diffData.after ? diffData.after.split(/\s+/).filter(Boolean).length : 0;

    const middleOf = (text) => {
      if (settings.gapMode === 'full') return text;
      const ws = text.split(/\s+/).filter(Boolean);
      if (ws.length <= beforeN + afterN) return ""; // لا توجد شريحة وسطى
      const end = afterN > 0 ? ws.length - afterN : ws.length;
      return ws.slice(beforeN, end).join(" ").trim();
    };

    const correctText = diffData.correct;
    const byClean = new Map(); // cleanMiddle -> {text, gids:Set, refs:[]}
    const addVerse = (v) => {
      const mid = middleOf(v.text);
      if (!mid || !mid.trim()) return;
      const key = cleanText(mid);
      if (!key) return;
      if (!byClean.has(key)) byClean.set(key, { text: mid, gids: new Set(), refs: [] });
      const o = byClean.get(key);
      o.gids.add(v.gid);
      o.refs.push(v.sura_name + " " + v.aya_id);
    };
    // المصدر: الهدف + كل الأوراد المؤهلة في pool (لضمان ظهور التوأم المتطابق إن وجد)
    group.verses.filter(v => v.gid === targetGid || eligibleForPool(v)).forEach(addVerse);

    // ضمان وجود خيار صحيح يحوي الهدف
    let correctOpt = byClean.get(cleanText(correctText));
    if (!correctOpt) {
      correctOpt = { text: correctText, gids: new Set(), refs: [] };
      byClean.set(cleanText(correctText), correctOpt);
    }
    correctOpt.gids.add(targetGid);
    if (!correctOpt.refs.includes(targetVerse.sura_name + " " + targetVerse.aya_id))
      correctOpt.refs.unshift(targetVerse.sura_name + " " + targetVerse.aya_id);

    const distinct = Array.from(byClean.values());
    const correctIdx = distinct.findIndex(o => o === correctOpt);

    // (5) سؤال اختيار يتطلب خيارين مميّزين على الأقل
    if (distinct.length < 2) return null;

    // (6) اقطع إلى optionCap: الصحيح + (cap-1) مشتّت حسب الاستراتيجية
    const distractors = distinct.filter((_, i) => i !== correctIdx);
    const rankedDistractors = settings.distractorStrategy === 'random'
      ? shuffle(distractors)
      : this._rankBySimilarity(correctOpt.text, distractors, o => o.text);
    const kept = [correctOpt, ...rankedDistractors.slice(0, this._optionLimit(settings) - 1)];

    // ponytail: slicing middles at the before/after boundary is clean-by-construction,
    // so the original ~80-line overlap-cleaning pass is unnecessary and removed.
    const options = shuffle(kept).map(o => ({
      text: o.text,
      locations: Array.from(o.gids),
      refs: o.refs
    }));

    // (7) آيات السياق قبل/بعد (دون تغيير عن الأصل)
    let beforeVerses = [], afterVerses = [];
    if (window.quranText) {
      const gid = parseInt(targetVerse.gid);
      if (settings.contextCountBefore > 0) {
        for (let i = settings.contextCountBefore; i >= 1; i--) {
          const v = window.quranText[gid - i];
          if (v && v.sura_id === targetVerse.sura_id) {
            const t = (settings.quranTextFormat === 'uthmani' && v.uthmani) ? v.uthmani : v.text;
            beforeVerses.push({ text: t, aya_id: v.aya_id });
          }
        }
      }
      if (settings.contextCountAfter > 0) {
        for (let i = 1; i <= settings.contextCountAfter; i++) {
          const v = window.quranText[gid + i];
          if (v && v.sura_id === targetVerse.sura_id) {
            const t = (settings.quranTextFormat === 'uthmani' && v.uthmani) ? v.uthmani : v.text;
            afterVerses.push({ text: t, aya_id: v.aya_id });
          }
        }
      }
    }

    return {
      id: group.id,
      type: 'completion',
      suraName: targetVerse.sura_name,
      ayaId: targetVerse.aya_id,
      targetGid: targetGid,
      fullText: targetVerse.text,
      before: diffData.before,
      after: diffData.after,
      correctAnswer: targetGid,            // Location — راجع ADR-0001
      options: options,                    // [{text, locations:[gid...], refs:[...]}]
      comparisonSurah: compVerse.sura_name,
      comparisonAya: compVerse.aya_id,
      comparisonText: compVerse.text,
      beforeVerses: beforeVerses,
      afterVerses: afterVerses
    };
  },

  /**
   * توليد سؤال: أي المواضع تشترك في جزء محدد؟
   * settings: {quranTextFormat, selection, pool, optionMin?, optionCap=3}
   */
  generateSharedPartQuestion: function (group, allGroups, settings = {}) {
    settings = Object.assign({
      quranTextFormat: 'uthmani', selection: { mode: 'all' }, pool: 'all', optionCap: 3
    }, settings);

    if (!group || !group.verses || group.verses.length < 2) return null;

    const map = (window.pageJuzMap && window.pageJuzMap.byGid) || {};
    const cleanText = (text) => text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
    const formatVerseText = (v) =>
      (settings.quranTextFormat === 'uthmani' && window.quranText && window.quranText[v.gid] && window.quranText[v.gid].uthmani)
        ? window.quranText[v.gid].uthmani : v.text;

    const inSelection = (v) => window.Scope.inSelection(v, settings.selection, map);
    const eligibleForPool = (v) => window.Scope.eligibleDistractor(v, settings.pool, settings.selection, map);
    const verses = group.verses
      .map(v => ({ ...v, text: formatVerseText(v) }))
      .filter(v => inSelection(v) || eligibleForPool(v));
    if (verses.length < 2 || !verses.some(inSelection)) return null;

    const corpusByGid = new Map();
    if (window.quranText) {
      Object.entries(window.quranText).forEach(([gid, v]) => {
        const g = parseInt(gid);
        corpusByGid.set(g, { ...v, gid: g, text: formatVerseText({ ...v, gid: g }) });
      });
    }
    (allGroups || []).forEach(g => (g.verses || []).forEach(v => {
      if (!corpusByGid.has(v.gid)) corpusByGid.set(v.gid, { ...v, text: formatVerseText(v) });
    }));

    const phrases = new Map();
    verses.forEach(v => {
      const words = v.text.split(/\s+/).filter(Boolean);
      const seen = new Set();
      for (let len = Math.min(5, words.length); len >= 1; len--) {
        for (let i = 0; i <= words.length - len; i++) {
          const text = words.slice(i, i + len).join(" ");
          const key = cleanText(text);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          if (!phrases.has(key)) phrases.set(key, { text, wordCount: len, gids: new Set(), verses: [] });
          const p = phrases.get(key);
          p.gids.add(v.gid);
          p.verses.push(v);
        }
      }
    });

    const candidates = Array.from(phrases.values())
      .filter(p => p.gids.size >= 2 && p.verses.some(inSelection));
    if (candidates.length === 0) return null;

    const notAll = candidates.filter(p => p.gids.size < verses.length);
    const picked = (notAll.length ? notAll : candidates)
      .map(p => ({ p, r: Math.random() }))
      .sort((a, b) => b.p.wordCount - a.p.wordCount || a.p.gids.size - b.p.gids.size || a.r - b.r)[0].p;

    const matchKey = cleanText(picked.text);
    const corpusMatches = Array.from(corpusByGid.values())
      .filter(v => inSelection(v) && cleanText(v.text).includes(matchKey));
    if (corpusMatches.length < 2) return null;

    const correctLocations = corpusMatches.map(v => v.gid);
    return this._buildSharedPartQuestion(group.id, picked.text, correctLocations, corpusByGid, settings);
  },

  _generateQuestionByType: function (type, group, allGroups, settings) {
    return type === 'sharedPart'
      ? this.generateSharedPartQuestion(group, allGroups, settings)
      : this.generateQuestion(group, allGroups, settings);
  },

  generateMixedQuestions: function (targetGroups, allGroups, settings = {}, length = 10) {
    const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
    const groups = shuffle(targetGroups || []);
    const corpusShared = shuffle(this.generateCorpusSharedPartQuestions(allGroups, settings, length));
    const used = new Set();
    const take = (type, count) => {
      const out = [];
      if (type === 'sharedPart') {
        for (const q of corpusShared) {
          if (out.length >= count) break;
          const key = 'corpus:' + q.id;
          if (used.has(key)) continue;
          used.add(key);
          out.push(q);
        }
      }
      for (const g of groups) {
        if (out.length >= count) break;
        const key = type + ':' + g.id;
        if (used.has(key)) continue;
        const q = this._generateQuestionByType(type, g, allGroups, Object.assign({}, settings, { quizType: type }));
        if (!q) continue;
        used.add(key);
        out.push(q);
      }
      return out;
    };

    if ((settings.mixedStrategy || 'balanced') === 'random') {
      const out = [];
      while (out.length < length) {
        const type = Math.random() < 0.5 ? 'completion' : 'sharedPart';
        const q = take(type, 1)[0] || take(type === 'completion' ? 'sharedPart' : 'completion', 1)[0];
        if (!q) break;
        out.push(q);
      }
      return out;
    }

    const completionTarget = Math.ceil(length / 2);
    const sharedTarget = Math.floor(length / 2);
    const completion = take('completion', completionTarget);
    const shared = take('sharedPart', sharedTarget);
    const out = [...completion, ...shared];
    out.push(...take('sharedPart', Math.max(0, completionTarget - completion.length)));
    out.push(...take('completion', Math.max(0, sharedTarget - shared.length)));
    out.push(...take('completion', length - out.length), ...take('sharedPart', length - out.length));
    return shuffle(out).slice(0, length);
  }
};
