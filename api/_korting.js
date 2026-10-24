/* ═══════════════════════════════════════════════════════════════
   ELIANDI — kortingscodes

   Opgeslagen als 'cms:kortingen': [{ code, soort: 'pct'|'bedrag',
   waarde, min (centen, optioneel), tot (jjjj-mm-dd, optioneel),
   max (aantal keer, optioneel), gebruikt, actief }]
   Angelo beheert ze in het dashboard. Het rekenwerk gebeurt alleen op
   de server; de winkelmand laat de korting zien, de server bepaalt hem.
   ═══════════════════════════════════════════════════════════════ */
const { store } = require('./_lib');

const getCodes = () => store.getJson('cms:kortingen', []);
const saveCodes = codes => store.setJson('cms:kortingen', codes);

/* Geeft { cents, code, label } of { fout } terug. */
async function bereken(code, subtotaalCents) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  const k = (await getCodes()).find(x => x.code === c);
  if (!k || k.actief === false) return { fout: 'Deze kortingscode kennen we niet.' };
  if (k.tot && new Date(k.tot + 'T23:59:59') < new Date()) return { fout: 'Deze kortingscode is verlopen.' };
  if (k.max && (k.gebruikt || 0) >= k.max) return { fout: 'Deze kortingscode is al opgebruikt.' };
  if (k.min && subtotaalCents < k.min) return { fout: `Deze code geldt vanaf ${euro(k.min)}.` };
  const cents = k.soort === 'pct'
    ? Math.round(subtotaalCents * Math.min(100, Number(k.waarde)) / 100)
    : Math.min(subtotaalCents, Math.round(Number(k.waarde)));
  const label = k.soort === 'pct' ? `${Number(k.waarde)}% korting` : `${euro(cents)} korting`;
  return { cents, code: c, label };
}

/* Bij betaling: één keer afboeken. */
async function gebruikt(code) {
  const codes = await getCodes();
  const k = codes.find(x => x.code === String(code).toUpperCase());
  if (!k) return;
  k.gebruikt = (k.gebruikt || 0) + 1;
  await saveCodes(codes);
}

const euro = c => '€' + (c / 100).toFixed(2).replace('.', ',');

module.exports = { getCodes, saveCodes, bereken, gebruikt };
