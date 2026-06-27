// app.js
// إدارة حالة التطبيق والمنطق التفاعلي باستخدام Vue 3
// الأسئلة بمفاتيح المواضع (Location-keyed) — راجع CONTEXT.md و ADR-0001.

const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    // حالة التطبيق العامة
    const similaritiesData = ref([]);
    const isLoaded = ref(false);
    const currentScreen = ref("welcome");
    const darkMode = ref(true);

    // إعدادات الاختبار
    const quizLength = ref(10);
    const quizType = ref('completion'); // completion | sharedPart | mixed
    const mixedStrategy = ref('balanced'); // balanced | random
    const questions = ref([]);
    const currentIndex = ref(0);
    const score = ref(0);
    const selectedAnswer = ref(null);   // كائن الخيار المختار {text, locations, refs}
    const isAnswered = ref(false);
    const quizHistory = ref([]);

    // إعدادات متقدمة (موجودة مسبقاً)
    const showAdvancedSettings = ref(false);
    const quranTextFormat = ref('uthmani');
    const gapMode = ref('full');
    const contextCountBefore = ref(1);
    const contextCountAfter = ref(1);

    // المجال المختار (Selection) — راجع CONTEXT.md
    const selectionMode = ref('all');            // all | surahs | juz | pages
    const selectedSurahs = ref([]);              // مصفوفة أسماء سور (وضع surahs)
    const selectedJuz = ref([1]);                // مصفوفة أجزاء (وضع juz)
    const pageFrom = ref(1);                     // (وضع pages)
    const pageTo = ref(604);

    // مصدر المشتتات (Comparison Pool) + استراتيجية التشتيت (Distractor Selection)
    const pool = ref('all');                     // all | confined
    const distractorStrategy = ref('adaptive');  // adaptive | random

    // نافذة النطاق المحدود (Q4) — راجع CONTEXT.md
    const starvedDialog = ref(null);             // {count, requested, pending} | null

    const totalMutashabihat = computed(() => similaritiesData.value.length);
    const totalVerses = computed(() => similaritiesData.value.reduce((a, c) => a + (c.verses ? c.verses.length : 0), 0));
    const totalPages = computed(() => (window.pageJuzMap && window.pageJuzMap.totalPages) || 604);

    // السور المتاحة (للاختيار المتعدد)
    const availableSurahs = computed(() => {
      const surahs = {};
      similaritiesData.value.forEach(g => g.verses && g.verses.forEach(v => {
        surahs[v.sura_name] ||= { name: v.sura_name, count: 0, order: v.sura_id };
        surahs[v.sura_name].count++;
      }));
      return Object.values(surahs).sort((a, b) => a.order - b.order);
    });

    const currentQuestion = computed(() => questions.value[currentIndex.value] || null);
    const allJuz = Array.from({ length: 30 }, (_, i) => i + 1);
    const selectedJuzSummary = computed(() => {
      if (selectedJuz.value.length === 0) return 'كل الأجزاء';
      if (selectedJuz.value.length <= 4) return selectedJuz.value.map(n => `الجزء ${n}`).join('، ');
      return `${selectedJuz.value.length} أجزاء`;
    });

    // كائن المجال المختار كما يفهمه Scope/Engine
    const buildSelection = () => {
      if (selectionMode.value === 'surahs') {
        const s = selectedSurahs.value.length ? selectedSurahs.value : availableSurahs.value.map(s => s.name);
        return { mode: 'surahs', surahs: s };
      }
      if (selectionMode.value === 'juz') {
        const juzs = selectedJuz.value.length ? selectedJuz.value : allJuz;
        return { mode: 'juz', juzs };
      }
      if (selectionMode.value === 'pages') {
        const f = Math.min(pageFrom.value, pageTo.value), t = Math.max(pageFrom.value, pageTo.value);
        return { mode: 'pages', pageFrom: f, pageTo: t };
      }
      return { mode: 'all' };
    };
    const toggleInList = (listRef, value) => {
      listRef.value = listRef.value.includes(value)
        ? listRef.value.filter(v => v !== value)
        : [...listRef.value, value];
    };
    const toggleSurah = (name) => toggleInList(selectedSurahs, name);
    const toggleJuz = (n) => {
      toggleInList(selectedJuz, n);
      selectedJuz.value.sort((a, b) => a - b);
    };

    // هل الخيار صحيح؟ (مقارنة بالموضع، لا بالنص)
    const sameLocations = (a, b) => a.length === b.length && a.every(g => b.includes(g));
    const isCorrectOption = (option) => {
      const q = currentQuestion.value;
      if (!option || !q) return false;
      if (q.type === 'sharedPart') return sameLocations(option.locations, q.correctLocations);
      return option.locations.includes(q.correctAnswer);
    };
    const isSelectedOption = (option) => selectedAnswer.value && selectedAnswer.value.text === option.text;

    onMounted(async () => {
      try {
        similaritiesData.value = window.similaritiesData || await (await fetch("data/similarities.json")).json();
        isLoaded.value = true;
        if (localStorage.getItem("theme") === "light") darkMode.value = false;
        applyTheme();
      } catch (e) {
        console.error("فشل تحميل بيانات المتشابهات:", e);
        alert("حدث خطأ أثناء تحميل بيانات التطبيق.");
      }
    });

    const applyTheme = () => {
      document.documentElement.classList.toggle("dark", darkMode.value);
      localStorage.setItem("theme", darkMode.value ? "dark" : "light");
    };
    const toggleDarkMode = () => { darkMode.value = !darkMode.value; applyTheme(); };

    // توليد الأسئلة لمجموعات الهدف (مع تجاوز pool اختياري لملء النطاق المحدود)
    const generateAll = (overridePool) => {
      const sel = buildSelection();
      const settings = {
        quranTextFormat: quranTextFormat.value,
        gapMode: gapMode.value,
        contextCountBefore: parseInt(contextCountBefore.value),
        contextCountAfter: parseInt(contextCountAfter.value),
        selection: sel,
        pool: overridePool || pool.value,
        optionCap: 3,
        distractorStrategy: distractorStrategy.value,
        quizType: quizType.value,
        mixedStrategy: mixedStrategy.value
      };
      const map = (window.pageJuzMap && window.pageJuzMap.byGid) || {};
      const targetGroups = similaritiesData.value
        .filter(g => g.verses && g.verses.some(v => window.Scope.inSelection(v, sel, map)))
        .sort(() => Math.random() - 0.5);

      const out = [];
      if (quizType.value === 'mixed') {
        return window.DiffEngine.generateMixedQuestions(targetGroups, similaritiesData.value, settings, quizLength.value);
      }
      for (const g of targetGroups) {
        if (out.length >= quizLength.value) break;
        const q = quizType.value === 'sharedPart'
          ? window.DiffEngine.generateSharedPartQuestion(g, similaritiesData.value, settings)
          : window.DiffEngine.generateQuestion(g, similaritiesData.value, settings);
        if (q) out.push(q);
      }
      return out;
    };

    const beginWith = (qs) => {
      questions.value = qs;
      currentIndex.value = 0;
      score.value = 0;
      selectedAnswer.value = null;
      isAnswered.value = false;
      quizHistory.value = [];
      currentScreen.value = "quiz";
    };

    const startQuiz = () => {
      if (similaritiesData.value.length === 0) return;
      const generated = generateAll();
      if (generated.length === 0) {
        alert("لا توجد متشابهات كافية في هذا النطاق. وسّع المجال أو بدّل مصدر الخيارات.");
        return;
      }
      if (generated.length < quizLength.value) {
        // Q4: نطاق محدود — اعرض خيار صريح بدل التوسّع الصامت
        starvedDialog.value = { count: generated.length, requested: quizLength.value, pending: generated };
        return;
      }
      beginWith(generated);
    };

    const starvedRunPartial = () => { const p = starvedDialog.value.pending; starvedDialog.value = null; beginWith(p); };
    const starvedWidenPool = () => {
      starvedDialog.value = null;
      const filled = generateAll('all'); // وسّع مصدر الخيارات لإكمال العدد
      beginWith(filled.length ? filled : generateAll());
    };

    const selectAnswer = (option) => {
      if (isAnswered.value) return;
      selectedAnswer.value = option;
      isAnswered.value = true;
      const correct = isCorrectOption(option);
      if (correct) { score.value++; triggerConfetti(); }
      const q = currentQuestion.value;
      const correctOpt = q.options.find(o => isCorrectOption(o));
      quizHistory.value.push({
        type: q.type || 'completion',
        suraName: q.suraName, ayaId: q.ayaId,
        before: q.before, after: q.after,
        beforeVerses: q.beforeVerses, afterVerses: q.afterVerses,
        userAnswerText: option.text,
        correctAnswerText: correctOpt ? correctOpt.text : '',
        correctOptionRefs: correctOpt ? correctOpt.refs : [],
        sharedText: q.sharedText,
        matchingVerses: q.matchingVerses || [],
        comparisonSurah: q.comparisonSurah, comparisonAya: q.comparisonAya, comparisonText: q.comparisonText,
        isCorrect: correct
      });
    };

    const nextQuestion = () => {
      if (currentIndex.value < questions.value.length - 1) {
        currentIndex.value++;
        selectedAnswer.value = null;
        isAnswered.value = false;
      } else {
        currentScreen.value = "result";
      }
    };

    const resetQuiz = () => {
      currentScreen.value = "welcome";
      questions.value = [];
      currentIndex.value = 0;
      score.value = 0;
      selectedAnswer.value = null;
      isAnswered.value = false;
      quizHistory.value = [];
      starvedDialog.value = null;
    };

    const triggerConfetti = () => {
      if (typeof confetti === "function") {
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 }, colors: ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0"] });
      }
    };

    return {
      isLoaded, currentScreen, darkMode,
      quizLength, quizType, mixedStrategy, questions, currentIndex, score, selectedAnswer, isAnswered, quizHistory,
      totalMutashabihat, totalVerses, totalPages, availableSurahs, currentQuestion,
      allJuz, selectedJuzSummary,
      showAdvancedSettings, quranTextFormat, gapMode, contextCountBefore, contextCountAfter,
      selectionMode, selectedSurahs, selectedJuz, pageFrom, pageTo, pool, distractorStrategy,
      starvedDialog,
      isCorrectOption, isSelectedOption,
      toggleDarkMode, toggleSurah, toggleJuz, startQuiz, selectAnswer, nextQuestion, resetQuiz,
      starvedRunPartial, starvedWidenPool
    };
  }
}).mount("#app");
