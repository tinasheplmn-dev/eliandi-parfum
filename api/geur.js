/* GET /geur/<slug> -> deze functie (rewrite in vercel.json en server.js).

   Eén productpagina per parfum, op de server opgebouwd uit de
   catalogus (js/catalog.js), de verhaaltekst (api/_teksten.json) en
   wat Angelo in het dashboard aanpast. Zoekmachines zien daardoor
   gewoon een volledige pagina.

   Foto's: api/_fotos.json koppelt doelgroep en maat aan een bestand,
   bijvoorbeeld { "dames": { "30": "assets/producten/dames-30.jpg" } }.
   Staat er niets, dan tekent de pagina een flacon in de kleur van de
   sterkste geurfamilie. */
const fs = require('fs');
const path = require('path');
const { getCustom, getOverrides, oliePrijs } = require('./_catalog');
const { getBedrijf } = require('./_factuur');
const { store } = require('./_lib');

const TEKSTEN = require('./_teksten.json');
/* Engelse en Arabische versie van intro en verhaal (gegenereerd, zie README).
   Een vertaling telt alleen zolang de Nederlandse tekst nog gelijk is. */
let VERTALINGEN = {};
try { VERTALINGEN = require('./_vertalingen.json'); } catch (e) { /* nog geen vertalingen */ }
const FOTOS = require('./_fotos.json');
const ML = [30, 50, 100];

/* ── vertalen op de server: dezelfde woordenlijst en regels als js/taal.js ── */
let TAAL = null;
function taalKern() {
  if (TAAL) return TAAL;
  const vm = require('vm');
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n-data.js'), 'utf8'), ctx);
  const w = ctx.window, norm = t => String(t).replace(/\s+/g, ' ').trim();
  const W = {};
  String(w.ELIANDI_NOTEN || '').trim().split('\n').forEach(r => { const d = r.split('|'); if (d.length === 3) W[d[0].trim().toLowerCase()] = [d[1].trim(), d[2].trim()]; });
  TAAL = {};
  ['en', 'ar'].forEach((lang, i) => {
    const D = {};
    (w.ELIANDI_I18N || []).forEach(r => { if (r[i + 1] != null) D[norm(r[0])] = r[i + 1]; });
    TAAL[lang] = { D, tr: w.ELIANDI_I18N_KERN(lang, D, W).tr, norm };
  });
  return TAAL;
}
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&middot;': '·', '&nbsp;': '\u00a0', '&times;': '×' };
const ontsnap = t => t.replace(/&(amp|lt|gt|quot|#39|middot|nbsp|times);/g, m => ENT[m]);
/* vertaal alle zichtbare tekst en de toegankelijke attributen van een pagina */
function vertaalHtml(html, lang, paren) {
  const k = taalKern()[lang];
  const extra = {}; (paren || []).forEach(r => { extra[k.norm(r[0])] = r[lang === 'en' ? 1 : 2]; });
  const t = tekst => { const n = k.norm(tekst); if (!n) return null; if (extra[n]) return extra[n]; return k.tr(n); };
  const vervang = tekst => {
    const echt = ontsnap(tekst); const v = t(echt);
    if (v == null) return tekst;
    return echt.match(/^\s*/)[0] + esc(v) + echt.match(/\s*$/)[0];
  };
  return html.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>)/).map(deel => {
    if (!deel) return deel;
    if (deel[0] !== '<') return /[A-Za-zÀ-ÿ]/.test(deel) ? vervang(deel) : deel;
    if (/^<(script|style)/i.test(deel)) return deel;
    return deel.replace(/\b(alt|title|aria-label|placeholder)="([^"]*)"/g, (m, a, v) => { const x = t(ontsnap(v)); return x == null ? m : `${a}="${esc(x)}"`; })
      .replace(/(<meta (?:name="description"|property="og:(?:title|description)") content=")([^"]*)(")/, (m, a, v, z) => { const x = t(ontsnap(v)); return x == null ? m : a + esc(x) + z; });
  }).join('');
}

/* de catalogus is een browserbestand; we lezen de JSON eruit */
let CATALOG = null;
function catalog() {
  if (CATALOG) return CATALOG;
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'catalog.js'), 'utf8');
  CATALOG = JSON.parse(src.slice(src.indexOf('['), src.lastIndexOf(']') + 1));
  return CATALOG;
}

const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const euro = n => '€' + Number(n).toFixed(2).replace('.', ',');

