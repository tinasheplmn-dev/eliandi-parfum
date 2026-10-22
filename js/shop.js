/* ═══════════════════════════════════════════════════════════════
   ELIANDI — de shop

   Werkt op ELIANDI_CATALOG (js/catalog.js, gegenereerd uit de sheet
   van Angelo) plus wat hij in het dashboard aanpast (/api/products).
   De prijs in de winkelmand is weergave; de server rekent opnieuw.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ML = [30, 50, 100];
  const PER_PAGE = 24;
  const euro = n => '€' + Number(n).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const strip = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

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
  const NIEUW = new Set(['smoked amber', 'le cheminee', 'emeraude eliandi', 'rubis eliandi', 'mona lisa', 'qahwa', 'true powerfull', 'power of true']);

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
    all: [], q: '', sort: 'aanbevolen', shown: PER_PAGE,
    f: { g: new Set(), k: new Set(), f: new Set(), p: new Set() },
  };

  /* ── catalogus klaarzetten ── */
  function prepare(list) {
    return list.map((p, i) => {
      const dims = p.d || {};
      const top = Object.entries(dims).sort((a, b) => b[1] - a[1]).map(([k]) => k);
      const tint = TINT[top[0]] || '#8a6a2a';
      const tekst = strip([p.n, (p.f || []).join(' '), (p.t || []).join(' '), (p.h || []).join(' '), (p.b || []).join(' '), p.i || '', p.g,
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
    const sel = v[1] ? 1 : v.findIndex(Boolean);
    const noten = [['Top', p.t], ['Hart', p.h], ['Basis', p.b]].filter(([, l]) => l && l.length);
    return `<article class="sh-card" data-n="${esc(p.n)}">
      <div class="sh-card-visual" style="--tint:${p._tint}">
        <span class="sh-card-tag">${esc(p.g)}</span>
        ${p._nieuw ? '<span class="sh-card-tag sh-card-new">Nieuw</span>' : ''}
        ${bottle(p._tint)}
      </div>
      <div class="sh-card-body">
        <h3>${esc(p.n)}</h3>
        ${p._top.length ? `<div class="sh-fams">${p._top.map(k => `<span>${esc(k)}</span>`).join('')}</div>` : ''}
        ${p.i ? `<p class="sh-intro">${esc(p.i)}</p>` : ''}
        ${noten.length ? `<button type="button" class="sh-notes-toggle" aria-expanded="false">Noten</button>
          <div class="sh-notes" hidden>${noten.map(([k, l]) => `<p><b>${k}</b>${esc(l.join(', '))}</p>`).join('')}</div>` : ''}
        ${heeftPrijs ? `<div class="sh-buy">
          <div class="sh-sizes" role="radiogroup" aria-label="Kies een maat">
            ${ML.map((ml, k) => `<button type="button" class="sh-size${k === sel ? ' is-on' : ''}" data-k="${k}" ${v[k] ? '' : 'disabled'} role="radio" aria-checked="${k === sel}">${ml} ml<small>${v[k] ? euro(v[k]) : 'n.v.t.'}</small></button>`).join('')}
          </div>
          <button type="button" class="btn btn-gold sh-add">In winkelmand</button>
        </div>` : `<p class="sh-ask">Prijs op aanvraag. <a href="https://wa.me/31687080256?text=${encodeURIComponent('Hoi Angelo, wat kost ' + p.n + '?')}" target="_blank" rel="noopener">App Angelo</a> of kom langs in de winkel.</p>`}
      </div>
    </article>`;
  }

  function render(reset) {
    if (reset) state.shown = PER_PAGE;
    const list = sorted(state.all.filter(matches));
    const grid = $('shGrid');
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
      g: { dames: 'Dames', heren: 'Heren', unisex: 'Unisex' },
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
  let timer;
  $('shQuery').addEventListener('input', e => {
    state.q = e.target.value.trim();
    $('shClear').hidden = !state.q;
    clearTimeout(timer); timer = setTimeout(() => { render(true); remember(); }, 160);
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
  $('shGrid').addEventListener('click', e => {
    const t = e.target.closest('.sh-notes-toggle');
    if (t) { const n = t.nextElementSibling; n.hidden = !n.hidden; t.setAttribute('aria-expanded', !n.hidden); t.textContent = n.hidden ? 'Noten' : 'Verberg noten'; return; }
    const size = e.target.closest('.sh-size');
    if (size && !size.disabled) {
      size.closest('.sh-sizes').querySelectorAll('.sh-size').forEach(b => { b.classList.toggle('is-on', b === size); b.setAttribute('aria-checked', b === size); });
      return;
    }
    const add = e.target.closest('.sh-add');
    if (!add || !window.EliandiCart) return;
    const cardEl = add.closest('.sh-card');
    const p = state.all.find(x => x.n === cardEl.dataset.n);
    const k = Number((cardEl.querySelector('.sh-size.is-on') || {}).dataset?.k ?? -1);
    if (!p || k < 0 || !p.v[k]) return;
    window.EliandiCart.add(p.n, ML[k], p.v[k]);
    add.textContent = 'Toegevoegd ✓'; add.classList.add('is-done');
    setTimeout(() => { add.textContent = 'In winkelmand'; add.classList.remove('is-done'); }, 1800);
  });

  /* ── start: catalogus plus aanpassingen van Angelo ── */
  function start(list) {
    state.all = prepare(list);
    restore();
    render(true);
  }
  const basis = typeof ELIANDI_CATALOG !== 'undefined' ? ELIANDI_CATALOG.slice() : [];
  fetch('/api/products', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(d => {
    if (!d) return start(basis);
    const ov = d.overrides || {};
    const lijst = basis.filter(p => !(ov[p.n] && ov[p.n].hidden)).map(p => {
      const o = ov[p.n];
      if (!o || !o.v) return p;
      const ps = o.v.filter(Boolean);
      return { ...p, v: o.v, p: ps.length ? Math.min(...ps) : p.p };
    });
    const namen = new Set(lijst.map(p => p.n));
    (d.custom || []).forEach(p => { if (!namen.has(p.n)) lijst.push({ ...p, custom: true }); });
    start(lijst);
  }).catch(() => start(basis));
})();
