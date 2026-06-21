const fs = require('fs');
const quranData = require('./Furooq/data/quran.json');

const quranText = {};
quranData.forEach(verse => {
  quranText[verse.gid] = {
    sura_name: verse.sura_name,
    sura_id: verse.sura_id,
    aya_id: verse.aya_id,
    text: verse.standard,
    uthmani: verse.uthmani
  };
});

const fileContent = `window.quranText = ${JSON.stringify(quranText)};\n`;
fs.writeFileSync('./data/quran_text.js', fileContent, 'utf8');
console.log('Successfully generated data/quran_text.js with', Object.keys(quranText).length, 'verses.');
