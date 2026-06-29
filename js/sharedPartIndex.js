// sharedPartIndex.js
// Deep module for Shared-Part Questions: expensive corpus indexing behind a small lookup interface.

(function () {
  const DEFAULT_SELECTION = { mode: 'all' };

  const cleanText = (text) => (text || "").replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
  const plainFromClean = (word) => word
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[إأٱآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ؤ]/g, "و")
    .replace(/[ئ]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0621-\u064A]/g, "");
  const formatText = (v, format) => (format === 'uthmani' && v.uthmani) ? v.uthmani : v.text;
  const sortedNums = (xs) => Array.from(new Set(xs)).sort((a, b) => a - b);
  const shuffle = (arr) => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const wordInfoCache = new Map();
  const cachedWordInfo = (word) => {
    let value = wordInfoCache.get(word);
    if (value === undefined) {
      const clean = cleanText(word);
      value = [clean, plainFromClean(clean)];
      wordInfoCache.set(word, value);
    }
    return value;
  };

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

  const optionLimit = (settings) => {
    const max = Math.max(2, settings.optionCap || 3);
    const min = Math.max(2, Math.min(max, settings.optionMin || max));
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  const stopWords = new Set([
    "و", "ف", "ثم", "او", "ام", "بل", "لا", "ما", "من", "في", "عن", "علي", "الى",
    "ان", "انما", "قد", "لقد", "كل", "هذا", "هذه", "ذلك", "تلك", "هو", "هي", "هم",
    "الذي", "الذين", "التي", "يا", "ايها"
  ]);

  const groupPairSet = (groups) => {
    const pairs = new Set();
    (groups || []).forEach(g => {
      const gids = (g.verses || []).map(v => v.gid).filter(Boolean);
      for (let i = 0; i < gids.length; i++) {
        for (let j = i + 1; j < gids.length; j++) pairs.add([gids[i], gids[j]].sort((a, b) => a - b).join(':'));
      }
    });
    return pairs;
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
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(value);
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
        const words = v.text.split(/\s+/).filter(Boolean);
        const plainWords = new Array(words.length);
        const cleanWords = new Array(words.length);
        for (let i = 0; i < words.length; i++) {
          const info = cachedWordInfo(words[i]);
          cleanWords[i] = info[0];
          plainWords[i] = info[1];
        }
        const versePlainWords = new Set();
        plainWords.forEach(plain => {
          stripCliticForms(plain).forEach(w => {
            if (w.length > 1) versePlainWords.add(w);
          });
        });
        versePlainWords.forEach(w => addToSetMap(plainWordToGids, w, v.gid));

        const seen = new Set();
        for (let i = 0; i < words.length - 1; i++) {
          let text = "";
          let key = "";
          const maxLen = Math.min(5, words.length - i);
          for (let len = 1; len <= maxLen; len++) {
            const idx = i + len - 1;
            text = len === 1 ? words[idx] : text + " " + words[idx];
            key = len === 1 ? cleanWords[idx] : key + " " + cleanWords[idx];
            if (len < 2) continue;
            const phraseKey = key.trim();
            if (!phraseKey || seen.has(phraseKey)) continue;
            seen.add(phraseKey);
            let p = phraseMap.get(phraseKey);
            if (!p) {
              p = { key: phraseKey, text, wordCount: len, exactGids: [] };
              phraseMap.set(phraseKey, p);
            }
            p.exactGids.push(v.gid);
          }
        }
      });

      const plainWordToGidsList = new Map(Array.from(plainWordToGids, ([key, set]) => [key, Array.from(set)]));
      const repeatedPhrases = Array.from(phraseMap.values())
        .filter(p => p.exactGids.length >= 2)
        .map(p => ({ ...p, plainWords: Array.from(new Set(p.text.split(/\s+/).map(w => cachedWordInfo(w)[1]).filter(w => w.length > 1))) }));
      const idx = { corpusByGid, verses, cleanByGid, plainWordToGids: plainWordToGidsList, repeatedPhrases };
      formatCache.set(format, idx);
      return idx;
    };

    const getGroupPairs = () => {
      if (!groupPairs) groupPairs = groupPairSet(groups || []);
      return groupPairs;
    };

    const contentWordCountCache = new Map();
    const contentWordCount = (text) => {
      if (!contentWordCountCache.has(text)) {
        contentWordCountCache.set(text, text.split(/\s+/).map(w => cachedWordInfo(w)[1]).filter(w => w.length > 1 && !stopWords.has(w)).length);
      }
      return contentWordCountCache.get(text);
    };

    const isGroupBacked = (gids, locKey, pairs, cache) => {
      if (cache.has(locKey)) return cache.get(locKey);
      for (let i = 0; i < gids.length; i++) {
        for (let j = i + 1; j < gids.length; j++) {
          if (pairs.has(gids[i] + ':' + gids[j])) {
            cache.set(locKey, true);
            return true;
          }
        }
      }
      cache.set(locKey, false);
      return false;
    };

    const scoreSharedCandidate = (phrase, gids, endCount, locKey, pairs, groupBackedCache) => {
      const wordScore = ({ 2: 8, 3: 9, 4: 7, 5: 5 })[phrase.wordCount] || 0;
      const locationCount = gids.length;
      const locationScore = locationCount === 2 ? 10 : locationCount === 3 ? 8 : locationCount <= 5 ? 6 : locationCount <= 8 ? 3 : 0;
      const contentScore = Math.min(6, contentWordCount(phrase.text) * 2);
      const concisePairBonus = phrase.wordCount === 2 && locationCount === 2 ? 4 : 0;
      const endingBonus = endCount === locationCount ? 4 : 0;
      const groupBonus = isGroupBacked(gids, locKey, pairs, groupBackedCache) ? 3 : 0;
      const broadPenalty = locationCount > 12 ? 6 : 0;
      const emptyPenalty = contentScore === 0 ? 12 : 0;
      return wordScore + locationScore + contentScore + concisePairBonus + endingBonus + groupBonus - broadPenalty - emptyPenalty;
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

    const matchingGids = (phrase, settings, idx, selected) => {
      const format = settings.quranTextFormat || 'uthmani';
      idx = idx || formatIndex(format);
      selected = selected || selectedGids(settings.selection || DEFAULT_SELECTION, format);
      let sourceSet = null;
      let sourceSize = selected.list.length;

      phrase.plainWords.forEach(w => {
        const gids = idx.plainWordToGids.get(w);
        if (!gids) return;
        if (gids.length < sourceSize) {
          sourceSet = gids;
          sourceSize = gids.length;
        }
      });

      const source = sourceSet || selected.list;
      const allSelected = selected.list.length === idx.verses.length;
      const matched = allSelected
        ? source.filter(gid => idx.cleanByGid.get(gid).includes(phrase.key))
        : source.filter(gid => selected.set.has(gid) && idx.cleanByGid.get(gid).includes(phrase.key));
      return matched;
    };

    const sharedCandidates = (settings) => {
      const format = settings.quranTextFormat || 'uthmani';
      const key = format + '|' + selectionKey(settings.selection);
      if (selectionCache.has('candidates|' + key)) return selectionCache.get('candidates|' + key);

      const idx = formatIndex(format);
      const selected = selectedGids(settings.selection || DEFAULT_SELECTION, format);
      const allSelected = selected.list.length === idx.verses.length;
      const byLocations = new Map();
      const pairs = getGroupPairs();
      const groupBackedCache = new Map();

      idx.repeatedPhrases.forEach(p => {
        let exactCount = allSelected ? p.exactGids.length : 0;
        if (!allSelected) for (const gid of p.exactGids) if (selected.set.has(gid)) exactCount++;
        if (exactCount < 2) return;

        const gids = matchingGids(p, settings, idx, selected);
        if (gids.length < 2) return;
        const locKey = gids.join(',');
        let endCount = 0;
        gids.forEach(g => { if (idx.cleanByGid.get(g).endsWith(p.key)) endCount++; });
        const score = scoreSharedCandidate(p, gids, endCount, locKey, pairs, groupBackedCache);
        if (score <= 0) return;
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

    const buildSharedPartQuestion = (id, sharedText, correctLocations, corpusByGid, settings) => {
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
      const byGid = (corpusByGid && typeof corpusByGid.get === 'function' && typeof corpusByGid.has === 'function')
        ? corpusByGid
        : new Map(Array.from(corpusByGid.values()).map(v => [v.gid, v]));
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

      const limit = optionLimit(settings);
      const fakePoolGids = settings._poolGids || poolGids(settings);
      const outsiders = fakePoolGids.filter(g => !correctLocations.includes(g));

      correctLocations.forEach((gid, idx) => sample(outsiders, 8).forEach(g => addWrong(correctLocations.map((x, i) => i === idx ? g : x))));
      sample(outsiders, 8).forEach(g => addWrong([...correctLocations, g]));
      correctLocations.forEach(g => addWrong([g]));
      sample(fakePoolGids, 12).forEach(g => addWrong([g]));

      for (let i = 0; i < 80 && wrongSets.length < limit * 4; i++) {
        const maxSize = Math.min(fakePoolGids.length, Math.max(2, correctLocations.length + 2));
        const minSize = Math.min(maxSize, correctLocations.length > 1 ? 2 : 1);
        const size = minSize + Math.floor(Math.random() * (maxSize - minSize + 1));
        addWrong(sample(fakePoolGids, size));
      }

      const options = shuffle([
        optionFrom(correctLocations),
        ...shuffle(wrongSets).slice(0, limit - 1).map(optionFrom)
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
    };

    const buildQuestion = (candidate, settings) => {
      const format = settings.quranTextFormat || 'uthmani';
      const idx = formatIndex(format);
      const q = buildSharedPartQuestion(
        candidate.id,
        candidate.sharedText,
        candidate.correctLocations,
        idx.corpusByGid,
        { ...settings, _poolGids: poolGids(settings) }
      );
      if (q) q._score = candidate.score;
      return q;
    };

    const buildGroupQuestion = (group, settings = {}) => {
      settings = Object.assign({
        quranTextFormat: 'uthmani', selection: DEFAULT_SELECTION, pool: 'all', optionCap: 3
      }, settings);

      if (!group || !group.verses || group.verses.length < 2) return null;

      const format = settings.quranTextFormat || 'uthmani';
      const idx = formatIndex(format);
      const inSelection = (v) => window.Scope.inSelection(v, settings.selection, map);
      const eligibleForPool = (v) => window.Scope.eligibleDistractor(v, settings.pool, settings.selection, map);
      const formattedGroupVerses = group.verses.map(v => {
        const corpusVerse = idx.corpusByGid.get(v.gid);
        return { ...v, text: corpusVerse ? corpusVerse.text : formatText(v, format) };
      });
      const verses = formattedGroupVerses.filter(v => inSelection(v) || eligibleForPool(v));
      if (verses.length < 2 || !verses.some(inSelection)) return null;

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
      const correctLocations = Array.from(idx.corpusByGid.values())
        .filter(v => inSelection(v) && cleanText(v.text).includes(matchKey))
        .map(v => v.gid);
      return buildSharedPartQuestion(group.id, picked.text, correctLocations, idx.corpusByGid, { ...settings, _poolGids: poolGids(settings) });
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
      const target = Math.min(candidates.length, Math.max(needed || 0, bank.questions.length));
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
      buildGroupQuestion,
      questionBank,
      sampleQuestions,
      warm(settings) {
        questionBank(settings || { quranTextFormat: 'uthmani', selection: DEFAULT_SELECTION, pool: 'all' }, 120);
      }
    };
  }

  window.SharedPartIndex = { create: createIndex, selectionKey };
})();
