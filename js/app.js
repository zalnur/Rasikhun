// app.js
// إدارة حالة التطبيق والمنطق التفاعلي باستخدام Vue 3

const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    // حالة التطبيق العامة
    const similaritiesData = ref([]);
    const isLoaded = ref(false);
    const currentScreen = ref("welcome"); // welcome, quiz, result
    const darkMode = ref(true); // الوضع المظلم افتراضي لجمالية التصميم

    // إعدادات الاختبار
    const quizLength = ref(10);
    const questions = ref([]);
    const currentIndex = ref(0);
    const score = ref(0);
    const selectedAnswer = ref(null);
    const isAnswered = ref(false);
    const quizHistory = ref([]); // مراجعة الإجابات في النهاية

    // إعدادات متقدمة
    const showAdvancedSettings = ref(false);
    const quranTextFormat = ref('uthmani'); // 'uthmani' or 'standard'
    const gapMode = ref('full'); // 'diff' or 'full'
    const contextCountBefore = ref(1); // 0 to 3
    const contextCountAfter = ref(1); // 0 to 3
    const selectedSurah = ref('all'); // 'all' or sura_name

    // إحصائيات عامة عن البيانات
    const totalMutashabihat = computed(() => similaritiesData.value.length);
    const totalVerses = computed(() => {
      return similaritiesData.value.reduce((acc, curr) => acc + (curr.verses ? curr.verses.length : 0), 0);
    });

    // السور المتاحة للاختبار
    const availableSurahs = computed(() => {
      const counts = {};
      similaritiesData.value.forEach(group => {
        if (group.verses) {
          group.verses.forEach(v => {
            if (!counts[v.sura_name]) counts[v.sura_name] = 0;
            // Count each mutashabih verse as a potential question for that surah
            counts[v.sura_name]++;
          });
        }
      });
      return Object.keys(counts).map(sura => ({
        name: sura,
        count: counts[sura]
      })).sort((a, b) => b.count - a.count);
    });

    // السؤال الحالي
    const currentQuestion = computed(() => {
      return questions.value[currentIndex.value] || null;
    });

    // تحميل البيانات عند بدء التشغيل
    onMounted(async () => {
      try {
        if (window.similaritiesData) {
          similaritiesData.value = window.similaritiesData;
        } else {
          const response = await fetch("data/similarities.json");
          similaritiesData.value = await response.json();
        }
        isLoaded.value = true;
        
        // التحقق من الوضع المفضل للمستخدم أو ضبط الوضع المظلم كافتراضي
        if (localStorage.getItem("theme") === "light") {
          darkMode.value = false;
        }
        applyTheme();
      } catch (error) {
        console.error("فشل تحميل ملف المتشابهات:", error);
        alert("حدث خطأ أثناء تحميل بيانات التطبيق. يرجى التأكد من تشغيل الخادم المحلي بشكل صحيح.");
      }
    });

    // تطبيق السمة (داكن/مضيء)
    const applyTheme = () => {
      if (darkMode.value) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
    };

    const toggleDarkMode = () => {
      darkMode.value = !darkMode.value;
      applyTheme();
    };

    // بدء الاختبار
    const startQuiz = () => {
      if (similaritiesData.value.length === 0) return;

      // تصفية حسب السورة إذا لزم الأمر
      let filteredGroups = similaritiesData.value;
      if (selectedSurah.value !== 'all') {
        filteredGroups = similaritiesData.value.filter(group => {
          return group.verses.some(v => v.sura_name === selectedSurah.value);
        });
      }

      // اختيار مجموعات عشوائية بناءً على طول الاختبار المختار
      const shuffledGroups = [...filteredGroups].sort(() => Math.random() - 0.5);
      const selectedGroups = shuffledGroups.slice(0, Math.min(quizLength.value, shuffledGroups.length));

      // توليد الأسئلة باستخدام DiffEngine
      questions.value = selectedGroups
        .map(group => window.DiffEngine.generateQuestion(group, similaritiesData.value, {
          quranTextFormat: quranTextFormat.value,
          gapMode: gapMode.value,
          contextCountBefore: parseInt(contextCountBefore.value),
          contextCountAfter: parseInt(contextCountAfter.value),
          selectedSurah: selectedSurah.value
        }))
        .filter(q => q !== null); // تصفية أي أسئلة فشل توليدها

      if (questions.value.length === 0) {
        alert("لم نتمكن من توليد أسئلة كافية. يرجى المحاولة مرة أخرى.");
        return;
      }

      currentIndex.value = 0;
      score.value = 0;
      selectedAnswer.value = null;
      isAnswered.value = false;
      quizHistory.value = [];
      currentScreen.value = "quiz";
    };

    // اختيار إجابة
    const selectAnswer = (option) => {
      if (isAnswered.value) return;

      selectedAnswer.value = option;
      isAnswered.value = true;
      const isCorrect = option === currentQuestion.value.correctAnswer;

      if (isCorrect) {
        score.value++;
        triggerConfetti();
      }

      // حفظ السؤال في السجل للمراجعة
      quizHistory.value.push({
        ...currentQuestion.value,
        userAnswer: option,
        isCorrect: isCorrect
      });
    };

    // الانتقال للسؤال التالي
    const nextQuestion = () => {
      if (currentIndex.value < questions.value.length - 1) {
        currentIndex.value++;
        selectedAnswer.value = null;
        isAnswered.value = false;
      } else {
        currentScreen.value = "result";
      }
    };

    // إعادة الاختبار
    const resetQuiz = () => {
      currentScreen.value = "welcome";
      questions.value = [];
      currentIndex.value = 0;
      score.value = 0;
      selectedAnswer.value = null;
      isAnswered.value = false;
      quizHistory.value = [];
    };

    // تأثير الاحتفال (Confetti) عند الإجابة الصحيحة
    const triggerConfetti = () => {
      if (typeof confetti === "function") {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.8 },
          colors: ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0"]
        });
      }
    };

    return {
      isLoaded,
      currentScreen,
      darkMode,
      quizLength,
      currentIndex,
      score,
      selectedAnswer,
      isAnswered,
      quizHistory,
      totalMutashabihat,
      totalVerses,
      availableSurahs,
      currentQuestion,
      questions,
      showAdvancedSettings,
      quranTextFormat,
      gapMode,
      contextCountBefore,
      contextCountAfter,
      selectedSurah,
      toggleDarkMode,
      startQuiz,
      selectAnswer,
      nextQuestion,
      resetQuiz
    };
  }
}).mount("#app");
