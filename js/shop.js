/* ═══════════════════════════════════════════════════════════════
   ELIANDI — de shop

   Werkt op ELIANDI_CATALOG (js/catalog.js, gegenereerd uit de sheet
   van Angelo) plus wat hij in het dashboard aanpast (/api/products).
   De prijs in de winkelmand is weergave; de server rekent opnieuw.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  /* plek 0-2: extrait 30/50/100 ml, plek 3-4: parfumolie 6/13 ml */
  const ML = [30, 50, 100, 6, 13];
  const PER_PAGE = 24;
  const euro = n => '€' + Number(n).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const strip = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const slugify = s => strip(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  /* kleur van het flesje: de sterkste geurfamilie bepaalt de tint */
  const TINT = {
    oud: '#5a2d14', hout: '#6b4a24', amber: '#b8740f', vanille: '#c9a24f', gourmand: '#8a4b1f',
    bloemig: '#9b4a6a', fris: '#2f6f6a', kruidig: '#a0471f', musk: '#8c8273', fruitig: '#a4303f',
    poederig: '#a58aa4', leer: '#3d2a22',
  };
  const FAMILIE_NAAM = {
    oud: 'Oud', hout: 'Hout', amber: 'Amber', vanille: 'Vanille', gourmand: 'Gourmand', bloemig: 'Bloemig',
    fris: 'Citrus & fris', kruidig: 'Kruidig', musk: 'Musk', fruitig: 'Fruitig', poederig: 'Poederig', leer: 'Leer & rook',
  };
  const NIEUW = new Set(['marley & lina exclusif', 'dark honey extrait', 'sacred ember extrait', 'citrus skyline', 'amber inferno extrait', 'radiant sandal elixir', 'spices storm extrait', 'eliansi intense', 'radiant sandal elixir .w']);

  /* de geurfamilies zoals Angelo ze in de sheet noemt -> onze twaalf filters */
  const FAM_MAP = [
    [/oud|agar/i, 'oud'], [/hout/i, 'hout'], [/amber|ori[eë]ntaal|oosters|balsem/i, 'amber'],
    [/bloem|floral/i, 'bloemig'], [/vanille/i, 'vanille'], [/gourmand|zoet|romig|karamel|chocola|koffie/i, 'gourmand'],
    [/citrus|fris|aquat|groen|aromat|marine|ozon/i, 'fris'], [/kruid|specerij/i, 'kruidig'], [/fruit/i, 'fruitig'],
    [/musk/i, 'musk'], [/poeder/i, 'poederig'], [/leer|leder|roker|rook|tabak/i, 'leer'],
  ];
  const famKeys = namen => {
    const out = [];
    (namen || []).forEach(n => FAM_MAP.forEach(([re, k]) => { if (re.test(n) && !out.includes(k)) out.push(k); }));
    return out;
  };

  const state = {
    all: [], q: '', sort: 'aanbevolen', shown: PER_PAGE, view: 'grid', reviews: {}, fotos: {},
    cmp: [], set: [],
    f: { g: new Set(), n: new Set(), k: new Set(), f: new Set(), p: new Set() },
  };
  const DISCOVERY_PRICE = 49.95; // weergave; de server rekent met DISCOVERY_PRICE_CENTS
  const lees = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const bewaar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* privémodus */ } };
  const uitverkocht = (p, k) => Boolean(p.stock && p.stock[k] === 0);
  /* productfoto per doelgroep en maat (api/_fotos.json), kleine versie voor de kaart */
  const fotoVan = (p, k) => { const f = state.fotos[p.g]; const pad = f && f[String(ML[k])]; return pad ? '/' + pad.replace(/\.webp$/, '-600.webp') : ''; };
  const leverbaar = (p, k) => Boolean((p.v || [])[k]) && !uitverkocht(p, k);
  const sterren = n => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));
  const review = p => { const r = state.reviews[p.n] || []; return r.length ? { n: r.length, avg: r.reduce((a, x) => a + Number(x.sterren || 5), 0) / r.length } : null; };
  /* zelfde afleiding als op de productpagina (api/geur.js) */
  const karakter = p => {
    const d = p.d || {}; const zwaar = ['oud', 'amber', 'leer', 'musk'].some(k => (d[k] || 0) >= 2) || (p.x || 0) >= 2;
    const licht = (p.w || 0) <= -2 && (p.x || 0) <= -1; const c = n => Math.max(1, Math.min(5, Math.round(n)));
    return { Intensiteit: c(3 + (p.x || 0) * .6), Houdbaarheid: zwaar ? 5 : licht ? 3 : 4, Zoetheid: c(1 + (p.s || 0)), Warmte: c(1 + ((p.w || 0) + 3) * (4 / 6)) };
  };
  const seizoen = p => (p.w || 0) >= 2 ? 'Herfst en winter' : (p.w || 0) <= -2 ? 'Lente en zomer' : 'Het hele jaar';
  const moment = p => (p.o || 0) >= 1 ? 'Avond en uitgaan' : (p.o || 0) <= -1 ? 'Overdag' : 'Dag en avond';

  /* ── catalogus klaarzetten ── */
  function prepare(list) {
    return list.map((p, i) => {
      const dims = p.d || {};
      const top = Object.entries(dims).sort((a, b) => b[1] - a[1]).map(([k]) => k);
      const tint = TINT[top[0]] || '#8a6a2a';
      const tekst = strip([p.n, p.tags || '', (p.f || []).join(' '), (p.k || []).join(' '), (p.t || []).join(' '), (p.h || []).join(' '), (p.b || []).join(' '), p.i || '', p.g,
        top.map(k => FAMILIE_NAAM[k]).join(' ')].join(' '));
      const karakter = new Set();
      if ((p.w || 0) >= 1) karakter.add('warm'); if ((p.w || 0) <= -1) karakter.add('fris');
      if ((p.s || 0) >= 2) karakter.add('zoet');
      if ((p.x || 0) >= 2) karakter.add('intens'); if ((p.x || 0) <= -1) karakter.add('zacht');
      if ((p.o || 0) >= 1) karakter.add('avond'); if ((p.o || 0) <= 0) karakter.add('dag');
      /* de families uit de sheet zijn door Angelo zelf gekozen en dus
         het betrouwbaarst; de afgeleide dimensies vullen aan */
      const uitSheet = famKeys(p.f);
      const fams = new Set(uitSheet.length ? uitSheet : top.slice(0, 3));
      const toon = (p.f && p.f.length ? p.f.slice(0, 3) : top.slice(0, 3).map(k => FAMILIE_NAAM[k]));
      return { ...p, _i: i, _tint: TINT[uitSheet[0]] || tint, _top: toon, _tekst: tekst, _k: karakter, _fam: fams,
        _nieuw: NIEUW.has(strip(p.n)) || p.custom === true };
    });
  }

  /* ── filteren en sorteren ── */
  function matches(p) {
    const f = state.f;
    if (f.g.size && !f.g.has(p.g)) return false;
    if (f.n.size && !p._nieuw) return false;
    if (f.k.size) for (const k of f.k) if (!p._k.has(k)) return false;
    if (f.f.size) for (const k of f.f) if (!p._fam.has(k)) return false;
    if (f.p.size) { const max = Math.min(...[...f.p].map(Number)); if (!p.p || p.p > max) return false; }
    if (state.q) {
      const woorden = strip(state.q).split(/\s+/).filter(Boolean);
      for (const w of woorden) if (!p._tekst.includes(w)) return false;
    }
    return true;
  }

  function sorted(list) {
    const l = list.slice();
    if (state.sort === 'naam') l.sort((a, b) => a.n.localeCompare(b.n, 'nl'));
    else if (state.sort === 'prijs-op') l.sort((a, b) => (a.p || 999) - (b.p || 999));
    else if (state.sort === 'prijs-af') l.sort((a, b) => (b.p || 0) - (a.p || 0));
    else l.sort((a, b) => a._i - b._i);
    return l;
  }

  /* ── weergave ── */
  function bottle(tint) {
    return `<svg class="sh-bottle" viewBox="0 0 78 150" aria-hidden="true">
      <rect x="29" y="4" width="20" height="16" rx="2" fill="url(#sh-cap)"/>
      <rect x="27" y="19" width="24" height="7" rx="1" fill="#2a2a2a"/>
      <path d="M22 30 h34 l8 12 v98 a8 8 0 0 1 -8 8 h-34 a8 8 0 0 1 -8 -8 v-98 z" fill="${tint}"/>
      <path d="M22 30 h34 l8 12 v98 a8 8 0 0 1 -8 8 h-34 a8 8 0 0 1 -8 -8 v-98 z" fill="url(#sh-glass)"/>
      <rect x="20" y="66" width="38" height="46" fill="rgba(20,20,20,.55)" stroke="rgba(233,199,103,.55)" stroke-width=".8"/>
      <text x="39" y="86" text-anchor="middle" font-family="Playfair Display, serif" font-size="9" letter-spacing="2" fill="#E9C767">ELIANDI</text>
      <text x="39" y="98" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="5" letter-spacing="2" fill="#CFC9BC">PARFUM</text>
      <rect x="18" y="36" width="5" height="100" rx="2" fill="#fff" opacity=".12"/>
    </svg>`;
  }

  function card(p) {
    const v = p.v || [];
    const heeftPrijs = v.some(Boolean);
    const sel = leverbaar(p, 1) ? 1 : ML.findIndex((_, k) => leverbaar(p, k));
    const alleOp = heeftPrijs && sel < 0;
    const foto = fotoVan(p, sel >= 0 ? sel : 1);
    const noten = [['Hoofdnoot', p.k], ['Top', p.t], ['Hart', p.h], ['Basis', p.b]].filter(([, l]) => l && l.length);
    const rv = review(p);
    const inCmp = state.cmp.includes(p.n), inSet = state.set.includes(p.n);
    return `<article class="sh-card${alleOp ? ' is-soldout' : ''}" data-n="${esc(p.n)}">
      <a class="sh-card-visual${foto ? ' has-foto' : ''}" href="/geur/${slugify(p.n)}" style="--tint:${p._tint}" aria-label="Bekijk ${esc(p.n)}">
        <span class="sh-card-tag">${esc(p.g)}</span>
        ${p._nieuw ? '<span class="sh-card-tag sh-card-new">Nieuw</span>' : ''}
        ${alleOp ? '<span class="sh-card-tag sh-card-out">Uitverkocht</span>' : ''}
        ${foto ? `<img class="sh-foto" src="${foto}" alt="${esc(p.n)}" loading="lazy" decoding="async">` : bottle(p._tint)}
      </a>
      <div class="sh-card-body">
        <h3><a href="/geur/${slugify(p.n)}">${esc(p.n)}</a></h3>
        ${rv ? `<p class="sh-stars" title="${rv.avg.toFixed(1)} van 5"><span>${sterren(rv.avg)}</span><small>${rv.n} ${rv.n === 1 ? 'review' : 'reviews'}</small></p>` : ''}
        ${p._top.length ? `<div class="sh-fams">${p._top.map(k => `<span>${esc(k)}</span>`).join('')}</div>` : ''}
        ${p.i ? `<p class="sh-intro">${esc(p.i)}</p>` : ''}
        ${noten.length ? `<button type="button" class="sh-notes-toggle" aria-expanded="false">Noten</button>
          <div class="sh-notes" hidden>${noten.map(([k, l]) => `<p><b>${k}</b>${esc(l.join(', '))}</p>`).join('')}</div>` : ''}
        ${heeftPrijs && !alleOp ? `<div class="sh-buy">
          <div class="sh-sizes" role="radiogroup" aria-label="Kies een maat">
            ${[0, 1, 2].map(k => `<button type="button" class="sh-size${k === sel ? ' is-on' : ''}" data-k="${k}" ${leverbaar(p, k) ? '' : 'disabled'} role="radio" aria-checked="${k === sel}">${ML[k]} ml<small>${leverbaar(p, k) ? euro(v[k]) : uitverkocht(p, k) ? 'uitverkocht' : 'n.v.t.'}</small></button>`).join('')}
          </div>
          ${v[3] || v[4] ? `<div class="sh-sizes sh-sizes-olie" role="radiogroup" aria-label="Parfumolie"><span class="sh-olie-label">Olie</span>
            ${[3, 4].filter(k => v[k]).map(k => `<button type="button" class="sh-size${k === sel ? ' is-on' : ''}" data-k="${k}" ${leverbaar(p, k) ? '' : 'disabled'} role="radio" aria-checked="${k === sel}">${ML[k]} ml<small>${leverbaar(p, k) ? euro(v[k]) : 'uitverkocht'}</small></button>`).join('')}
          </div>` : ''}
          <button type="button" class="btn btn-gold sh-add">In winkelmand</button>
        </div>` : alleOp ? `<p class="sh-ask">Tijdelijk uitverkocht. <a href="https://wa.me/31687080256?text=${encodeURIComponent('Hoi Angelo, wanneer is ' + p.n + ' er weer?')}" target="_blank" rel="noopener">App Angelo</a> voor wanneer hij er weer is.</p>`
          : `<p class="sh-ask">Prijs op aanvraag. <a href="https://wa.me/31687080256?text=${encodeURIComponent('Hoi Angelo, wat kost ' + p.n + '?')}" target="_blank" rel="noopener">App Angelo</a> of kom langs in de winkel.</p>`}
        <div class="sh-card-tools">
          <label class="sh-cmp${inCmp ? ' is-on' : ''}"><input type="checkbox" data-cmp="${esc(p.n)}" ${inCmp ? 'checked' : ''}> Vergelijk</label>
          <button type="button" class="sh-toset${inSet ? ' is-on' : ''}" data-set="${esc(p.n)}">${inSet ? '✓ In je set' : '+ Discovery Set'}</button>
        </div>
      </div>
    </article>`;
  }

  function render(reset) {
    if (reset) state.shown = PER_PAGE;
    const list = sorted(state.all.filter(matches));
    const grid = $('shGrid');
    grid.classList.toggle('is-list', state.view === 'list');
    grid.innerHTML = list.slice(0, state.shown).map(card).join('');
    $('shEmpty').hidden = list.length > 0;
    $('shMore').hidden = list.length <= state.shown;
    $('shCount').textContent = list.length === state.all.length
      ? `${state.all.length} geuren in de collectie`
      : `${list.length} van ${state.all.length} geuren`;
    activeChips();
  }

  function activeChips() {
    const box = $('shActive');
    const items = [];
    const LABEL = {
      g: { dames: 'Dames', heren: 'Heren', unisex: 'Unisex' }, n: { nieuw: 'Nieuw binnen' },
      k: { warm: 'Warm', fris: 'Fris', zoet: 'Zoet', intens: 'Intens', zacht: 'Zacht', avond: 'Voor de avond', dag: 'Voor overdag' },
      f: FAMILIE_NAAM, p: { 20: 'tot €20', 25: 'tot €25', 35: 'tot €35' },
    };
    Object.entries(state.f).forEach(([grp, set]) => set.forEach(v => items.push({ grp, v, label: LABEL[grp][v] || v })));
    if (state.q) items.push({ grp: 'q', v: state.q, label: `“${state.q}”` });
    box.hidden = !items.length;
    box.innerHTML = items.length ? '<span>Gekozen</span>' + items.map(i => `<button type="button" data-grp="${i.grp}" data-v="${esc(i.v)}">${esc(i.label)}</button>`).join('') : '';
    const n = items.length - (state.q ? 1 : 0);
    $('shFilterCount').hidden = !n; $('shFilterCount').textContent = n;
    $('shReset').hidden = !items.length;
  }

  function syncChips() {
    document.querySelectorAll('.sh-chips').forEach(box => {
      const grp = box.dataset.filter;
      box.querySelectorAll('button').forEach(b => b.classList.toggle('is-on', state.f[grp].has(b.dataset.v)));
    });
  }

  function toggle(grp, v) {
    const set = state.f[grp];
    if (grp === 'p') { const had = set.has(v); set.clear(); if (!had) set.add(v); }
    else if (set.has(v)) set.delete(v); else set.add(v);
    syncChips(); render(true); remember();
  }

  function resetAll() {
    Object.values(state.f).forEach(s => s.clear());
    state.q = ''; $('shQuery').value = ''; $('shClear').hidden = true;
    syncChips(); render(true); remember();
  }

  /* zoekopdracht in de adresbalk, zodat je een link kunt delen */
  function remember() {
    const u = new URL(location.href);
    state.q ? u.searchParams.set('q', state.q) : u.searchParams.delete('q');
    const f = Object.entries(state.f).filter(([, s]) => s.size).map(([k, s]) => k + ':' + [...s].join(',')).join(';');
    f ? u.searchParams.set('f', f) : u.searchParams.delete('f');
    history.replaceState(null, '', u);
  }
  function restore() {
    const u = new URL(location.href);
    state.q = u.searchParams.get('q') || '';
    $('shQuery').value = state.q; $('shClear').hidden = !state.q;
    (u.searchParams.get('f') || '').split(';').filter(Boolean).forEach(part => {
      const [k, vs] = part.split(':');
      if (state.f[k]) vs.split(',').forEach(v => state.f[k].add(v));
    });
    syncChips();
  }

  /* ── gebeurtenissen ── */
  let timer, meetTimer;
  $('shQuery').addEventListener('input', e => {
    state.q = e.target.value.trim();
    $('shClear').hidden = !state.q;
    clearTimeout(timer); timer = setTimeout(() => { render(true); remember(); }, 160);
    /* zoekwoord meten zodra iemand even stopt met typen, met of zonder resultaat */
    clearTimeout(meetTimer);
    meetTimer = setTimeout(() => { if (state.q.length >= 2 && window.EliandiMeet) window.EliandiMeet.event('zoek', { q: state.q, leeg: !state.all.some(matches) }); }, 1500);
  });
  $('shClear').addEventListener('click', () => { state.q = ''; $('shQuery').value = ''; $('shClear').hidden = true; render(true); remember(); $('shQuery').focus(); });
  $('shSort').addEventListener('change', e => { state.sort = e.target.value; render(true); });
  document.querySelectorAll('.sh-chips').forEach(box => box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (b) toggle(box.dataset.filter, b.dataset.v);
  }));
  $('shActive').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.grp === 'q') { state.q = ''; $('shQuery').value = ''; $('shClear').hidden = true; render(true); remember(); }
    else toggle(b.dataset.grp, b.dataset.v);
  });
  $('shReset').addEventListener('click', resetAll);
  $('shEmptyReset').addEventListener('click', resetAll);
  $('shMore').addEventListener('click', () => { state.shown += PER_PAGE; render(false); });

  /* filters als paneel op mobiel */
  const filters = $('shFilters');
  const done = document.createElement('button');
  done.type = 'button'; done.className = 'btn btn-gold sh-filters-done'; done.textContent = 'Toon resultaten';
  filters.append(done);
  const openFilters = open => {
    filters.classList.toggle('is-open', open);
    $('shFilterToggle').setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
  };
  $('shFilterToggle').addEventListener('click', () => openFilters(!filters.classList.contains('is-open')));
  done.addEventListener('click', () => openFilters(false));

  /* noten open/dicht, maat kiezen, in de winkelmand */
  $('shGrid').addEventListener('change', e => {
    const c = e.target.closest('[data-cmp]'); if (!c) return;
    toggleCmp(c.dataset.cmp, c.checked);
  });
  $('shGrid').addEventListener('click', e => {
    const ts = e.target.closest('[data-set]');
    if (ts) { toggleSet(ts.dataset.set); return; }
    const t = e.target.closest('.sh-notes-toggle');
    if (t) { const n = t.nextElementSibling; n.hidden = !n.hidden; t.setAttribute('aria-expanded', !n.hidden); t.textContent = n.hidden ? 'Noten' : 'Verberg noten'; return; }
    const size = e.target.closest('.sh-size');
    if (size && !size.disabled) {
      const kaart = size.closest('.sh-card');
      kaart.querySelectorAll('.sh-size').forEach(b => { b.classList.toggle('is-on', b === size); b.setAttribute('aria-checked', b === size); });
      const p = state.all.find(x => x.n === kaart.dataset.n);
      const img = kaart.querySelector('.sh-foto');
      const f = p && fotoVan(p, +size.dataset.k);
      if (img && f && img.getAttribute('src') !== f) img.src = f;
      return;
    }
    const add = e.target.closest('.sh-add');
    if (!add || !window.EliandiCart) return;
    const cardEl = add.closest('.sh-card');
    const p = state.all.find(x => x.n === cardEl.dataset.n);
    const k = Number((cardEl.querySelector('.sh-size.is-on') || {}).dataset?.k ?? -1);
    if (!p || k < 0 || !leverbaar(p, k)) return;
    window.EliandiCart.add(p.n, ML[k], p.v[k], k >= 3 ? { kind: 'olie' } : undefined);
    add.textContent = 'Toegevoegd ✓'; add.classList.add('is-done');
    setTimeout(() => { add.textContent = 'In winkelmand'; add.classList.remove('is-done'); }, 1800);
  });

  /* categorie-tegels bovenaan: één klik zet het filter en scrolt naar de lijst */
  document.querySelectorAll('.sh-cat[data-cat]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const [grp, v] = a.dataset.cat.includes(':') ? a.dataset.cat.split(':') : ['n', a.dataset.cat];
    Object.values(state.f).forEach(s => s.clear());
    state.f[grp].add(v);
    syncChips(); render(true); remember();
    document.getElementById('resultaten').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  /* ── zoeksuggesties terwijl je typt ── */
  const sug = document.createElement('ul');
  sug.className = 'sh-suggest'; sug.id = 'shSuggest'; sug.hidden = true;
  $('shQuery').closest('.sh-search').append(sug);
  function suggest() {
    const q = strip(state.q);
    if (q.length < 2) { sug.hidden = true; return; }
    const opNaam = p => strip(p.n).includes(q);
    const opTerm = p => !opNaam(p) && p.tags && strip(p.tags).includes(q);
    const namen = state.all.filter(p => opNaam(p) || opTerm(p)).sort((a, b) => (opNaam(b) - opNaam(a)) || (strip(a.n).startsWith(q) === strip(b.n).startsWith(q) ? 0 : strip(a.n).startsWith(q) ? -1 : 1)).slice(0, 6);
    const term = p => { const t = String(p.tags || '').split(/\s*,\s*/).find(x => strip(x).includes(q)); return t || ''; };
    const woorden = new Map();
    state.all.forEach(p => [...(p.k || []), ...(p.t || []), ...(p.h || []), ...(p.b || []), ...(p.f || [])].forEach(w => { if (strip(w).includes(q)) woorden.set(strip(w), w); }));
    const termen = [...woorden.values()].slice(0, 4);
    if (!namen.length && !termen.length) { sug.hidden = true; return; }
    sug.innerHTML = namen.map(p => `<li><a href="/geur/${slugify(p.n)}" style="--tint:${p._tint}"><i></i><b>${esc(p.n)}</b><small>${opTerm(p) ? 'Zoekterm: ' + esc(term(p)) : esc(p._top.slice(0, 2).join(' · ')) + (p.p ? ' · vanaf ' + euro(p.p) : '')}</small></a></li>`).join('')
      + termen.map(w => `<li><button type="button" data-term="${esc(w)}"><i class="is-term"></i><b>${esc(w)}</b><small>alle geuren met deze noot</small></button></li>`).join('');
    sug.hidden = false;
  }
  sug.addEventListener('mousedown', e => e.preventDefault());
  sug.addEventListener('click', e => {
    const b = e.target.closest('[data-term]'); if (!b) return;
    state.q = b.dataset.term; $('shQuery').value = state.q; sug.hidden = true; render(true); remember();
  });
  $('shQuery').addEventListener('blur', () => { sug.hidden = true; });
  $('shQuery').addEventListener('focus', suggest);
  $('shQuery').addEventListener('input', suggest);
  $('shQuery').addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter') sug.hidden = true; });

  /* ── raster of lijst ── */
  state.view = lees('eliandi_shop_view', 'grid');
  const viewBox = $('shView');
  if (viewBox) {
    viewBox.querySelectorAll('button').forEach(b => b.classList.toggle('is-on', b.dataset.view === state.view));
    viewBox.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state.view = b.dataset.view; bewaar('eliandi_shop_view', state.view);
      viewBox.querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x === b));
      render(false);
    });
  }

  /* ── recent bekeken (bijgehouden door de productpagina) ── */
  function renderRecent() {
    const box = $('shRecent'); if (!box) return;
    const namen = lees('eliandi_recent', []).map(r => r.n);
    const items = namen.map(n => state.all.find(p => p.n === n)).filter(Boolean).slice(0, 8);
    box.hidden = !items.length;
    if (!items.length) return;
    box.innerHTML = `<p class="kicker">Recent bekeken</p><div class="sh-recent-row">${items.map(p => { const f = fotoVan(p, 1); return `<a href="/geur/${slugify(p.n)}" style="--tint:${p._tint}">${f ? `<img class="sh-mini" src="${f}" alt="" loading="lazy">` : bottle(p._tint)}<b>${esc(p.n)}</b>${p.p ? `<small>vanaf ${euro(p.p)}</small>` : ''}</a>`; }).join('')}</div>`;
  }

  /* ── vergelijken: tot drie geuren naast elkaar ── */
  const cmpBar = $('shCmpBar'), cmpOverlay = $('shCmpOverlay');
  function toggleCmp(n, on) {
    if (on && !state.cmp.includes(n)) { if (state.cmp.length >= 3) { on = false; } else state.cmp.push(n); }
    if (!on) state.cmp = state.cmp.filter(x => x !== n);
    document.querySelectorAll('[data-cmp]').forEach(c => { c.checked = state.cmp.includes(c.dataset.cmp); c.closest('.sh-cmp').classList.toggle('is-on', c.checked); });
    paintCmpBar();
  }
  function paintCmpBar() {
    if (!cmpBar) return;
    cmpBar.hidden = !state.cmp.length;
    cmpBar.querySelector('.sh-cmpbar-text').innerHTML = state.cmp.length < 2
      ? `<b>${esc(state.cmp[0] || '')}</b> gekozen. Vink nog een geur aan om te vergelijken.`
      : `<b>${state.cmp.length}</b> geuren gekozen${state.cmp.length === 3 ? ' (maximum)' : ''}.`;
    cmpBar.querySelector('[data-cmp-open]').disabled = state.cmp.length < 2;
  }
  function openCmp() {
    const ps = state.cmp.map(n => state.all.find(p => p.n === n)).filter(Boolean);
    if (ps.length < 2) return;
    const dots = w => `<em class="sh-dots" aria-label="${w} van 5">${Array.from({ length: 5 }, (_, i) => `<i class="${i < w ? 'on' : ''}"></i>`).join('')}</em>`;
    const rij = (kop, f) => `<tr><th>${kop}</th>${ps.map(p => `<td>${f(p)}</td>`).join('')}</tr>`;
    const ks = ps.map(karakter);
    cmpOverlay.querySelector('.sh-cmp-table').innerHTML = `<table>
      <thead><tr><th></th>${ps.map(p => { const f = fotoVan(p, 1); return `<th><a href="/geur/${slugify(p.n)}" style="--tint:${p._tint}">${f ? `<img class="sh-mini" src="${f}" alt="">` : bottle(p._tint)}<b>${esc(p.n)}</b></a></th>`; }).join('')}</tr></thead>
      <tbody>
        ${rij('Voor wie', p => esc(p.g))}
        ${rij('Geurfamilie', p => esc(p._top.join(', ')) || '–')}
        ${['Intensiteit', 'Houdbaarheid', 'Zoetheid', 'Warmte'].map((k, i) => `<tr><th>${k}</th>${ks.map(x => `<td>${dots(x[k])}</td>`).join('')}</tr>`).join('')}
        ${rij('Topnoten', p => esc(((p.t && p.t.length ? p.t : p.k) || []).join(', ')) || '–')}
        ${rij('Hartnoten', p => esc((p.h || []).join(', ')) || '–')}
        ${rij('Basisnoten', p => esc((p.b || []).join(', ')) || '–')}
        ${rij('Seizoen', seizoen)}
        ${rij('Moment', moment)}
        ${rij('Reviews', p => { const r = review(p); return r ? `<span class="sh-stars"><span>${sterren(r.avg)}</span><small>${r.n}</small></span>` : '–'; })}
        ${rij('Vanaf', p => p.p ? euro(p.p) : 'op aanvraag')}
        ${rij('', p => `<a class="btn btn-ghost sh-cmp-go" href="/geur/${slugify(p.n)}">Bekijk</a>`)}
      </tbody></table>`;
    cmpOverlay.hidden = false; document.body.style.overflow = 'hidden';
  }
  function closeCmp() { cmpOverlay.hidden = true; document.body.style.overflow = ''; }
  if (cmpBar) {
    cmpBar.querySelector('[data-cmp-open]').addEventListener('click', openCmp);
    cmpBar.querySelector('[data-cmp-clear]').addEventListener('click', () => { state.cmp = []; toggleCmp('', false); });
    cmpOverlay.addEventListener('click', e => { if (e.target.closest('[data-cmp-close]') || e.target === cmpOverlay) closeCmp(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !cmpOverlay.hidden) closeCmp(); });
  }

  /* ── Discovery Set zelf samenstellen: vijf geuren, 10 ml elk ── */
  const setBox = $('shSet');
  state.set = lees('eliandi_set_draft', []).slice(0, 5);
  function toggleSet(n) {
    if (state.set.includes(n)) state.set = state.set.filter(x => x !== n);
    else if (state.set.length >= 5) { flash('Je set is vol: vijf geuren. Haal er eerst een uit.'); return; }
    else state.set.push(n);
    bewaar('eliandi_set_draft', state.set);
    openSet(true);
    paintSet();
  }
  function paintSet() {
    if (!setBox) return;
    const slots = setBox.querySelector('.sh-set-slots');
    slots.innerHTML = Array.from({ length: 5 }, (_, i) => {
      const n = state.set[i]; const p = n && state.all.find(x => x.n === n);
      const f = p && fotoVan(p, 1);
      return p ? `<div class="sh-set-slot is-full" style="--tint:${p._tint}">${f ? `<img class="sh-mini" src="${f}" alt="">` : bottle(p._tint)}<b>${esc(p.n)}</b><button type="button" data-set="${esc(p.n)}" aria-label="${esc(p.n)} uit je set halen">&times;</button></div>`
        : `<div class="sh-set-slot"><span>${i + 1}</span><small>kies een geur</small></div>`;
    }).join('');
    setBox.querySelector('.sh-set-count').textContent = `${state.set.length} van 5 gekozen`;
    const btn = setBox.querySelector('.sh-set-add');
    btn.disabled = state.set.length !== 5;
    btn.textContent = state.set.length === 5 ? `In winkelmand · ${euro(DISCOVERY_PRICE)}` : `Kies nog ${5 - state.set.length} ${5 - state.set.length === 1 ? 'geur' : 'geuren'}`;
    document.querySelectorAll('[data-set]').forEach(b => { if (b.classList.contains('sh-toset')) { const on = state.set.includes(b.dataset.set); b.classList.toggle('is-on', on); b.textContent = on ? '✓ In je set' : '+ Discovery Set'; } });
  }
  function openSet(open) {
    if (!setBox) return;
    setBox.hidden = !open; document.body.classList.toggle('is-building', open);
    if (open) paintSet();
  }
  function flash(t) {
    const el = document.createElement('p'); el.className = 'sh-flash'; el.textContent = t;
    document.body.append(el); setTimeout(() => el.classList.add('is-on'), 10); setTimeout(() => el.remove(), 2800);
  }
  if (setBox) {
    const q = setBox.querySelector('.sh-set-query'), res = setBox.querySelector('.sh-set-results');
    q.addEventListener('input', () => {
      const t = strip(q.value.trim());
      if (t.length < 2) { res.innerHTML = ''; return; }
      res.innerHTML = state.all.filter(p => p._tekst.includes(t)).slice(0, 8).map(p => `<button type="button" data-set="${esc(p.n)}" style="--tint:${p._tint}" ${state.set.includes(p.n) ? 'class="is-on"' : ''}><i></i><b>${esc(p.n)}</b><small>${esc(p._top.slice(0, 2).join(' · '))}</small></button>`).join('') || '<p class="sh-set-none">Geen geur met dat woord.</p>';
    });
    setBox.addEventListener('click', e => {
      const b = e.target.closest('[data-set]'); if (b) { toggleSet(b.dataset.set); q.dispatchEvent(new Event('input')); return; }
      if (e.target.closest('[data-set-close]')) openSet(false);
      if (e.target.closest('.sh-set-add') && state.set.length === 5 && window.EliandiCart) {
        window.EliandiCart.add('Discovery Set', 10, DISCOVERY_PRICE, { kind: 'discovery', perfumes: state.set.slice() });
        state.set = []; bewaar('eliandi_set_draft', []); paintSet(); openSet(false);
      }
    });
    document.querySelectorAll('[data-set-open]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); openSet(true);
      setBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    if (location.hash === '#discovery') openSet(true);
  }

  function tellingen() {
    const tel = f => state.all.filter(f).length;
    const zet = (k, n) => document.querySelectorAll(`[data-count="${k}"]`).forEach(el => { el.textContent = `${n} geuren`; });
    zet('dames', tel(p => p.g === 'dames')); zet('heren', tel(p => p.g === 'heren')); zet('unisex', tel(p => p.g === 'unisex'));
    zet('nieuw', tel(p => p._nieuw));
  }

  /* ── start: catalogus plus aanpassingen van Angelo ── */
  let gestart = false;
  function start(list) {
    state.all = prepare(list);
    tellingen();
    if (!gestart) { restore(); gestart = true; }
    render(true);
    renderRecent(); paintSet(); paintCmpBar();
  }
  function samenvoegen(basis, d) {
    if (!d) return basis;
    const ov = d.overrides || {};
    state.reviews = d.reviews || {};
    state.fotos = d.fotos || {};
    const olie = d.olie || {};
    const lijst = basis.filter(p => !(ov[p.n] && ov[p.n].hidden)).map(p => {
      const o = ov[p.n] || {};
      const v = (o.v || p.v || []).slice(0, 3);
      const ps = v.filter(Boolean);
      return { ...p, v: metOlie(v), stock: o.stock || null, tags: o.tags || '', p: ps.length ? Math.min(...ps) : p.p };
    });
    const namen = new Set(lijst.map(p => p.n));
    (d.custom || []).forEach(p => { if (!namen.has(p.n)) lijst.push({ ...p, v: metOlie((p.v || []).slice(0, 3)), custom: true }); });
    function metOlie(v) { return v.some(Boolean) ? [...v, olie[6] || 0, olie[13] || 0] : v; }
    return lijst;
  }
  /* eerst de lichte catalogus (snel op het scherm), daarna de volledige
     met noten en verhalen voor zoeken, vergelijken en de kaarten */
  let dashboard = null;
  const heeftVol = () => typeof ELIANDI_CATALOG !== 'undefined';
  const lite = typeof ELIANDI_CATALOG_LITE !== 'undefined' ? ELIANDI_CATALOG_LITE.slice() : (heeftVol() ? ELIANDI_CATALOG.slice() : []);
  const haalVol = () => new Promise(resolve => {
    if (heeftVol()) return resolve(ELIANDI_CATALOG);
    const sc = document.createElement('script'); sc.src = 'js/catalog.js';
    sc.onload = () => resolve(heeftVol() ? ELIANDI_CATALOG : lite); sc.onerror = () => resolve(lite);
    document.head.append(sc);
  });
  fetch('/api/products', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(d => {
    dashboard = d;
    start(samenvoegen(lite, d));
    return haalVol();
  }).then(vol => { if (vol && vol !== lite) start(samenvoegen(vol.slice(), dashboard)); });
})();
