/* ═══════════════════════════════════════════════════════════════
   Producten die Angelo zelf beheert, bovenop de vaste catalogus.

   cms:products           [{ id, n, g, f[], t[], h[], b[], i, v[3], img }]
   cms:product-overrides  { "<naam>": { v?: [p30,p50,p100], hidden?: true } }

   Zelf toegevoegde parfums krijgen dezelfde geurdimensies als de
   catalogus (zelfde trefwoorden als tools/parse_catalog.py), zodat de
   geurwijzer ze meteen kan aanraden.
   ═══════════════════════════════════════════════════════════════ */
const { store } = require('./_lib');
const BASE_PRICES = require('./_prices.json');

const DIMS = {
  oud: [/\boud\b/, /oudhout/, /agarwood/, /akigalawood/],
  hout: [/hout/, /ceder/, /sandelhout/, /vetiver/, /patchouli/, /guaiac/],
  vanille: [/vanille/, /tonkaboon/, /benzo[eë]/],
  gourmand: [/gourmand/, /karamel/, /honing/, /praline/, /chocolade/, /koffie/, /amandel/, /pistache/, /kokos/, /suiker/, /marshmallow/, /r[iu]m\b/],
  bloemig: [/bloemig/, /floral/, /roos/, /rozen/, /jasmijn/, /tuberoos/, /iris/, /viooltje/, /oranjebloesem/, /pioen/, /lelie/, /lavendel/, /neroli/, /ylang/, /magnolia/, /freesia/, /gardenia/],
  fris: [/\bfris/, /citrus/, /bergamot/, /citroen/, /limoen/, /grapefruit/, /mandarijn/, /aquatisch/, /marine/, /zee/, /ozon/, /munt/, /groene?\b/, /appel\b/, /komkommer/],
  kruidig: [/kruidig/, /kaneel/, /kardemom/, /peper/, /saffraan/, /gember/, /nootmuskaat/, /kruidnagel/, /wierook/, /olibanum/],
  musk: [/musk/, /muskus/],
  fruitig: [/fruitig/, /framboos/, /aardbei/, /kers/, /perzik/, /ananas/, /bes\b/, /bessen/, /pruim/, /peer\b/, /lychee/, /abrikoos/, /granaatappel/, /passievrucht/],
  amber: [/amber/, /ori[eë]ntaals/, /labdanum/, /balsem/, /hars/],
  poederig: [/poeder/, /talk\b/, /pudder/],
  leer: [/leer\b/, /leder/, /rokerig/, /rook\b/, /teer\b/, /berkenteer/, /tabak/],
};
const WARM = [/warm/, /winter/, /avond/, /sensueel/, /verslavend/, /koude lucht/, /cozy/];
const FRESH = [/zomer/, /fris/, /licht/, /dag\b/, /lente/, /energiek/, /sprankelend/];
const STRONG = [/intens/, /sterk/, /domineert/, /krachtig/, /extrait/, /statement/, /sillage/, /projectie/];
const SOFT = [/subtiel/, /zacht/, /huidgeur/, /delicaat/, /fluweel/];
const NIGHT = [/avond/, /nacht/, /gelegenhe/, /gala/, /feest/];
const DAY = [/dagelijks/, /werk\b/, /kantoor/, /elke dag/, /allemansvriend/];

const hits = (text, pats) => pats.reduce((n, p) => n + (text.match(new RegExp(p.source, 'g')) || []).length, 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const list = v => (Array.isArray(v) ? v : String(v || '').split(',')).map(s => String(s).trim()).filter(Boolean).slice(0, 8);
const money = v => { const n = parseFloat(String(v).replace(',', '.')); return n > 0 ? Math.round(n * 100) / 100 : null; };

function analyze(input) {
  const p = {
    id: input.id, n: String(input.n || '').trim().slice(0, 80),
    g: ['dames', 'heren', 'unisex'].includes(input.g) ? input.g : 'unisex',
    f: list(input.f), t: list(input.t), h: list(input.h), b: list(input.b),
    i: String(input.i || '').trim().slice(0, 400),
    v: [money(input.v && input.v[0]), money(input.v && input.v[1]), money(input.v && input.v[2])],
    img: input.img || '', custom: true,
    tags: String(input.tags || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300),
  };
  const text = [p.i, ...p.f, ...p.t, ...p.h, ...p.b].join(' ').toLowerCase();
  const d = {};
  Object.entries(DIMS).forEach(([k, pats]) => { const h = hits(text, pats); if (h) d[k] = Math.min(3, h); });
  p.d = d;
  p.w = clamp(hits(text, WARM) - hits(text, FRESH), -3, 3);
  p.s = Math.min(4, (d.vanille || 0) + (d.gourmand || 0));
  p.x = clamp(hits(text, STRONG) - hits(text, SOFT) + (d.oud ? 1 : 0) + (d.amber ? 1 : 0), -2, 4);
  p.o = clamp(hits(text, NIGHT) - hits(text, DAY), -2, 3);
  const prices = p.v.filter(Boolean);
  p.p = prices.length ? Math.min(...prices) : null;
  return p;
}

const getCustom = () => store.getJson('cms:products', []);
const getOverrides = () => store.getJson('cms:product-overrides', {});

/* Prijstabel waarmee afgerekend wordt: catalogus + aanpassingen + eigen producten. */
async function priceTable() {
  const [custom, overrides] = await Promise.all([getCustom(), getOverrides()]);
  const table = {};
  Object.entries(BASE_PRICES).forEach(([n, v]) => {
    const o = overrides[n] || {};
    if (!o.hidden) table[n] = o.v || v;
  });
  custom.forEach(p => { if (p.v.some(Boolean)) table[p.n] = p.v; });
  return table;
}

/* Maten: 30/50/100 ml extrait op plek 0-2, parfumolie 6/13 ml op plek 3-4
   (ook in de voorraad-array per product). */
const SIZES = { 30: 0, 50: 1, 100: 2 };
const OLIE = { 6: 3, 13: 4 };
const oliePrijs = (bedrijf, ml) => (bedrijf && bedrijf.olie !== false ? Number(bedrijf[ml === 6 ? 'olie6' : 'olie13']) || 0 : 0);

module.exports = { analyze, getCustom, getOverrides, priceTable, BASE_PRICES, SIZES, OLIE, oliePrijs };