const TINT = {
  oud: '#5a2d14', hout: '#6b4a24', amber: '#b8740f', vanille: '#c9a24f', gourmand: '#8a4b1f',
  bloemig: '#9b4a6a', fris: '#2f6f6a', kruidig: '#a0471f', musk: '#8c8273', fruitig: '#a4303f',
  poederig: '#a58aa4', leer: '#3d2a22',
};
const FAM_MAP = [
  [/oud|agar/i, 'oud'], [/hout/i, 'hout'], [/amber|ori[eë]ntaal|oosters|balsem/i, 'amber'],
  [/bloem|floral/i, 'bloemig'], [/vanille/i, 'vanille'], [/gourmand|zoet|romig|karamel|chocola|koffie/i, 'gourmand'],
  [/citrus|fris|aquat|groen|aromat|marine|ozon/i, 'fris'], [/kruid|specerij/i, 'kruidig'], [/fruit/i, 'fruitig'],
  [/musk/i, 'musk'], [/poeder/i, 'poederig'], [/leer|leder|roker|rook|tabak/i, 'leer'],
];
const FAM_NAAM = {
  oud: 'Oud', hout: 'Hout', amber: 'Amber', vanille: 'Vanille', gourmand: 'Gourmand', bloemig: 'Bloemig',
  fris: 'Citrus & fris', kruidig: 'Kruidig', musk: 'Musk', fruitig: 'Fruitig', poederig: 'Poederig', leer: 'Leer & rook',
};

/* ── afgeleide eigenschappen: karakter, seizoen, moment ── */
function karakter(p) {
  const d = p.d || {};
  const zwaar = ['oud', 'amber', 'leer', 'musk'].some(k => (d[k] || 0) >= 2) || (p.x || 0) >= 2;
  const licht = (p.w || 0) <= -2 && (p.x || 0) <= -1;
  const clamp = n => Math.max(1, Math.min(5, Math.round(n)));
  return {
    intensiteit: clamp(3 + (p.x || 0) * 0.6),
    houdbaarheid: zwaar ? 5 : licht ? 3 : 4,
    zoetheid: clamp(1 + (p.s || 0)),
    warmte: clamp(1 + ((p.w || 0) + 3) * (4 / 6)),
  };
}
const seizoen = p => (p.w || 0) >= 2 ? 'Herfst en winter' : (p.w || 0) <= -2 ? 'Lente en zomer' : 'Het hele jaar';
const moment = p => (p.o || 0) >= 1 ? 'Avond en uitgaan' : (p.o || 0) <= -1 ? 'Overdag' : 'Dag en avond';
const doelgroep = p => ({ dames: 'Dames', heren: 'Heren' }[p.g] || 'Unisex');

function families(p) {
  const uit = [];
  (p.f || []).forEach(n => FAM_MAP.forEach(([re, k]) => { if (re.test(n) && !uit.includes(k)) uit.push(k); }));
  if (uit.length) return uit;
  return Object.entries(p.d || {}).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 3);
}

function bottle(tint, cls = '') {
  return `<svg class="pd-bottle ${cls}" viewBox="0 0 78 150" aria-hidden="true">
    <defs><linearGradient id="g${cls || 'x'}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient></defs>
    <rect x="29" y="4" width="20" height="16" rx="2" fill="#D4A73C"/>
    <rect x="27" y="19" width="24" height="7" rx="1" fill="#2a2a2a"/>
    <path d="M22 30 h34 l8 12 v98 a8 8 0 0 1 -8 8 h-34 a8 8 0 0 1 -8 -8 v-98 z" fill="${tint}"/>
    <path d="M22 30 h34 l8 12 v98 a8 8 0 0 1 -8 8 h-34 a8 8 0 0 1 -8 -8 v-98 z" fill="url(#g${cls || 'x'})"/>
    <rect x="20" y="66" width="38" height="46" fill="rgba(20,20,20,.55)" stroke="rgba(233,199,103,.55)" stroke-width=".8"/>
    <text x="39" y="86" text-anchor="middle" font-family="Playfair Display, serif" font-size="9" letter-spacing="2" fill="#E9C767">ELIANDI</text>
    <text x="39" y="98" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="5" letter-spacing="2" fill="#CFC9BC">PARFUM</text>
    <rect x="18" y="36" width="5" height="100" rx="2" fill="#fff" opacity=".12"/>
  </svg>`;
}

const dots = n => Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');

/* vier geuren die het dichtst in de buurt komen, als suggestie */
function verwant(p, alle) {
  const score = q => {
    if (q.n === p.n) return -1;
    let s = 0;
    Object.keys(p.d || {}).forEach(k => { if (q.d && q.d[k]) s += Math.min(p.d[k], q.d[k]); });
    if (q.g === p.g) s += 2;
    s -= Math.abs((q.w || 0) - (p.w || 0)) * .5 + Math.abs((q.s || 0) - (p.s || 0)) * .5;
    return s;
  };
  return alle.map(q => [score(q), q]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 4).map(([, q]) => q);
}

