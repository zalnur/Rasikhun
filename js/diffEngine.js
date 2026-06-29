// diffEngine.js
// يحتوي هذا الملف على الخوارزمية البرمجية لمقارنة الآيات واستخراج الفروق بدقة،
// وتوليد الأسئلة بمفاتيح المواضع (Location-keyed). انظر CONTEXT.md و ADR-0001.

window.DiffEngine = {
  _cleanText: function (text) {
    return text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
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

  generateCorpusSharedPartQuestions: function (allGroups, settings = {}, limit = 20) {
    settings = Object.assign({
      quranTextFormat: 'uthmani', selection: { mode: 'all' }, pool: 'all', optionCap: 3
    }, settings);

    const index = this._getSharedPartIndex(allGroups);
    return index ? index.sampleQuestions(settings, limit) : [];
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

    const index = this._getSharedPartIndex(allGroups);
    return index ? index.buildGroupQuestion(group, settings) : null;
  },

  _generateQuestionByType: function (type, group, allGroups, settings) {
    return type === 'sharedPart'
      ? this.generateSharedPartQuestion(group, allGroups, settings)
      : this.generateQuestion(group, allGroups, settings);
  },

  _mixedCompletionQuestionBank: function (targetGroups, allGroups, settings, needed) {
    const groupIds = (targetGroups || []).map(g => g.id).sort((a, b) => a - b).join(',');
    const key = [
      settings.quranTextFormat || 'uthmani',
      settings.gapMode || 'full',
      JSON.stringify(settings.selection || { mode: 'all' }),
      settings.pool || 'all',
      settings.optionMin || '',
      settings.optionCap || '',
      settings.distractorStrategy || 'adaptive',
      groupIds
    ].join('|');
    if (!this._mixedCompletionBankCache ||
      this._mixedCompletionBankCache.allGroups !== allGroups ||
      this._mixedCompletionBankCache.quranText !== window.quranText ||
      this._mixedCompletionBankCache.pageJuzMap !== window.pageJuzMap) {
      this._mixedCompletionBankCache = {
        allGroups,
        quranText: window.quranText,
        pageJuzMap: window.pageJuzMap,
        banks: new Map()
      };
    }
    const banks = this._mixedCompletionBankCache.banks;
    if (!banks.has(key)) banks.set(key, { questions: [], next: 0 });
    const bank = banks.get(key);
    const target = Math.min(targetGroups.length, Math.max(needed || 0, bank.questions.length));
    while (bank.questions.length < target && bank.next < targetGroups.length) {
      const q = this.generateQuestion(targetGroups[bank.next++], allGroups, settings);
      if (q) bank.questions.push(q);
    }
    return bank.questions;
  },

  generateMixedQuestions: function (targetGroups, allGroups, settings = {}, length = 10) {
    const shuffle = (arr) => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };
    const groups = [...(targetGroups || [])];
    const corpusShared = shuffle(this.generateCorpusSharedPartQuestions(allGroups, settings, length));
    const groupCursor = { completion: 0, sharedPart: 0 };
    const settingsByType = {
      completion: Object.assign({}, settings, { quizType: 'completion' }),
      sharedPart: Object.assign({}, settings, { quizType: 'sharedPart' })
    };
    const completionBank = shuffle(this._mixedCompletionQuestionBank(groups, allGroups, settingsByType.completion, length));
    let completionBankCursor = 0;
    let sharedCursor = 0;
    let shuffledGroups = 0;
    const used = new Set();

    const groupAt = (idx) => {
      while (shuffledGroups <= idx && shuffledGroups < groups.length) {
        const j = shuffledGroups + Math.floor(Math.random() * (groups.length - shuffledGroups));
        [groups[shuffledGroups], groups[j]] = [groups[j], groups[shuffledGroups]];
        shuffledGroups++;
      }
      return groups[idx];
    };

    const nextCorpusShared = () => {
      while (sharedCursor < corpusShared.length) {
        const q = corpusShared[sharedCursor++];
        const key = 'corpus:' + q.id;
        if (used.has(key)) continue;
        used.add(key);
        return q;
      }
      return null;
    };

    const cloneQuestion = (q) => ({
      ...q,
      options: shuffle(q.options),
      beforeVerses: q.beforeVerses ? [...q.beforeVerses] : [],
      afterVerses: q.afterVerses ? [...q.afterVerses] : []
    });

    const nextCachedCompletion = () => {
      if (!completionBank) return null;
      while (completionBankCursor < completionBank.length) {
        const q = completionBank[completionBankCursor++];
        const key = 'completion:' + q.id;
        if (used.has(key)) continue;
        used.add(key);
        return cloneQuestion(q);
      }
      return null;
    };

    const nextGroupQuestion = (type) => {
      if (type === 'completion') {
        const cached = nextCachedCompletion();
        if (cached) return cached;
      }
      while (groupCursor[type] < groups.length) {
        const g = groupAt(groupCursor[type]++);
        const key = type + ':' + g.id;
        if (used.has(key)) continue;
        const q = this._generateQuestionByType(type, g, allGroups, settingsByType[type]);
        if (!q) continue;
        used.add(key);
        return q;
      }
      return null;
    };

    const takeOne = (type) =>
      type === 'sharedPart'
        ? (nextCorpusShared() || nextGroupQuestion(type))
        : nextGroupQuestion(type);

    const take = (type, count) => {
      const out = [];
      while (out.length < count) {
        const q = takeOne(type);
        if (!q) break;
        out.push(q);
      }
      return out;
    };

    if ((settings.mixedStrategy || 'balanced') === 'random') {
      const out = [];
      while (out.length < length) {
        const type = Math.random() < 0.5 ? 'completion' : 'sharedPart';
        const q = takeOne(type) || takeOne(type === 'completion' ? 'sharedPart' : 'completion');
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
