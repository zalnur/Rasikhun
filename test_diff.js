const DiffEngine = {
  getDiff: function (textA, textB) {
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
      distractor: diffB || "بدون إضافة"
    };
  }
};

const v1 = "وَإِذۡ قُلۡنَا لِلۡمَلَٰۤئِكَةِ ٱسۡجُدُوا۟ لِءَادَمَ فَسَجَدُوۤا۟ إِلَّاۤ إِبۡلِیسَ أَبَىٰ وَٱسۡتَكۡبَرَ وَكَانَ مِنَ ٱلۡكَٰفِرِینَ";
const v2 = "وَإِذۡ قُلۡنَا لِلۡمَلَٰۤئِكَةِ ٱسۡجُدُوا۟ لِءَادَمَ فَسَجَدُوۤا۟ إِلَّاۤ إِبۡلِیسَ قَالَ ءَأَسۡجُدُ لِمَنۡ خَلَقۡتَ طِینࣰا";

console.log(DiffEngine.getDiff(v1, v2));
