/* Welke productteksten hebben nog geen Engelse en Arabische vertaling?
   node tools/vertalingen_ontbrekend.js
   Na een nieuwe export van de sheet (tools/parse_catalog.py) of nieuwe
   producten in het dashboard toont dit welke teksten opnieuw vertaald
   moeten worden in api/_vertalingen.json (formaat per naam:
   { nl:{i,s[]}, en:{i,s[]}, ar:{i,s[]} }). Draai daarna
   node tools/vertalingen_bouw.js om js/i18n-producten.js te verversen. */
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'js/catalog.js'), 'utf8');
const cat = JSON.parse(src.slice(src.indexOf('['), src.lastIndexOf(']') + 1));
const T = require(path.join(R, 'api/_teksten.json'));
const V = require(path.join(R, 'api/_vertalingen.json'));
let mist = 0;
cat.forEach(p => {
  const v = V[p.n];
  const s = T[p.n] || [];
  const ok = v && v.nl.i === (p.i || '') && s.length === v.nl.s.length && s.every((t, j) => t === v.nl.s[j]);
  if (!ok) { mist++; console.log('- ' + p.n); }
});
console.log(mist ? `${mist} van ${cat.length} producten missen (deels) een vertaling.` : `Alle ${cat.length} producten zijn vertaald.`);