async function lijst() {
  const [custom, overrides] = await Promise.all([getCustom(), getOverrides()]);
  const uit = catalog().filter(p => !(overrides[p.n] && overrides[p.n].hidden)).map(p => {
    const o = overrides[p.n];
    if (!o) return p;
    const v = o.v || p.v || [];
    const ps = v.filter(Boolean);
    return { ...p, v, stock: o.stock || null, tags: o.tags || '', p: ps.length ? Math.min(...ps) : p.p };
  });
  const namen = new Set(uit.map(p => p.n));
  (custom || []).forEach(p => { if (!namen.has(p.n)) uit.push({ ...p, custom: true }); });
  return uit;
}

/* maten: plek 0-2 extrait, 3-4 parfumolie */
const MATEN = [30, 50, 100, 6, 13];
const label = i => (i >= 3 ? `${MATEN[i]} ml olie` : `${MATEN[i]} ml`);

function pagina(p, alle, site, reviews, olie, lang) {
  lang = lang || 'nl';
  const fams = families(p);
  const tint = TINT[fams[0]] || '#8a6a2a';
  const k = karakter(p);
  const extrait = (p.v || []).slice(0, 3);
  const heeftExtrait = extrait.some(Boolean);
  /* parfumolie bij elke geur met een prijs, tegen de vaste prijs uit het dashboard */
  const prijzen = [...extrait, heeftExtrait ? olie[6] : 0, heeftExtrait ? olie[13] : 0];
  const op = i => Boolean(p.stock && p.stock[i] === 0);
  /* een uitverkochte maat telt als niet leverbaar */
  const v = prijzen.map((x, i) => (op(i) ? 0 : x));
  const beschikbaar = MATEN.map((ml, i) => ({ ml, i, prijs: v[i] })).filter(x => x.prijs);
  const gekozen = v[1] ? 1 : (beschikbaar[0] ? beschikbaar[0].i : -1);
  const alleOp = prijzen.some(Boolean) && !beschikbaar.length;
  const rv = reviews || [];
  const gem = rv.length ? rv.reduce((a, r) => a + Number(r.sterren || 5), 0) / rv.length : 0;
  const sterren = n => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));
  const fotoVan = i => (FOTOS[p.g] && FOTOS[p.g][i >= 3 ? 'olie' : String(MATEN[i])]) || '';
  const foto = ml => (FOTOS[p.g] && FOTOS[p.g][String(ml)]) || '';
  const story = (TEKSTEN[p.n] || []).filter(t => t !== p.i);
  const noten = [['Topnoten', 'De eerste indruk', p.t], ['Hartnoten', 'Het karakter', p.h], ['Basisnoten', 'Wat blijft hangen', p.b]].filter(([, , l]) => l && l.length);
  const basisUrl = `${site}/geur/${slug(p.n)}`;
  const url = lang === 'nl' ? basisUrl : `${basisUrl}?lang=${lang}`;
  const titel = `${p.n} | Extrait de parfum | Eliandi Parfum`;
  const vtI = VERTALINGEN[p.n];
  const introTaal = lang !== 'nl' && vtI && vtI.nl.i === p.i && vtI[lang] && vtI[lang].i ? vtI[lang].i : '';
  const omschrijving = (introTaal || p.i || `${p.n}, handgemaakt extrait de parfum van Eliandi in 's-Hertogenbosch.`).slice(0, 155);
  const verwanten = verwant(p, alle);
  /* vertaalparen [nl, en, ar] voor js/taal.js, alleen voor teksten die nog kloppen */
  const vt = VERTALINGEN[p.n];
  const paren = [];
  if (vt) {
    if (p.i && vt.nl.i === p.i) paren.push([p.i, vt.en.i, vt.ar.i]);
    (TEKSTEN[p.n] || []).forEach((t, j) => { if (vt.nl.s[j] === t) paren.push([t, vt.en.s[j], vt.ar.s[j]]); });
  }
  const vertaald = paren.length > 0;

  /* gestructureerde gegevens voor Google: prijs per maat, voorraad, verzending, reviews */
  const vt0 = VERTALINGEN[p.n];
  const ldOmschrijving = lang !== 'nl' && vt0 && vt0[lang] && vt0[lang].i && vt0.nl.i === p.i ? vt0[lang].i : omschrijving;
  const verzending = land => ({ '@type': 'OfferShippingDetails', shippingDestination: { '@type': 'DefinedRegion', addressCountry: land },
    shippingRate: { '@type': 'MonetaryAmount', value: '4.95', currency: 'EUR' },
    deliveryTime: { '@type': 'ShippingDeliveryTime', handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' }, transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 2, unitCode: 'DAY' } } });
  const fotoAbs = i => (fotoVan(i) ? `${site}/${fotoVan(i).replace(/\.webp$/, '.jpg')}` : `${site}/assets/parfumeur-mengt-geur-pipet.jpg`);
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.n, sku: slug(p.n), inLanguage: lang,
    description: ldOmschrijving, brand: { '@type': 'Brand', name: 'Eliandi Parfum' }, url,
    image: [...new Set([0, 1, 2].map(fotoAbs))],
    category: 'Parfum > Extrait de parfum',
    ...(prijzen.some(Boolean) ? { offers: MATEN.map((ml, i) => (prijzen[i] ? {
      '@type': 'Offer', name: label(i), sku: `${slug(p.n)}-${i >= 3 ? 'olie-' : ''}${ml}`, price: Number(prijzen[i]).toFixed(2), priceCurrency: 'EUR', url,
      availability: op(i) ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'Eliandi Parfum' }, shippingDetails: [verzending('NL'), verzending('BE')],
    } : null)).filter(Boolean) } : {}),
    ...(rv.length ? {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: gem.toFixed(1), reviewCount: rv.length, bestRating: 5, worstRating: 1 },
      review: rv.slice(0, 10).map(r => ({ '@type': 'Review', author: { '@type': 'Person', name: r.naam }, reviewBody: r.tekst, reviewRating: { '@type': 'Rating', ratingValue: Number(r.sterren || 5), bestRating: 5 } })),
    } : {}),
  };
  const kruimel = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Shop', item: `${site}/shop` },
    { '@type': 'ListItem', position: 2, name: doelgroep(p), item: `${site}/shop?f=g%3A${p.g}` },
    { '@type': 'ListItem', position: 3, name: p.n, item: basisUrl },
  ] };

  const html = `<!DOCTYPE html>
<html lang="${lang}"${lang === 'ar' ? ' dir="rtl"' : ''}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(titel)}</title>
  <meta name="description" content="${esc(omschrijving)}">
  ${p.tags ? `<meta name="keywords" content="${esc(p.tags)}">` : ''}
  <meta property="og:title" content="${esc(p.n)} | Eliandi Parfum">
  <meta property="og:description" content="${esc(omschrijving)}">
  <meta property="og:type" content="product">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${site}/${fotoVan(gekozen >= 0 ? gekozen : 1) ? esc(fotoVan(gekozen >= 0 ? gekozen : 1).replace(/\.webp$/, '.jpg')) : 'assets/parfumeur-mengt-geur-pipet.jpg'}">
  <meta name="theme-color" content="#141414">
  <link rel="canonical" href="${esc(url)}">
  <link rel="alternate" hreflang="nl" href="${esc(basisUrl)}">
  <link rel="alternate" hreflang="en" href="${esc(basisUrl)}?lang=en">
  <link rel="alternate" hreflang="ar" href="${esc(basisUrl)}?lang=ar">
  <link rel="alternate" hreflang="x-default" href="${esc(basisUrl)}">
  <meta property="og:locale" content="${{ nl: 'nl_NL', en: 'en_GB', ar: 'ar_AR' }[lang]}">
  <link rel="icon" type="image/png" href="/assets/favicon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Montserrat:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/cart.css">
  <link rel="stylesheet" href="/css/shop.css">
  <link rel="stylesheet" href="/css/product.css">
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
  <script type="application/ld+json">${JSON.stringify(kruimel).replace(/</g, '\\u003c')}</script>
  ${vertaald ? `<script type="application/json" id="i18nExtra">${JSON.stringify(paren).replace(/</g, '\\u003c')}</script>` : ''}
  <script src="/js/taal.js"></script>
  <script src="/js/meet.js" defer></script>
</head>
<body class="shoppage productpage" data-page="geur">
  <header class="qnav sh-nav">
    <a class="qnav-brand" href="/"><img class="qnav-mark" src="/assets/logo-eliandi.png" alt="Eliandi Parfum logo"><span class="qnav-wordmark">Eliandi<br><em>Parfum</em></span></a>
    <nav class="sh-nav-links" aria-label="Shop"><a href="/shop">Shop</a><a href="/quiz">Geurwijzer</a><a href="/experience">Experience</a></nav>
    <a class="qnav-exit" href="/shop">Terug naar de shop</a>
  </header>

  <main class="pd-main" id="top">
    <nav class="wrap pd-crumbs" aria-label="Je bent hier">
      <a href="/shop">Shop</a><span>/</span><a href="/shop?f=g%3A${p.g}">${esc(doelgroep(p))}</a><span>/</span><b>${esc(p.n)}</b>
    </nav>

    <section class="wrap pd-top">
      <div class="pd-gallery" style="--tint:${tint}">
        <div class="pd-stage" id="pdStage">
          ${gekozen >= 0 && fotoVan(gekozen) ? `<img src="/${esc(fotoVan(gekozen))}" alt="${esc(p.n)}, ${label(gekozen)}">` : bottle(tint, 'groot')}
          <span class="pd-stage-ml" id="pdStageMl">${gekozen >= 0 ? label(gekozen) : ''}</span>
        </div>
        <div class="pd-thumbs${heeftExtrait ? ' has-olie' : ''}" role="list">
          ${MATEN.map((ml, i) => (i >= 3 && !heeftExtrait) || (i === 4) ? '' : `<button type="button" class="pd-thumb${i === gekozen || (i === 3 && gekozen === 4) ? ' is-on' : ''}" data-k="${i}" ${v[i] || (i === 3 && v[4]) ? '' : 'disabled'} role="listitem" aria-label="${i >= 3 ? 'Parfumolie' : ml + ' ml'}">
            ${fotoVan(i) ? `<img src="/${esc(fotoVan(i).replace(/\.webp$/, '-600.webp'))}" alt="" loading="lazy">` : bottle(tint, 'klein' + i)}<span>${i >= 3 ? 'Olie' : ml + ' ml'}</span></button>`).join('')}
        </div>
        <p class="pd-gallery-note">Elke flacon wordt in de winkel gevuld en met de hand afgewerkt. De verpakking verschilt per geur.</p>
      </div>

      <div class="pd-info">
        <p class="kicker">${esc(doelgroep(p))} &middot; Extrait de parfum</p>
        <h1 class="pd-h1">${esc(p.n)}</h1>
        ${fams.length ? `<div class="pd-fams">${fams.slice(0, 4).map(f => `<a href="/shop?f=f%3A${f}">${FAM_NAAM[f]}</a>`).join('')}</div>` : ''}
        ${rv.length ? `<a class="pd-stars-link" href="#reviews"><span class="pd-stars">${sterren(gem)}</span> ${rv.length} ${rv.length === 1 ? 'review' : 'reviews'}</a>` : ''}
        ${p.i ? `<p class="pd-lead">${esc(p.i)}</p>` : ''}

        ${beschikbaar.length ? `<div class="pd-buy" id="pdBuy" data-n="${esc(p.n)}">
          <p class="pd-label">Kies je maat</p>
          <div class="pd-sizes" role="radiogroup" aria-label="Maat">
            ${[0, 1, 2].map(i => `<button type="button" class="pd-size${i === gekozen ? ' is-on' : ''}" data-k="${i}" ${v[i] ? '' : 'disabled'} role="radio" aria-checked="${i === gekozen}"><b>${MATEN[i]} ml</b><span>${v[i] ? euro(v[i]) : op(i) ? 'uitverkocht' : 'niet leverbaar'}</span></button>`).join('')}
          </div>
          ${heeftExtrait && (prijzen[3] || prijzen[4]) ? `<p class="pd-label pd-label-olie">Of als parfumolie <small>dezelfde geur, geconcentreerd in olie</small></p>
          <div class="pd-sizes pd-sizes-olie" role="radiogroup" aria-label="Parfumolie">
            ${[3, 4].filter(i => prijzen[i]).map(i => `<button type="button" class="pd-size${i === gekozen ? ' is-on' : ''}" data-k="${i}" ${v[i] ? '' : 'disabled'} role="radio" aria-checked="${i === gekozen}"><b>${MATEN[i]} ml</b><span>${v[i] ? euro(v[i]) : 'uitverkocht'}</span></button>`).join('')}
          </div>` : ''}
          <div class="pd-price-row">
            <p class="pd-price" id="pdPrice">${gekozen >= 0 ? euro(v[gekozen]) : ''}</p>
            <button type="button" class="btn btn-gold pd-add" id="pdAdd">In winkelmand</button>
          </div>
          <ul class="pd-trust">
            <li>Veilig betalen met iDEAL, kaart, Apple Pay of PayPal</li>
            <li>Verzending in Nederland en België, of ophalen in de winkel</li>
            <li>Met de hand gevuld in 's-Hertogenbosch</li>
          </ul>
        </div>` : alleOp ? `<div class="pd-buy pd-ask"><p class="pd-label">Tijdelijk uitverkocht</p><p>Angelo maakt nieuwe flacons. <a href="https://wa.me/31687080256?text=${encodeURIComponent('Hoi Angelo, wanneer is ' + p.n + ' er weer?')}" target="_blank" rel="noopener">App hem</a> en je hoort het als eerste.</p></div>` : `<div class="pd-buy pd-ask"><p class="pd-label">Prijs op aanvraag</p><p>Deze geur bestel je via de winkel. <a href="https://wa.me/31687080256?text=${encodeURIComponent('Hoi Angelo, wat kost ' + p.n + '?')}" target="_blank" rel="noopener">App Angelo</a> of kom langs aan de Vughterstraat 70.</p></div>`}

        <div class="pd-garantie">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 L20 5.5 V11 c0 5.2 -3.4 9.3 -8 11 c-4.6 -1.7 -8 -5.8 -8 -11 V5.5 Z"/><path d="M8.2 12 l2.6 2.6 5 -5.2"/></svg>
          <div><b>100% tevredenheidsgarantie</b><p>Past de geur toch niet bij je? Kom langs in de winkel. Angelo neemt de tijd en zoekt of maakt samen met jou de geur die wél klopt.</p></div>
        </div>
      </div>
    </section>

    <section class="wrap pd-body">
      <div class="pd-story">
        <p class="kicker">Het verhaal van deze geur</p>
        ${vertaald ? '' : '<p class="pd-nl-hint" lang="en">Angelo wrote this description in Dutch.</p>'}
        ${story.length ? story.map(t => `<p>${esc(t)}</p>`).join('') : `<p>${esc(p.n)} is een extrait de parfum van Eliandi: hoog geconcentreerd, met de hand samengesteld in de winkel aan de Vughterstraat en gemaakt om de hele dag bij je te blijven.</p>`}
      </div>

      <aside class="pd-facts">
        <div class="pd-meters">
          <p class="kicker">Karakter</p>
          ${[['Intensiteit', k.intensiteit], ['Houdbaarheid', k.houdbaarheid], ['Zoetheid', k.zoetheid], ['Warmte', k.warmte]].map(([n, w]) => `<div class="pd-meter"><span>${n}</span><em class="pd-dots" aria-label="${w} van 5">${dots(w)}</em></div>`).join('')}
        </div>
        <dl class="pd-kern">
          <div><dt>Seizoen</dt><dd>${seizoen(p)}</dd></div>
          <div><dt>Moment</dt><dd>${moment(p)}</dd></div>
          <div><dt>Voor</dt><dd>${esc(doelgroep(p))}</dd></div>
          <div><dt>Concentratie</dt><dd>Extrait de parfum</dd></div>
          ${p.f && p.f.length ? `<div><dt>Geurfamilie</dt><dd>${esc(p.f.slice(0, 4).join(', '))}</dd></div>` : ''}
        </dl>
      </aside>
    </section>

    ${noten.length ? `<section class="wrap pd-piramide">
      <p class="kicker center">Geurpiramide</p>
      <h2 class="pd-h2 center">Zo ontvouwt ${esc(p.n)} zich.</h2>
      <div class="pd-pyr">
        ${noten.map(([kop, sub, l], i) => `<div class="pd-pyr-laag pd-pyr-${i}"><div class="pd-pyr-kop"><b>${kop}</b><span>${sub}</span></div><p>${esc(l.join(' · '))}</p></div>`).join('')}
      </div>
    </section>` : ''}

    <section class="wrap pd-reviews" id="reviews">
      <div class="pd-reviews-kop">
        <h2 class="pd-h2">Wat klanten zeggen.</h2>
        ${rv.length ? `<span class="pd-stars">${sterren(gem)}</span><small>${gem.toFixed(1).replace('.', ',')} van 5 &middot; ${rv.length} ${rv.length === 1 ? 'review' : 'reviews'}</small>` : ''}
      </div>
      ${rv.length ? `<div class="pd-review-grid">${rv.slice(0, 6).map(r => `<figure class="pd-review"><span class="pd-stars">${sterren(r.sterren || 5)}</span><p>“${esc(r.tekst)}”</p><b>${esc(r.naam)}</b></figure>`).join('')}</div>`
        : `<p class="pd-review-none">Nog geen reviews voor ${esc(p.n)}. Draag je hem al? <a href="https://wa.me/31687080256?text=${encodeURIComponent('Hoi Angelo, mijn ervaring met ' + p.n + ': ')}" target="_blank" rel="noopener">Laat Angelo weten wat je ervan vindt.</a></p>`}
    </section>

    ${verwanten.length ? `<section class="wrap pd-verwant">
      <p class="kicker">In dezelfde sfeer</p>
      <h2 class="pd-h2">Geuren die hierbij passen.</h2>
      <div class="pd-verwant-grid">
        ${verwanten.map(q => {
          const qf = families(q); const qt = TINT[qf[0]] || '#8a6a2a';
          const qf50 = FOTOS[q.g] && (FOTOS[q.g]['50'] || FOTOS[q.g]['30']);
          return `<a class="pd-vcard${qf50 ? ' has-foto' : ''}" href="/geur/${slug(q.n)}" style="--tint:${qt}">${qf50 ? `<img src="/${esc(qf50.replace(/\.webp$/, '-600.webp'))}" alt="${esc(q.n)}" loading="lazy" decoding="async">` : bottle(qt, 'v' + slug(q.n).slice(0, 6))}<span><b>${esc(q.n)}</b><small>${qf.slice(0, 2).map(f => FAM_NAAM[f]).join(' · ')}${q.p ? ' · vanaf ' + euro(q.p) : ''}</small></span></a>`;
        }).join('')}
      </div>
    </section>` : ''}

    <section class="wrap pd-recent" id="pdRecent" hidden></section>

    <section class="sh-foot">
      <div class="wrap sh-foot-grid">
        <div>
          <p class="kicker">Liever eerst ruiken?</p>
          <h2 class="sh-h2">Kom langs aan de Vughterstraat.</h2>
          <p>Angelo zet ${esc(p.n)} graag voor je klaar, naast een paar geuren die erbij passen. Vughterstraat 70, 's-Hertogenbosch.</p>
          <a class="btn btn-gold" href="/#bezoek">Kom langs in de winkel</a>
        </div>
        <div>
          <p class="kicker">Of iets dat nog niet bestaat</p>
          <h2 class="sh-h2">Jouw eigen extrait, met Angelo.</h2>
          <p>Privé aan de geurtafel, alleen of met je gezelschap. Je loopt naar buiten met 50 ml die er voor niemand anders is.</p>
          <a class="btn btn-ghost" href="/experience">Ontdek The Eliandi Experience</a>
        </div>
      </div>
    </section>
  </main>

  <footer class="sh-footer">
    <p>Eliandi Parfum &middot; Vughterstraat 70, 5211 GK 's-Hertogenbosch &middot; <a href="tel:+31687080256">06 870 802 56</a> &middot; <a href="mailto:info@eliandiparfum.com">info@eliandiparfum.com</a> &middot; <a href="/privacy">Privacy</a></p>
  </footer>

  <a class="wa-widget" href="https://wa.me/31687080256?text=${encodeURIComponent('Hoi Angelo, ik heb een vraag over ' + p.n)}" target="_blank" rel="noopener" aria-label="Stuur Angelo een WhatsApp-bericht">
    <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3C9 3 3.3 8.6 3.3 15.5c0 2.4.7 4.7 2 6.7L3.5 29l7-1.8a12.9 12.9 0 0 0 5.5 1.2c7 0 12.7-5.6 12.7-12.5S23 3 16 3zm0 22.8c-1.8 0-3.6-.5-5.1-1.4l-.4-.2-4.2 1.1 1.1-4-.2-.4a10.1 10.1 0 0 1-1.6-5.4C5.6 9.9 10.3 5.3 16 5.3s10.4 4.6 10.4 10.2S21.7 25.8 16 25.8zm5.7-7.6c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1a8.4 8.4 0 0 1-4.2-3.6c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.3c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1.1 1-1.1 2.5s1.1 2.9 1.3 3.1c.2.2 2.2 3.4 5.4 4.7 2 .9 2.8 1 3.8.8.6-.1 1.8-.7 2.1-1.5.3-.7.3-1.3.2-1.5-.1-.1-.3-.2-.6-.4z"/></svg>
  </a>

  <script>window.PRODUCT = ${JSON.stringify({ n: p.n, g: p.g, v: v, slug: slug(p.n), fotos: MATEN.map((ml, i) => fotoVan(i)) }).replace(/</g, '\\u003c')};</script>
  <script src="/js/cart.js"></script>
  <script src="/js/product.js"></script>
  <script src="/js/zonder-server.js" defer></script>
</body>
</html>`;
  return lang === 'nl' ? html : vertaalHtml(html, lang, paren);
}

