// sharedPartIndex.js
// Deep module for Shared-Part Questions: expensive corpus indexing behind a small lookup interface.

(function () {
  const DEFAULT_SELECTION = { mode: 'all' };

  const cleanText = (text) => window.DiffEngine._cleanText(text || "");
  const plainWord = (word) => window.DiffEngine._plainWord(word || "");
  const formatText = (v, format) => (format === 'uthmani' && v.uthmani) ? v.uthmani : v.text;
  const sortedNums = (xs) => Array.from(new Set(xs)).sort((a, b) => a - b);
  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

  const selectionKey = (selection) => {
    selection = selection || DEFAULT_SELECTION;
    if (selection.mode === 'surahs') return 'surahs:' + [...(selection.surahs || [])].sort().join('|');
    if (selection.mode === 'juz') {
      const juzs = Array.isArray(selection.juzs) ? selection.juzs : [selection.juz];
      return 'juz:' + sortedNums(juzs.filter(Boolean)).join('|');
    }
    if (selection.mode === 'pages') return `pages:${selection.pageFrom}-${selection.pageTo}`;
    return 'all';
  };

  const stripCliticForms = (plain) => {
    const forms = [plain];
    let cur = plain;
    while (cur.length > 2 && /^[وفبلكس]/.test(cur)) {
      cur = cur.slice(1);
      forms.push(cur);
    }
    return forms;
  };

  function addToSetMap(map, key, value) {
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(value);
  }

  function createIndex({ groups, quranText, pageJuzMap }) {
    const map = (pageJuzMap && pageJuzMap.byGid) || {};
    const formatCache = new Map();
    const selectionCache = new Map();
    const poolCache = new Map();
    const questionBankCache = new Map();
    let groupPairs = null;

    const buildCorpusByGid = (format) => {
      const corpusByGid = new Map();
      Object.entries(quranText || {}).forEach(([gid, v]) => {
        const g = parseInt(gid);
        const text = formatText(v, format);
        corpusByGid.set(g, { ...v, gid: g, text, clean: cleanText(text) });
      });
      (groups || []).forEach(g => (g.verses || []).forEach(v => {
        if (!corpusByGid.has(v.gid)) {
          const text = formatText(v, format);
          corpusByGid.set(v.gid, { ...v, text, clean: cleanText(text) });
        }
      }));
      return corpusByGid;
    };

    const formatIndex = (format) => {
      format = format || 'uthmani';
      if (formatCache.has(format)) return formatCache.get(format);

      const corpusByGid = buildCorpusByGid(format);
      const verses = Array.from(corpusByGid.values());
      const cleanByGid = new Map(verses.map(v => [v.gid, v.clean]));
      const plainWordToGids = new Map();
      const phraseMap = new Map();

      verses.forEach(v => {
        const versePlainWords = new Set();
        v.text.split(/\s+/).filter(Boolean).forEach(word => {
          stripCliticForms(plainWord(word)).forEach(w => {
            if (w.length > 1) versePlainWords.add(w);
          });
        });
        versePlainWords.forEach(w => addToSetMap(plainWordToGids, w, v.gid));

        const words = v.text.split(/\s+/).filter(Boolean);
        const seen = new Set();
        for (let len = Math.min(5, words.length); len >= 2; len--) {
          for (let i = 0; i <= words.length - len; i++) {
            const text = words.slice(i, i + len).join(" ");
            const key = cleanText(text);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            if (!phraseMap.has(key)) phraseMap.set(key, { key, text, wordCount: len, exactGids: [], exactEndGids: [] });
            const p = phraseMap.get(key);
            p.exactGids.push(v.gid);
            if (i + len === words.length) p.exactEndGids.push(v.gid);
          }
        }
      });

      const repeatedPhrases = Array.from(phraseMap.values())
        .filter(p => p.exactGids.length >= 2)
        .map(p => ({ ...p, plainWords: Array.from(new Set(p.text.split(/\s+/).map(plainWord).filter(w => w.length > 1))) }));
      const idx = { corpusByGid, verses, cleanByGid, plainWordToGids, repeatedPhrases };
      formatCache.set(format, idx);
      return idx;
    };

    const getGroupPairs = () => {
      if (!groupPairs) groupPairs = window.DiffEngine._groupPairSet(groups || []);
      return groupPairs;
    };

    const selectedGids = (selection, format) => {
      const key = (format || 'uthmani') + '|' + selectionKey(selection);
      if (selectionCache.has(key)) return selectionCache.get(key);
      const idx = formatIndex(format);
      const set = new Set();
      const list = [];
      idx.verses.forEach(v => {
        if (window.Scope.inSelection(v, selection || DEFAULT_SELECTION, map)) {
          set.add(v.gid);
          list.push(v.gid);
        }
      });
      const value = { set, list };
      selectionCache.set(key, value);
      return value;
    };

    const poolGids = (settings) => {
      const format = settings.quranTextFormat || 'uthmani';
      const key = format + '|' + (settings.pool || 'all') + '|' + selectionKey(settings.selection);
      if (poolCache.has(key)) return poolCache.get(key);
      const idx = formatIndex(format);
      const gids = idx.verses
        .filter(v => window.Scope.eligibleDistractor(v, settings.pool, settings.selection || DEFAULT_SELECTION, map))
        .map(v => v.gid);
      poolCache.set(key, gids);
      return gids;
    };

    const matchingGids = (phrase, settings) => {
      const format = settings.quranTextFormat || 'uthmani';
      const idx = formatIndex(format);
      const selected = selectedGids(settings.selection || DEFAULT_SELECTION, format);
      let source = selected.list;

      phrase.plainWords.forEach(w => {
        const gids = idx.plainWordToGids.get(w);
        if (!gids) return;
        if (source === selected.list || gids.size < source.length) source = Array.from(gids);
      });

      return source
        .filter(gid => selected.set.has(gid) && idx.cleanByGid.get(gid).includes(phrase.key))
        .sort((a, b) => a - b);
    };

    const sharedCandidates = (settings) => {
      const format = settings.quranTextFormat || 'uthmani';
      const key = format + '|' + selectionKey(settings.selection);
      if (selectionCache.has('candidates|' + key)) return selectionCache.get('candidates|' + key);

      const idx = formatIndex(format);
      const selected = selectedGids(settings.selection || DEFAULT_SELECTION, format);
      const byLocations = new Map();
      const pairs = getGroupPairs();

      idx.repeatedPhrases.forEach(p => {
        let exactCount = 0;
        for (const gid of p.exactGids) if (selected.set.has(gid)) exactCount++;
        if (exactCount < 2) return;

        const gids = matchingGids(p, settings);
        if (gids.length < 2) return;
        const candidate = {
          text: p.text,
          wordCount: p.wordCount,
          gids: new Set(gids),
          endGids: new Set(gids.filter(g => idx.cleanByGid.get(g).endsWith(p.key)))
        };
        const score = window.DiffEngine._scoreSharedCandidate(candidate, pairs);
        if (score <= 0) return;
        const locKey = gids.join(',');
        const current = byLocations.get(locKey);
        if (!current || score > current.score) byLocations.set(locKey, {
          id: 'corpus:' + p.key,
          key: p.key,
          sharedText: p.text,
          correctLocations: gids,
          score
        });
      });

      const out = Array.from(byLocations.values()).sort((a, b) => b.score - a.score || a.sharedText.localeCompare(b.sharedText));
      selectionCache.set('candidates|' + key, out);
      return out;
    };

    const buildQuestion = (candidate, settings) => {
      const format = settings.quranTextFormat || 'uthmani';
      const idx = formatIndex(format);
      const q = window.DiffEngine._buildSharedPartQuestion(
        candidate.id,
        candidate.sharedText,
        candidate.correctLocations,
        idx.corpusByGid,
        { ...settings, _poolGids: poolGids(settings) }
      );
      if (q) q._score = candidate.score;
      return q;
    };

    const questionBankKey = (settings) => [
      settings.quranTextFormat || 'uthmani',
      selectionKey(settings.selection),
      settings.pool || 'all',
      settings.optionMin || '',
      settings.optionCap || ''
    ].join('|');

    const questionBank = (settings, needed) => {
      const key = questionBankKey(settings);
      if (!questionBankCache.has(key)) questionBankCache.set(key, { questions: [], next: 0 });
      const bank = questionBankCache.get(key);
      const candidates = sharedCandidates(settings);
      const target = Math.min(candidates.length, Math.max(needed || 0, 120));
      while (bank.questions.length < target && bank.next < candidates.length) {
        const q = buildQuestion(candidates[bank.next++], settings);
        if (q) bank.questions.push(q);
      }
      return bank.questions;
    };

    const sampleQuestions = (settings, limit) => {
      const bank = questionBank(settings, limit);
      return bank
        .map(q => ({ q, r: Math.random() * 2 }))
        .sort((a, b) => ((b.q._score || 0) + b.r) - ((a.q._score || 0) + a.r))
        .slice(0, limit)
        .map(x => x.q)
        .map(q => ({
          ...q,
          options: shuffle(q.options),
          matchingVerses: q.matchingVerses ? [...q.matchingVerses] : []
        }));
    };

    return {
      corpusByGid: (format) => formatIndex(format || 'uthmani').corpusByGid,
      selectedGids,
      poolGids,
      sharedCandidates,
      buildQuestion,
      questionBank,
      sampleQuestions,
      warm(settings) {
        questionBank(settings || { quranTextFormat: 'uthmani', selection: DEFAULT_SELECTION, pool: 'all' }, 120);
      }
    };
  }

  window.SharedPartIndex = { create: createIndex, selectionKey };
})();
