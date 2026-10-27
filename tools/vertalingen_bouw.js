/* Schrijft js/i18n-producten.js (vertaalde intro's voor shop en geurwijzer)
   opnieuw uit api/_vertalingen.json.   node tools/vertalingen_bouw.js */
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');
const V = require(path.join(R, 'api/_vertalingen.json'));
const rijen = Object.values(V).filter(v => v.nl.i && v.en.i && v.ar.i).map(v => [v.nl.i, v.en.i, v.ar.i]);
fs.writeFileSync(path.join(R, 'js/i18n-producten.js'),
  '/* Gegenereerd: vertaalde productomschrijvingen [nl, en, ar] voor js/taal.js. Bron: api/_vertalingen.json */\n' +
  'window.ELIANDI_I18N_PRODUCTEN = ' + JSON.stringify(rijen) + ';\n');
console.log(rijen.length + ' intro\'s geschreven.');