/* ── sitemap met alle geuren in drie talen ── */
function sitemap(alle, site) {
  const vast = ['/', '/shop', '/experience', '/quiz', '/privacy'];
  const alt = loc => ['nl', 'en', 'ar'].map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(loc + (l === 'nl' ? '' : (loc.includes('?') ? '&' : '?') + 'lang=' + l))}"/>`).join('')
    + `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(loc)}"/>`;
  const urls = vast.map(pad => `<url><loc>${esc(site + pad)}</loc><changefreq>weekly</changefreq><priority>${pad === '/' ? '1.0' : '0.8'}</priority></url>`)
    .concat(alle.map(p => { const loc = `${site}/geur/${slug(p.n)}`; return ['nl', 'en', 'ar'].map(l => `<url><loc>${esc(l === 'nl' ? loc : loc + '?lang=' + l)}</loc>${alt(loc)}<changefreq>monthly</changefreq><priority>0.7</priority></url>`).join(''); }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}

/* ── productfeed voor Google Merchant Center (gratis vermeldingen in Google Shopping) ── */
function feed(alle, site, olie) {
  const GESLACHT = { dames: 'female', heren: 'male', unisex: 'unisex' };
  const items = [];
  alle.forEach(p => {
    const v = (p.v || []).slice(0, 3);
    if (!v.some(Boolean)) return;
    const prijzen = [...v, olie[6], olie[13]];
    const foto = i => { const f = FOTOS[p.g] && FOTOS[p.g][i >= 3 ? 'olie' : String(MATEN[i])]; return f ? `${site}/${f.replace(/\.webp$/, '.jpg')}` : `${site}/assets/parfumeur-mengt-geur-pipet.jpg`; };
    const tekst = (p.i || `${p.n}, handgemaakt extrait de parfum van Eliandi uit 's-Hertogenbosch.`).slice(0, 4900);
    MATEN.forEach((ml, i) => {
      if (!prijzen[i]) return;
      const op = p.stock && p.stock[i] === 0;
      items.push(`<item>
<g:id>${esc(slug(p.n) + '-' + (i >= 3 ? 'olie-' : '') + ml)}</g:id>
<g:item_group_id>${esc(slug(p.n))}</g:item_group_id>
<title>${esc(`${p.n} ${i >= 3 ? 'parfumolie' : 'extrait de parfum'} ${ml} ml`)}</title>
<description>${esc(tekst)}</description>
<link>${esc(`${site}/geur/${slug(p.n)}`)}</link>
<g:image_link>${esc(foto(i))}</g:image_link>
<g:price>${Number(prijzen[i]).toFixed(2)} EUR</g:price>
<g:availability>${op ? 'out_of_stock' : 'in_stock'}</g:availability>
<g:condition>new</g:condition>
<g:brand>Eliandi Parfum</g:brand>
<g:identifier_exists>no</g:identifier_exists>
<g:google_product_category>479</g:google_product_category>
<g:product_type>${esc(i >= 3 ? 'Parfumolie' : 'Extrait de parfum')} &gt; ${esc(doelgroep(p))}</g:product_type>
<g:gender>${GESLACHT[p.g] || 'unisex'}</g:gender>
<g:age_group>adult</g:age_group>
<g:size>${ml} ml</g:size>
<g:shipping><g:country>NL</g:country><g:price>4.95 EUR</g:price></g:shipping>
<g:shipping><g:country>BE</g:country><g:price>4.95 EUR</g:price></g:shipping>
</item>`);
    });
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>\n<title>Eliandi Parfum</title><link>${esc(site)}</link><description>Handgemaakte extrait de parfum uit 's-Hertogenbosch</description>\n${items.join('\n')}\n</channel></rss>\n`;
}

module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const wanted = (u.searchParams.get('slug') || '').toLowerCase();
  const lang = ['en', 'ar'].includes(u.searchParams.get('lang')) ? u.searchParams.get('lang') : 'nl';
  const site = (process.env.SITE_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host || 'eliandi-parfum.vercel.app'}`).replace(/\/$/, '')
    .replace(/^https:\/\/(localhost|127\.0\.0\.1)/, 'http://$1');
  if (u.searchParams.get('robots')) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.end(`User-agent: *\nAllow: /\nDisallow: /bedankt\nDisallow: /afrekenen\nDisallow: /beheer\nDisallow: /cadeaubon\nDisallow: /api/\n\nSitemap: ${site}/sitemap.xml\n`);
  }
  if (u.searchParams.get('sitemap') || u.searchParams.get('feed')) {
    try {
      const [alle, bedrijf] = await Promise.all([lijst(), getBedrijf()]);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
      return res.end(u.searchParams.get('feed') ? feed(alle, site, { 6: oliePrijs(bedrijf, 6) / 100, 13: oliePrijs(bedrijf, 13) / 100 }) : sitemap(alle, site));
    } catch (e) { console.error('sitemap', e.message); res.statusCode = 500; return res.end(''); }
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    const [alle, reviews, bedrijf] = await Promise.all([lijst(), store.getJson('cms:reviews', {}).catch(() => ({})), getBedrijf()]);
    const olie = { 6: oliePrijs(bedrijf, 6) / 100, 13: oliePrijs(bedrijf, 13) / 100 };
    const p = alle.find(q => slug(q.n) === wanted);
    if (!p) {
      res.statusCode = 404;
      res.setHeader('Cache-Control', 'no-store');
      res.end(`<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Geur niet gevonden | Eliandi Parfum</title><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/shop.css"><link rel="stylesheet" href="/css/product.css"></head><body class="shoppage"><main class="pd-404"><p class="kicker">Niet gevonden</p><h1 class="pd-h1">Deze geur kennen we niet.</h1><p>Misschien is hij van naam veranderd, of staat hij niet meer in de collectie.</p><a class="btn btn-gold" href="/shop">Naar alle geuren</a></main></body></html>`);
      return;
    }
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
    res.setHeader('Content-Language', lang);
    res.end(pagina(p, alle, site, (reviews || {})[p.n], olie, lang));
  } catch (e) {
    console.error('geur', e.message);
    res.statusCode = 500;
    res.end('Serverfout');
  }
};

module.exports.slug = slug;
