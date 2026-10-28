/* ═══════════════════════════════════════════════════════════════
   ELIANDI — taalkeuze: Nederlands, English, العربية

   Nederlands is de bron. Kiest een bezoeker EN of AR, dan laadt dit
   script js/i18n-data.js en vertaalt het elke tekst op de pagina,
   ook wat later door JavaScript verschijnt (winkelmand, shop, agenda).
   De keuze blijft bewaard; ?lang=en of ?lang=ar in een link zet hem.

   Productinhoud (verhaal per geur, noten) blijft Nederlands: die
   teksten komen uit de sheet van Angelo. Ontbreekt een vertaling,
   dan blijft de Nederlandse tekst staan. Met ?i18n=debug toont de
   console welke teksten nog geen vertaling hebben.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  const TALEN = { nl: 'NL', en: 'EN', ar: 'ع' };
  const NAAM = { nl: 'Nederlands', en: 'English', ar: 'العربية' };
  const LOCALE = { nl: 'nl-NL', en: 'en-GB', ar: 'ar-u-nu-latn' };
  const params = new URLSearchParams(location.search);
  let lang = null;
  try {
    const q = params.get('lang');
    if (q && TALEN[q]) { lang = q; localStorage.setItem('eliandi_lang', q); }
    else lang = localStorage.getItem('eliandi_lang');
  } catch (e) { lang = params.get('lang'); }
  if (!TALEN[lang]) lang = 'nl';
  window.ELIANDI_LANG = lang;
  window.ELIANDI_LOCALE = LOCALE[lang];

  const root = document.documentElement;
  const script = document.currentScript;
  const basis = script && script.src ? script.src.replace(/js\/taal\.js.*$/, '') : '/';

  /* ── taalkeuze in de kopbalk ── */
  function keuze() {
    if (document.querySelector('.taal-keuze')) return;
    const box = document.createElement('div');
    box.className = 'taal-keuze';
    box.setAttribute('data-i18n-skip', '');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Taal · Language · اللغة');
    box.innerHTML = Object.keys(TALEN).map(t => {
      const u = new URL(location.href); u.searchParams.set('lang', t);
      return `<a href="${u.pathname + u.search + u.hash}" hreflang="${t}" lang="${t}" title="${NAAM[t]}"${t === lang ? ' aria-current="true" class="is-on"' : ''}>${TALEN[t]}</a>`;
    }).join('');
    const kop = document.querySelector('header.nav, header.qnav, header.xp-nav');
    if (kop) {
      const voor = kop.querySelector('.nav-cta, .qnav-exit, .xp-nav-cta, .nav-burger');
      voor ? kop.insertBefore(box, voor) : kop.append(box);
    } else {
      box.classList.add('is-los');
      document.body.append(box);
    }
  }
  const stijl = document.createElement('link');
  stijl.rel = 'stylesheet'; stijl.href = basis + 'css/taal.css';
  document.head.append(stijl);

  if (lang === 'nl') {
    document.addEventListener('DOMContentLoaded', keuze);
    return;
  }

  root.lang = lang;
  if (lang === 'ar') {
    root.dir = 'rtl';
    const f = document.createElement('link');
    f.rel = 'stylesheet';
    f.href = 'https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;500;600&family=Noto+Sans+Arabic:wght@300;400;500;600&display=swap';
    document.head.append(f);
  }
  /* even onzichtbaar tot de vertaling staat, zodat je geen Nederlands ziet flitsen */
  root.classList.add('i18n-wacht');
  const toon = () => root.classList.remove('i18n-wacht');
  setTimeout(toon, 2500);

  let D = null;
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  const L = lang === 'en' ? 1 : 2;

  /* vertaalregels (patronen, zinnen, geurnoten) staan in js/i18n-data.js,
     zodat de server (api/geur.js) precies dezelfde vertaling maakt */
  let W = null, tr = () => null;

  const ATTR = ['placeholder', 'aria-label', 'alt', 'title'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE']);
  const gemist = new Set();
  const vertaald = new Set();
  const debug = params.get('i18n') === 'debug';

  function tekst(node) {
    const p = node.parentElement;
    if (!p || SKIP.has(p.tagName) || p.closest('[data-i18n-skip]')) return;
    const v = node.nodeValue;
    const t = tr(v);
    if (t == null) { if (debug && /[a-z]{3}/.test(v) && !vertaald.has(norm(v))) gemist.add(norm(v)); return; }
    const nieuw = v.match(/^\s*/)[0] + t + v.match(/\s*$/)[0];
    if (nieuw !== v) node.nodeValue = nieuw;
  }
  function attrs(el) {
    if (el.closest('[data-i18n-skip]')) return;
    for (const a of ATTR) {
      const v = el.getAttribute(a);
      if (!v) continue;
      const t = tr(v);
      if (t != null && t !== v) el.setAttribute(a, t);
    }
  }
  function boom(n) {
    if (n.nodeType === 3) return tekst(n);
    if (n.nodeType !== 1 || SKIP.has(n.tagName)) return;
    attrs(n);
    const w = document.createTreeWalker(n, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: x => (x.nodeType === 1 && SKIP.has(x.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let x;
    while ((x = w.nextNode())) (x.nodeType === 3 ? tekst(x) : attrs(x));
  }

  /* extra vertaalparen: productomschrijvingen (js/i18n-producten.js) en
     het verhaal op een productpagina (<script id="i18nExtra">) */
  function extra(rijen) { (rijen || []).forEach(r => { if (r && r[0] && r[L]) { D[norm(r[0])] = r[L]; vertaald.add(norm(r[L])); } }); }
  function start() {
    if (!D || !document.body) return;
    extra(window.ELIANDI_I18N_PRODUCTEN);
    try { const el = document.getElementById('i18nExtra'); if (el) extra(JSON.parse(el.textContent)); } catch (e) { /* geen extra */ }
    keuze();
    const t = tr(document.title);
    if (t) document.title = t;
    boom(document.body);
    toon();
    new MutationObserver(lijst => lijst.forEach(m => {
      if (m.type === 'characterData') tekst(m.target);
      else if (m.type === 'attributes') attrs(m.target);
      else m.addedNodes.forEach(boom);
    })).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label'] });
    if (debug) setInterval(() => { if (gemist.size) { console.log('[i18n] nog niet vertaald:', JSON.stringify([...gemist], null, 1)); gemist.clear(); } }, 3000);
  }

  /* productomschrijvingen: los bestand, laadt naast de interfaceteksten */
  const pr = document.createElement('script');
  pr.src = basis + 'js/i18n-producten.js';
  pr.onload = () => { if (D && document.body) { extra(window.ELIANDI_I18N_PRODUCTEN); boom(document.body); } };
  document.head.append(pr);

  const sc = document.createElement('script');
  sc.src = basis + 'js/i18n-data.js';
  sc.onload = () => {
    D = {};
    (window.ELIANDI_I18N || []).forEach(r => { if (r[L] != null) { D[norm(r[0])] = r[L]; vertaald.add(norm(r[L])); } });
    W = {};
    String(window.ELIANDI_NOTEN || '').trim().split('\n').forEach(r => { const d = r.split('|'); if (d.length === 3) W[d[0].trim().toLowerCase()] = [d[1].trim(), d[2].trim()]; });
    tr = window.ELIANDI_I18N_KERN(lang, D, W).tr;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  };
  sc.onerror = () => { toon(); document.addEventListener('DOMContentLoaded', keuze); };
  document.head.append(sc);
})();
