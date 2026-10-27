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

  /* ── teksten met getallen of namen erin ── */
  const meer = (n, een, veel) => (Number(n) === 1 ? een : veel);
  const PATRONEN = {
    en: [
      [/^(\d+) geuren in de collectie$/, m => `${m[1]} fragrances in the collection`],
      [/^(\d+) van (\d+) geuren$/, m => `${m[1]} of ${m[2]} fragrances`],
      [/^(\d+) geuren$/, m => `${m[1]} fragrances`],
      [/^(\d+) van 5 gekozen$/, m => `${m[1]} of 5 chosen`],
      [/^Kies nog (\d+) geuren?$/, m => `Choose ${m[1]} more`],
      [/^In winkelmand · (€[\d.,]+)$/, m => `Add to bag · ${m[1]}`],
      [/^vanaf (€[\d.,]+)$/i, m => `from ${m[1]}`],
      [/^(\d+) ml olie$/, m => `${m[1]} ml oil`],
      [/^Zoekterm: (.+)$/, m => `Search term: ${m[1]}`],
      [/^(\d+) reviews?$/, m => `${m[1]} ${meer(m[1], 'review', 'reviews')}`],
      [/^([\d,]+) van 5 · (\d+) reviews?$/, m => `${m[1].replace(',', '.')} out of 5 · ${m[2]} ${meer(m[2], 'review', 'reviews')}`],
      [/^(\d+) (bestelling|bestellingen)$/, m => `${m[1]} ${meer(m[1], 'order', 'orders')}`],
      [/^Zo ontvouwt (.+) zich\.$/, m => `How ${m[1]} unfolds.`],
      [/^(Dames|Heren|Unisex) · Extrait de parfum$/, (m, t) => `${t(m[1])} · Extrait de parfum`],
      [/^Nog geen reviews voor (.+)\. Draag je hem al\?$/, m => `No reviews for ${m[1]} yet. Already wearing it?`],
      [/^(.+) is een extrait de parfum van Eliandi: hoog geconcentreerd, met de hand samengesteld in de winkel aan de Vughterstraat en gemaakt om de hele dag bij je te blijven\.$/, m => `${m[1]} is an Eliandi extrait de parfum: highly concentrated, blended by hand in the shop on Vughterstraat and made to stay with you all day.`],
      [/^Angelo zet (.+) graag voor je klaar, naast een paar geuren die erbij passen\. Vughterstraat 70, 's-Hertogenbosch\.$/, m => `Angelo will happily set out ${m[1]} for you, alongside a few fragrances that go with it. Vughterstraat 70, 's-Hertogenbosch.`],
      [/^Reserveer en betaal (€[\d.,]+)$/, m => `Book and pay ${m[1]}`],
      [/^Nu aanbetalen \((\d+)%\)$/, m => `Deposit now (${m[1]}%)`],
      [/^Reserveer voor (\d+) personen$/, m => `Book for ${m[1]} people`],
      [/^(\d+) personen$/, m => `${m[1]} people`],
      [/^Met (\d+) personen$/, m => `With ${m[1]} people`],
      [/^(€[\d.,]+) per persoon · ieder een flacon van 50 ml$/, m => `${m[1]} per person · everyone gets a 50 ml bottle`],
      [/^(\d+) minuten aan de geurtafel$/, m => `${m[1]} minutes at the scent table`],
      [/^(\d+) minuten privé met Angelo(, ieder een eigen flacon)?$/, m => `${m[1]} minutes in private with Angelo${m[2] ? ', everyone with their own bottle' : ''}`],
      [/^Vanaf (\d+) personen rekenen we (€[\d.,]+) per extra persoon\. Groter gezelschap dan (\d+)\? Bel Angelo, dan kijken we wat kan\.$/, m => `From ${m[1]} people we charge ${m[2]} per extra person. A group larger than ${m[3]}? Call Angelo and we'll see what's possible.`],
      [/^Er is de komende weken geen aaneengesloten plek voor (\d+) personen\. Probeer een kleiner gezelschap, of app Angelo\.$/, m => `There is no continuous slot for ${m[1]} people in the coming weeks. Try a smaller group, or message Angelo.`],
      [/^Angelo neemt contact met je op zodra er een plek is voor (\d+) (persoon|personen)\.$/, m => `Angelo will contact you as soon as there is room for ${m[1]} ${meer(m[1], 'person', 'people')}.`],
      [/^Vraag (\d+) van (\d+)$/, m => `Question ${m[1]} of ${m[2]}`],
      [/^Lanceringsactie, loopt t\/m (.+)\.$/, m => `Launch offer, runs until ${m[1]}.`],
      [/^Bestel jouw Discovery Set · €([\d.,]+)$/, m => `Order your Discovery Set · €${m[1]}`],
      [/^Jouw profiel wordt gewogen tegen (\d+) geuren…$/, m => `Your profile is being weighed against ${m[1]} fragrances…`],
      [/^Hier komen (.+) samen\.$/, (m, t) => `This is where ${t(m[1])} come together.`],
      [/^Deze geur draagt precies (.+)\.$/, (m, t) => `This fragrance carries exactly ${t(m[1])}.`],
      [/^Gebouwd rond (.+)\.$/, (m, t) => `Built around ${t(m[1])}.`],
      [/^In dit flesje vind je (.+) terug\.$/, (m, t) => `In this bottle you'll find ${t(m[1])}.`],
      [/^Een compositie van (.+)\.$/, (m, t) => `A composition of ${t(m[1])}.`],
      [/^Jouw signatuur is (.+)\.$/, (m, t) => `Your signature is ${t(m[1])}.`],
      [/^Voor (.+)$/, m => `For ${m[1]}`],
    ],
    ar: [
      [/^(\d+) geuren in de collectie$/, m => `${m[1]} عطرًا في المجموعة`],
      [/^(\d+) van (\d+) geuren$/, m => `${m[1]} من ${m[2]} عطرًا`],
      [/^(\d+) geuren$/, m => `${m[1]} عطرًا`],
      [/^(\d+) van 5 gekozen$/, m => `تم اختيار ${m[1]} من 5`],
      [/^Kies nog (\d+) geuren?$/, m => `اختر ${m[1]} أخرى`],
      [/^In winkelmand · (€[\d.,]+)$/, m => `أضف إلى السلة · ${m[1]}`],
      [/^vanaf (€[\d.,]+)$/i, m => `ابتداءً من ${m[1]}`],
      [/^(\d+) ml olie$/, m => `زيت ${m[1]} مل`],
      [/^Zoekterm: (.+)$/, m => `كلمة البحث: ${m[1]}`],
      [/^(\d+) reviews?$/, m => `${m[1]} ${meer(m[1], 'تقييم', 'تقييمات')}`],
      [/^([\d,]+) van 5 · (\d+) reviews?$/, m => `${m[1].replace(',', '.')} من 5 · ${m[2]} ${meer(m[2], 'تقييم', 'تقييمات')}`],
      [/^(\d+) (bestelling|bestellingen)$/, m => `${m[1]} ${meer(m[1], 'طلب', 'طلبات')}`],
      [/^Zo ontvouwt (.+) zich\.$/, m => `هكذا يتكشّف ${m[1]}.`],
      [/^(Dames|Heren|Unisex) · Extrait de parfum$/, (m, t) => `${t(m[1])} · إكستريه دو بارفان`],
      [/^Nog geen reviews voor (.+)\. Draag je hem al\?$/, m => `لا توجد تقييمات لـ ${m[1]} بعد. هل تضعه بالفعل؟`],
      [/^(.+) is een extrait de parfum van Eliandi: hoog geconcentreerd, met de hand samengesteld in de winkel aan de Vughterstraat en gemaakt om de hele dag bij je te blijven\.$/, m => `${m[1]} عطر إكستريه من إلياندي: عالي التركيز، مُركّب يدويًا في المتجر في شارع فوخترسترات، ومصنوع ليبقى معك طوال اليوم.`],
      [/^Angelo zet (.+) graag voor je klaar, naast een paar geuren die erbij passen\. Vughterstraat 70, 's-Hertogenbosch\.$/, m => `يسعد أنجيلو أن يحضّر لك ${m[1]}، مع بعض العطور التي تنسجم معه. Vughterstraat 70، ’s-Hertogenbosch.`],
      [/^Reserveer en betaal (€[\d.,]+)$/, m => `احجز وادفع ${m[1]}`],
      [/^Nu aanbetalen \((\d+)%\)$/, m => `دفعة مقدّمة الآن (${m[1]}%)`],
      [/^Reserveer voor (\d+) personen$/, m => `احجز لـ ${m[1]} أشخاص`],
      [/^(\d+) personen$/, m => `${m[1]} أشخاص`],
      [/^Met (\d+) personen$/, m => `مع ${m[1]} أشخاص`],
      [/^(€[\d.,]+) per persoon · ieder een flacon van 50 ml$/, m => `${m[1]} للشخص · لكلٍّ زجاجة 50 مل`],
      [/^(\d+) minuten aan de geurtafel$/, m => `${m[1]} دقيقة على طاولة العطور`],
      [/^(\d+) minuten privé met Angelo(, ieder een eigen flacon)?$/, m => `${m[1]} دقيقة على انفراد مع أنجيلو${m[2] ? '، ولكلٍّ زجاجته الخاصة' : ''}`],
      [/^Vanaf (\d+) personen rekenen we (€[\d.,]+) per extra persoon\. Groter gezelschap dan (\d+)\? Bel Angelo, dan kijken we wat kan\.$/, m => `ابتداءً من ${m[1]} أشخاص نحتسب ${m[2]} لكل شخص إضافي. مجموعة أكبر من ${m[3]}؟ اتصل بأنجيلو وسنرى ما الممكن.`],
      [/^Er is de komende weken geen aaneengesloten plek voor (\d+) personen\. Probeer een kleiner gezelschap, of app Angelo\.$/, m => `لا يوجد موعد متصل لـ ${m[1]} أشخاص في الأسابيع القادمة. جرّب مجموعة أصغر، أو راسل أنجيلو.`],
      [/^Angelo neemt contact met je op zodra er een plek is voor (\d+) (persoon|personen)\.$/, m => `سيتواصل معك أنجيلو فور توفّر مكان لـ ${m[1]} ${meer(m[1], 'شخص', 'أشخاص')}.`],
      [/^Vraag (\d+) van (\d+)$/, m => `السؤال ${m[1]} من ${m[2]}`],
      [/^Lanceringsactie, loopt t\/m (.+)\.$/, m => `عرض الإطلاق، ساري حتى ${m[1]}.`],
      [/^Bestel jouw Discovery Set · €([\d.,]+)$/, m => `اطلب مجموعة الاكتشاف · €${m[1]}`],
      [/^Jouw profiel wordt gewogen tegen (\d+) geuren…$/, m => `تتم مقارنة ملفك مع ${m[1]} عطرًا…`],
      [/^Hier komen (.+) samen\.$/, (m, t) => `هنا تجتمع ${t(m[1])}.`],
      [/^Deze geur draagt precies (.+)\.$/, (m, t) => `يحمل هذا العطر تمامًا ${t(m[1])}.`],
      [/^Gebouwd rond (.+)\.$/, (m, t) => `مبني حول ${t(m[1])}.`],
      [/^In dit flesje vind je (.+) terug\.$/, (m, t) => `في هذه الزجاجة تجد ${t(m[1])}.`],
      [/^Een compositie van (.+)\.$/, (m, t) => `تركيبة من ${t(m[1])}.`],
      [/^Jouw signatuur is (.+)\.$/, (m, t) => `بصمتك العطرية ${t(m[1])}.`],
      [/^Voor (.+)$/, m => `إلى ${m[1]}`],
    ],
  }[lang];

  /* vertaal één stuk tekst; null als we het niet kennen */
  function tr(s) {
    const k = norm(s);
    if (!k || !/[A-Za-zÀ-ÿ]/.test(k)) return null;
    if (Object.prototype.hasOwnProperty.call(D, k)) return D[k];
    for (const [re, f] of PATRONEN) { const m = k.match(re); if (m) return f(m, deel); }
    /* lijstjes met een middenpunt: elk deel apart */
    if (k.includes(' · ')) {
      const delen = k.split(' · ').map(x => tr(x));
      if (delen.some(x => x != null)) return k.split(' · ').map((x, i) => (delen[i] != null ? delen[i] : x)).join(' · ');
    }
    /* lijstje geurnoten uit de sheet: woord voor woord */
    const n = noten(k);
    if (n != null) return n;
    /* meerdere zinnen: zin voor zin */
    const zinnen = k.split(/(?<=[.!?])\s+(?=[A-Z“‘"])/);
    if (zinnen.length > 1) {
      const t = zinnen.map(z => tr(z));
      if (t.every(x => x != null)) return t.join(' ');
    }
    return null;
  }
  /* voor stukjes binnen een patroon: "x en y" en "x, y en z" */
  const EN = lang === 'en' ? ' and ' : ' و';
  function deel(s) {
    const t = tr(s);
    if (t != null) return t;
    const stukken = s.split(/, | en /);
    if (stukken.length > 1) {
      const v = stukken.map(x => tr(x) ?? x);
      return v.slice(0, -1).join(', ') + EN + v[v.length - 1];
    }
    return s;
  }

  /* ── geurnoten: woordenlijst uit i18n-data.js ── */
  let W = null;
  function notenItem(item) {
    const uit = item.split(/\s+uit\s+/i);
    if (uit.length === 2) {
      const a = notenItem(uit[0]), b = notenItem(uit[1]);
      return a == null || b == null ? null : a + (lang === 'en' ? ' from ' : ' من ') + b;
    }
    const woorden = item.split(/\s+/);
    const vert = [];
    let eigen = false;
    for (const w of woorden) {
      const e = W[w.toLowerCase()];
      if (!e) return null;
      let t = e[L - 1];
      if (t === '=') { t = w; eigen = true; }
      else if (lang === 'en' && /^[A-ZÀ-Ý]/.test(w)) t = t.charAt(0).toUpperCase() + t.slice(1);
      vert.push(t);
    }
    /* Arabisch: zelfstandig naamwoord voor het bijvoeglijk naamwoord */
    if (lang === 'ar' && !eigen) vert.reverse();
    return vert.join(' ');
  }
  function noten(k) {
    if (!W || k.length > 300 || !/^[A-Za-zÀ-ÿ'’\- ,&]+$/.test(k)) return null;
    const items = k.split(/\s*,\s*/);
    const t = items.map(notenItem);
    if (!t.some(x => x != null)) return null;
    return t.map((x, i) => (x != null ? x : items[i])).join(lang === 'ar' ? '، ' : ', ');
  }

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
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  };
  sc.onerror = () => { toon(); document.addEventListener('DOMContentLoaded', keuze); };
  document.head.append(sc);
})();
