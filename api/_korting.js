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

/* ── Flacontegoed: wie een Discovery Set (of doos van De Geurreis) koopt,
   krijgt per doos €10 tegoed op een flacon, 30 dagen geldig, als
   persoonlijke code in de bevestigingsmail. Eén keer te gebruiken: online
   bij het afrekenen, of in de winkel (Angelo boekt hem af in het dashboard).
   Opslag: 'tegoed:<CODE>' + set 'idx:tegoed'. ── */
const TEGOED_CENTS = 1000;
const TEGOED_DAGEN = 30;
const isSetRegel = i => i.kind === 'discovery' || /^(Discovery Set|De Geurreis)/.test(String(i.name || ''));
const getTegoed = code => store.getJson('tegoed:' + String(code || '').trim().toUpperCase());

async function maakTegoed(o) {
  const dozen = (o.items || []).filter(isSetRegel).reduce((t, i) => t + (Number(i.qty) || 1), 0);
  if (!dozen) return null;
  const tekens = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = require('crypto').randomBytes(6);
  const code = 'FLACON-' + Array.from(bytes, b => tekens[b % tekens.length]).join('');
  const t = {
    code, cents: TEGOED_CENTS * dozen, tot: Date.now() + TEGOED_DAGEN * 86400000,
    orderId: o.id, naam: o.name, email: String(o.email || '').toLowerCase(), created: Date.now(), gebruikt: null,
  };
  await store.setJson('tegoed:' + code, t);
  await store.sadd('idx:tegoed', code);
  return t;
}

/* Geeft { cents, code, label } of { fout } terug. metFlacon: false als er
   geen flacon (30/50/100 ml) in de bestelling zit; onbekend = niet controleren. */
async function bereken(code, subtotaalCents, metFlacon) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  const k = (await getCodes()).find(x => x.code === c);
  if (!k) {
    const t = await getTegoed(c);
    if (!t) return { fout: 'Deze kortingscode kennen we niet.' };
    if (t.gebruikt) return { fout: 'Dit flacontegoed is al gebruikt.' };
    if (t.tot < Date.now()) return { fout: 'Dit flacontegoed is verlopen.' };
    if (metFlacon === false) return { fout: 'Je flacontegoed geldt bij een flacon van 30, 50 of 100 ml. Voeg er een toe aan je winkelmand.' };
    const cents = Math.min(subtotaalCents, t.cents);
    return { cents, code: c, label: `${euro(cents)} flacontegoed` };
  }
  if (k.actief === false) return { fout: 'Deze kortingscode kennen we niet.' };
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
async function gebruikt(code, waar = 'online', orderId = '') {
  const t = await getTegoed(code);
  if (t) {
    if (!t.gebruikt) { t.gebruikt = { t: Date.now(), waar, orderId }; await store.setJson('tegoed:' + t.code, t); }
    return;
  }
  const codes = await getCodes();
  const k = codes.find(x => x.code === String(code).toUpperCase());
  if (!k) return;
  k.gebruikt = (k.gebruikt || 0) + 1;
  await saveCodes(codes);
}

const euro = c => '€' + (c / 100).toFixed(2).replace('.', ',');

module.exports = { getCodes, saveCodes, bereken, gebruikt, maakTegoed, getTegoed, TEGOED_DAGEN };
