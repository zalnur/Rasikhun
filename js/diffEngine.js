// diffEngine.js
// يحتوي هذا الملف على الخوارزمية البرمجية لمقارنة الآيات واستخراج الفروق بدقة

window.DiffEngine = {
  /**
   * مقارنة آيتين واستخراج الجزء المختلف مع سياق بسيط حوله
   * @param {string} textA - الآية المستهدفة (السؤال)
   * @param {string} textB - الآية المقارن بها (التي تحدد وجه الشبه)
   * @returns {object} يحتوي على الجزء قبل الفراغ، الجزء بعد الفراغ، الخيار الصحيح، والخيار المشتت
   */
  getDiff: function (textA, textB) {
    // تنظيف النصوص من علامات الترقيم الزائدة لتسهيل المقارنة (مع إبقاء النص الأصلي كما هو للعرض)
    const cleanText = (text) => text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
    
    const wordsA = textA.split(/\s+/);
    const wordsB = textB.split(/\s+/);

    let prefix = 0;
    while (
      prefix < wordsA.length &&
      prefix < wordsB.length &&
      cleanText(wordsA[prefix]) === cleanText(wordsB[prefix])
    ) {
      prefix++;
    }

    let suffix = 0;
    while (
      suffix < wordsA.length - prefix &&
      suffix < wordsB.length - prefix &&
      cleanText(wordsA[wordsA.length - 1 - suffix]) === cleanText(wordsB[wordsB.length - 1 - suffix])
    ) {
      suffix++;
    }

    // لتوفير الفروق بدقة كما طلب المستخدم، سنعتمد البادئة واللاحقة كاملة دون اقتطاع
    const prefixContext = prefix;
    const suffixContext = suffix;

    const prefixWords = wordsA.slice(0, prefixContext).join(" ");
    const suffixWords = wordsA.slice(wordsA.length - suffixContext).join(" ");

    const diffA = wordsA.slice(prefixContext, wordsA.length - suffixContext).join(" ");
    const diffB = wordsB.slice(prefixContext, wordsB.length - suffixContext).join(" ");

    return {
      before: prefixWords,
      after: suffixWords,
      correct: diffA,
      distractor: diffB || "بدون إضافة" // إذا لم يكن هناك كلمة مقابلة
    };
  },

  /**
   * توليد سؤال من مجموعة متشابهات
   * @param {object} group - مجموعة المتشابهات من ملف JSON
   * @param {array} allGroups - كل المجموعات (غير مستخدمة حالياً بعد إلغاء المشتتات العشوائية)
   * @param {object} settings - الإعدادات المتقدمة
   * @returns {object} كائن السؤال الجاهز للعرض
   */
  generateQuestion: function (group, allGroups, settings = { quranTextFormat: 'uthmani', gapMode: 'full', contextCountBefore: 1, contextCountAfter: 1, selectedSurah: 'all' }) {
    if (!group || !group.verses || group.verses.length < 2) return null;

    const formatVerseText = (v) => {
      if (settings.quranTextFormat === 'uthmani' && window.quranText && window.quranText[v.gid] && window.quranText[v.gid].uthmani) {
        return window.quranText[v.gid].uthmani;
      }
      return v.text;
    };

    group = {
      ...group,
      verses: group.verses.map(v => ({ ...v, text: formatVerseText(v) }))
    };

    let targetIdx = Math.floor(Math.random() * group.verses.length);
    if (settings.selectedSurah && settings.selectedSurah !== 'all') {
      const validIndices = group.verses.map((v, i) => v.sura_name === settings.selectedSurah ? i : -1).filter(i => i !== -1);
      if (validIndices.length > 0) {
        targetIdx = validIndices[Math.floor(Math.random() * validIndices.length)];
      }
    }
    const targetVerse = group.verses[targetIdx];

    const cleanText = (text) => text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
    const cleanTargetText = cleanText(targetVerse.text);
    const validCompVerses = group.verses.filter((v, idx) => {
      if (idx === targetIdx) return false;
      return cleanText(v.text) !== cleanTargetText;
    });

    if (validCompVerses.length === 0) return null;

    // اختيار آية مقارنة تعطي إجابة صحيحة غير فارغة
    // (أحياناً تكون الآية المستهدفة جزءاً من آية أطول، فيكون الفرق فارغاً)
    const shuffledCompVerses = [...validCompVerses].sort(() => Math.random() - 0.5);
    let compVerse = null;
    let diffData = null;
    const options = new Set();

    if (settings.gapMode === 'full') {
      // في وضع إخفاء الآية بالكامل، لا توجد مشكلة الفراغ الفارغ
      compVerse = shuffledCompVerses[0];
      diffData = { before: "", after: "", correct: targetVerse.text, distractor: compVerse.text };
      options.add(targetVerse.text);
      options.add(compVerse.text);
      group.verses.forEach(v => {
        if (v !== targetVerse && v !== compVerse) options.add(v.text);
      });
    } else {
      // في وضع الفروق: جرّب كل آية مقارنة حتى نجد واحدة تعطي فرقاً غير فارغ
      for (const cv of shuffledCompVerses) {
        const candidateDiff = this.getDiff(targetVerse.text, cv.text);
        if (candidateDiff.correct && candidateDiff.correct.trim() !== '') {
          compVerse = cv;
          diffData = candidateDiff;
          break;
        }
      }

      // إذا لم نجد آية مقارنة تعطي فرقاً غير فارغ، نتخطى هذا السؤال
      if (!compVerse || !diffData) return null;

      options.add(diffData.correct);
      options.add(diffData.distractor);

      // استخراج الخيارات الإضافية من الآيات الأخرى في المجموعة
      // باستخدام نفس حدود الفراغ (عدد كلمات before/after) لقص الجزء المقابل من كل آية
      // هذا يمنع ظهور كلمات من النص الظاهر في الخيارات
      const beforeWordCount = diffData.before ? diffData.before.split(/\s+/).filter(w => w).length : 0;
      const afterWordCount = diffData.after ? diffData.after.split(/\s+/).filter(w => w).length : 0;

      group.verses.forEach(v => {
        if (v !== targetVerse && v !== compVerse) {
          const cleanV = cleanText(v.text);
          if (cleanV !== cleanTargetText) {
            const vWords = v.text.split(/\s+/);
            const endIdx = afterWordCount > 0 ? vWords.length - afterWordCount : vWords.length;
            // التأكد من أن الحدود صالحة وأن هناك نص في الوسط
            if (endIdx > beforeWordCount && endIdx <= vWords.length && beforeWordCount < vWords.length) {
              const optText = vWords.slice(beforeWordCount, endIdx).join(" ").trim();
              // تجاهل الخيارات الفارغة أو المكررة
              if (optText && optText.trim() !== '' && optText !== diffData.correct) {
                options.add(optText);
              }
            }
          }
        }
      });
    }

    // --- تنظيف الخيارات من أي تداخل مع النص الظاهر ---
    const beforeClean = cleanText(diffData.before || "");
    const afterClean = cleanText(diffData.after || "");
    const beforeWords = beforeClean ? beforeClean.split(/\s+/).filter(w => w) : [];
    const afterWords = afterClean ? afterClean.split(/\s+/).filter(w => w) : [];

    const cleanedOptions = [];

    Array.from(options).forEach(opt => {
      // تجاهل الخيارات الفارغة
      if (!opt || opt.trim() === '') return;

      let finalOpt = opt;
      let optWords = finalOpt.split(/\s+/).filter(w => w);
      let optCleanWords = cleanText(finalOpt).split(/\s+/).filter(w => w);

      // إزالة التداخل من بداية الخيار مع نهاية الجزء الظاهر (before)
      if (beforeWords.length > 0 && optCleanWords.length > 0) {
        let overlapStart = 0;
        for (let k = Math.min(beforeWords.length, optCleanWords.length); k > 0; k--) {
          let match = true;
          for (let i = 0; i < k; i++) {
            if (beforeWords[beforeWords.length - k + i] !== optCleanWords[i]) {
              match = false;
              break;
            }
          }
          if (match) {
            overlapStart = k;
            break;
          }
        }
        if (overlapStart > 0) {
          finalOpt = optWords.slice(overlapStart).join(" ").trim();
          optWords = finalOpt.split(/\s+/).filter(w => w);
          optCleanWords = cleanText(finalOpt).split(/\s+/).filter(w => w);
        }
      }

      // إزالة التداخل من نهاية الخيار مع بداية الجزء الظاهر (after)
      if (afterWords.length > 0 && optCleanWords.length > 0) {
        let overlapEnd = 0;
        for (let k = Math.min(afterWords.length, optCleanWords.length); k > 0; k--) {
          let match = true;
          for (let i = 0; i < k; i++) {
            if (optCleanWords[optCleanWords.length - k + i] !== afterWords[i]) {
              match = false;
              break;
            }
          }
          if (match) {
            overlapEnd = k;
            break;
          }
        }
        if (overlapEnd > 0) {
          finalOpt = optWords.slice(0, optWords.length - overlapEnd).join(" ").trim();
        }
      }

      // التحقق النهائي: الخيار يجب ألا يحتوي على 3 كلمات متتالية أو أكثر من النص الظاهر
      if (finalOpt && finalOpt.trim()) {
        const finalCleanWords = cleanText(finalOpt).split(/\s+/).filter(w => w);
        let hasSignificantOverlap = false;

        // فحص تداخل مع before
        if (beforeWords.length >= 3 && finalCleanWords.length >= 3) {
          for (let i = 0; i <= finalCleanWords.length - 3; i++) {
            for (let j = 0; j <= beforeWords.length - 3; j++) {
              if (finalCleanWords[i] === beforeWords[j] &&
                  finalCleanWords[i + 1] === beforeWords[j + 1] &&
                  finalCleanWords[i + 2] === beforeWords[j + 2]) {
                hasSignificantOverlap = true;
                break;
              }
            }
            if (hasSignificantOverlap) break;
          }
        }

        // فحص تداخل مع after
        if (!hasSignificantOverlap && afterWords.length >= 3 && finalCleanWords.length >= 3) {
          for (let i = 0; i <= finalCleanWords.length - 3; i++) {
            for (let j = 0; j <= afterWords.length - 3; j++) {
              if (finalCleanWords[i] === afterWords[j] &&
                  finalCleanWords[i + 1] === afterWords[j + 1] &&
                  finalCleanWords[i + 2] === afterWords[j + 2]) {
                hasSignificantOverlap = true;
                break;
              }
            }
            if (hasSignificantOverlap) break;
          }
        }

        // إضافة الخيار فقط إذا لم يكن فيه تداخل (أو كان هو الإجابة الصحيحة)
        if (!hasSignificantOverlap || finalOpt === diffData.correct) {
          cleanedOptions.push(finalOpt);
        }
      }
    });

    // التأكد من وجود الإجابة الصحيحة دائماً
    if (!cleanedOptions.includes(diffData.correct)) {
      cleanedOptions.unshift(diffData.correct);
    }

    const shuffledOptions = [...cleanedOptions];
    shuffledOptions.sort(() => Math.random() - 0.5);

    let beforeVerses = [];
    let afterVerses = [];

    if (window.quranText) {
      const gid = parseInt(targetVerse.gid);
      // جلب الآيات السابقة
      if (settings.contextCountBefore > 0) {
        for (let i = settings.contextCountBefore; i >= 1; i--) {
          const v = window.quranText[gid - i];
          if (v && v.sura_id === targetVerse.sura_id) {
            const textToUse = (settings.quranTextFormat === 'uthmani' && v.uthmani) ? v.uthmani : v.text;
            beforeVerses.push({ text: textToUse, aya_id: v.aya_id });
          }
        }
      }
      // جلب الآيات اللاحقة
      if (settings.contextCountAfter > 0) {
        for (let i = 1; i <= settings.contextCountAfter; i++) {
          const v = window.quranText[gid + i];
          if (v && v.sura_id === targetVerse.sura_id) {
            const textToUse = (settings.quranTextFormat === 'uthmani' && v.uthmani) ? v.uthmani : v.text;
            afterVerses.push({ text: textToUse, aya_id: v.aya_id });
          }
        }
      }
    }

    return {
      id: group.id,
      suraName: targetVerse.sura_name,
      ayaId: targetVerse.aya_id,
      fullText: targetVerse.text,
      before: diffData.before,
      after: diffData.after,
      correctAnswer: diffData.correct,
      options: shuffledOptions,
      comparisonSurah: compVerse.sura_name,
      comparisonAya: compVerse.aya_id,
      comparisonText: compVerse.text,
      beforeVerses: beforeVerses,
      afterVerses: afterVerses
    };
  }
};
