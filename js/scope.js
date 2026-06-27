// scope.js
// منطق المجال المختار (Selection) ومصدر المشتتات (Comparison Pool).
// مشترك بين app.js (لتصفية المجموعات) و diffEngine (لتصفية المشتتات).
// ponytail: one predicate set, two callers — root-cause over per-caller filters.

window.Scope = {
  /**
   * هل ينتمي الورود إلى المجال المختار؟
   * verse: {gid, sura_name, ...} | map: window.pageJuzMap.byGid
   */
  inSelection(verse, selection, map) {
    if (!selection || selection.mode === 'all') return true;
    const m = selection.mode;
    if (m === 'surahs') {
      return selection.surahs.includes(verse.sura_name);
    }
    if (m === 'juz') {
      const info = map && map[verse.gid];
      const juzs = Array.isArray(selection.juzs) ? selection.juzs : [selection.juz];
      return !!info && juzs.includes(info.juz);
    }
    if (m === 'pages') {
      const info = map && map[verse.gid];
      return !!info && info.page >= selection.pageFrom && info.page <= selection.pageTo;
    }
    return true;
  },

  /** هل الورود مؤهل كمشتّت؟ Confined = داخل المجال؛ all = دائماً صحيح. */
  eligibleDistractor(verse, pool, selection, map) {
    if (!pool || pool === 'all') return true;
    return this.inSelection(verse, selection, map); // confined
  },

  /** وصف نصي للنطاق للرسائل وعرض الإعدادات. */
  describe(selection) {
    if (!selection || selection.mode === 'all') return 'كل السور';
    if (selection.mode === 'surahs') {
      const s = selection.surahs;
      if (s.length <= 3) return s.join('، ');
      return s.slice(0, 3).join('، ') + ` (+${s.length - 3})`;
    }
    if (selection.mode === 'juz') {
      const juzs = Array.isArray(selection.juzs) ? selection.juzs : [selection.juz];
      if (juzs.length === 1) return `الجزء ${juzs[0]}`;
      if (juzs.length <= 3) return juzs.map(n => `الجزء ${n}`).join('، ');
      return `${juzs.length} أجزاء`;
    }
    if (selection.mode === 'pages') return `الصفحات ${selection.pageFrom}–${selection.pageTo}`;
    return '';
  }
};
