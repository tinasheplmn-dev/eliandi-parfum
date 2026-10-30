/* ═══════════════════════════════════════════════════════════════
   ELIANDI GEURWIJZER — quizflow, matching en resultaat
   Matcht antwoorden op de volledige catalogus (js/catalog.js).
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  /* Vul hier de webhook-URL in (bijv. n8n) om leads + profielen
     door te sturen naar het CRM. Leeg = alleen lokaal bewaren. */
  const LEAD_WEBHOOK = '';

  /* Getoonde prijzen. De echte afrekenbedragen staan server-side in
     api/checkout.js (env DISCOVERY_PRICE_CENTS / SUBSCRIPTION_PRICE_CENTS);
     houd beide gelijk. De Geurreis verzendt per kwartaal, in de eerste
     week van januari, april, juli en oktober. */
  const DISCOVERY_PRICE = '49,95';
  const SUBSCRIPTION_PRICE = '39,95';
  const SHIP_MONTHS = [0, 3, 6, 9]; // jan, apr, jul, okt (0-basis)

  /* Lanceringsaanbod: t/m deze datum worden de bonussen extra aangezet
     in de tekst. Leeg = geen urgentieregel. LET OP: alleen een echte
     einddatum gebruiken die Angelo ook echt hanteert; neppe deadlines
     zijn verboden en slopen het merk. */
  const OFFER_DEADLINE = '2026-09-30';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Wat Angelo in het dashboard aanpast: eigen parfums, prijzen, verborgen. */
  fetch('/api/products', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(d => {
    if (!d) return;

    /* De Geurreis alleen tonen als er ook echt periodiek afgeschreven
       kan worden; anders blijft alleen de eenmalige set staan. */
    if (d.abonnement === false) {
      state.plan = 'once';
      const sub = $('planSub');
      if (sub) { sub.hidden = true; sub.setAttribute('aria-hidden', 'true'); }
      const plans = document.querySelector('.qd-plans');
      if (plans) plans.classList.add('qd-plans-solo');
      if (state.results) renderOffer();
    }

    if (typeof ELIANDI_CATALOG === 'undefined') return;
    const ov = d.overrides || {};
    for (let i = ELIANDI_CATALOG.length - 1; i >= 0; i--) {
      const p = ELIANDI_CATALOG[i], o = ov[p.n];
      if (!o) continue;
      if (o.hidden) { ELIANDI_CATALOG.splice(i, 1); continue; }
      if (o.v) { p.v = o.v; const ps = o.v.filter(Boolean); p.p = ps.length ? Math.min(...ps) : p.p; }
    }
    const names = new Set(ELIANDI_CATALOG.map(p => p.n));
    (d.custom || []).forEach(p => { if (!names.has(p.n)) ELIANDI_CATALOG.push(p); });
  }).catch(() => {});

  /* ─────────────────── De tien vragen ───────────────────
     w = gewichten op geurdimensies uit de catalogus
     scalars: warm (w), sweet (s), intens (x), avond (o)
     chip = kort label voor het geurprofiel op de resultaatpagina */
  const QUESTIONS = [
    {
      title: 'Voor wie zoeken we een parfum?',
      hint: '',
      key: 'gender',
      media: true,
      options: [
        { t: 'Voor een vrouw', d: 'Dames- en unisexgeuren', img: 'gender-vrouw', gender: ['dames', 'unisex'], chip: null },
        { t: 'Voor een man', d: 'Heren- en unisexgeuren', img: 'gender-man', gender: ['heren', 'unisex'], chip: null },
        { t: 'Verras me', d: 'De hele collectie, zonder hokjes', img: 'gender-verras', gender: null, chip: null },
      ],
    },
    {
      title: 'Wanneer draag je parfum het vaakst?',
      hint: '',
      media: true,
      options: [
        { t: 'Elke dag', d: 'Van ochtend tot avond, als tweede huid', img: 'moment-elke-dag', o: -2, x: -0.5, chip: 'Dagelijks' },
        { t: 'Op mijn werk', d: 'Aanwezig, maar nooit opdringerig', img: 'moment-werk', o: -1, x: -1, chip: 'Werk' },
        { t: 'Avonden en uitgaan', d: 'Als de lichten dimmen', img: 'moment-avond', o: 2, x: 1, chip: 'Avond' },
        { t: 'Speciale gelegenheden', d: 'Momenten die je wilt onthouden', img: 'moment-gelegenheid', o: 2, x: 0.5, w: { amber: 1 }, chip: 'Speciale momenten' },
      ],
    },
    {
      title: 'Welke sfeer voelt als thuiskomen?',
      hint: '',
      media: true,
      options: [
        { t: 'Winteravond bij de open haard', d: 'Warm, knus en goud van licht', img: 'sfeer-haard', warm: 2, w: { amber: 1, vanille: 1 }, chip: 'Warm & knus' },
        { t: 'Zomeravond aan de kust', d: 'Zeelucht, linnen en een lage zon', img: 'sfeer-kust', warm: -2, w: { fris: 2 }, chip: 'Fris & licht' },
        { t: 'Metropool bij nacht', d: 'Neonlicht, rooftops en energie', img: 'sfeer-metropool', x: 1, w: { musk: 1, hout: 0.5 }, o: 1, chip: 'Urban' },
        { t: 'Oosterse markt vol specerijen', d: 'Kleur, geur en duizend verhalen', img: 'sfeer-markt', warm: 1, w: { kruidig: 2, oud: 1 }, chip: 'Oosters' },
      ],
    },
    {
      title: 'Kies de stad die jou inspireert.',
      hint: '',
      media: true,
      options: [
        { t: 'Dubai', d: 'Goud, oud en grandeur', img: 'stad-dubai', w: { oud: 2, amber: 1 }, x: 1, chip: 'Dubai' },
        { t: 'Parijs', d: 'Bloemen, chic en poederzacht', img: 'stad-parijs', w: { bloemig: 2, poederig: 1 }, chip: 'Parijs' },
        { t: 'Amsterdam', d: 'Nuchter, fris en tijdloos', img: 'stad-amsterdam', w: { fris: 1.5, hout: 1 }, chip: 'Amsterdam' },
        { t: 'Milaan', d: 'Stijlvol, verfijnd, op maat gesneden', img: 'stad-milaan', w: { musk: 1, hout: 1, bloemig: 0.5 }, chip: 'Milaan' },
        { t: 'Marrakech', d: 'Specerijen en avondwarmte', img: 'stad-marrakech', warm: 1, w: { kruidig: 2, amber: 0.5 }, chip: 'Marrakech' },
        { t: 'New York', d: 'Gedurfd en onmiskenbaar aanwezig', img: 'stad-newyork', x: 1.5, w: { leer: 1, hout: 0.5 }, chip: 'New York' },
      ],
    },
    {
      title: 'Welke noten trekken jou aan?',
      hint: 'Meerdere antwoorden mogelijk',
      multi: true,
      media: true,
      options: [
        { t: 'Oud en donker hout', d: 'Diep, rijk, onvergetelijk', img: 'noot-oud', w: { oud: 3, hout: 2 }, chip: 'Oud & hout' },
        { t: 'Vanille en zoet', d: 'Karamel, honing, gourmand', img: 'noot-vanille', w: { vanille: 3, gourmand: 2 }, sweet: 1.5, chip: 'Vanille & zoet' },
        { t: 'Bloemen', d: 'Roos, jasmijn, oranjebloesem', img: 'noot-bloemen', w: { bloemig: 3 }, chip: 'Bloemig' },
        { t: 'Fris en citrus', d: 'Bergamot, limoen, zeelucht', img: 'noot-fris', w: { fris: 3 }, warm: -1, chip: 'Fris & citrus' },
        { t: 'Specerijen', d: 'Saffraan, kaneel, kardemom', img: 'noot-specerijen', w: { kruidig: 3 }, chip: 'Kruidig' },
        { t: 'Fruit', d: 'Framboos, perzik, ananas', img: 'noot-fruit', w: { fruitig: 3 }, chip: 'Fruitig' },
        { t: 'Musk en huidgeur', d: 'Zacht, intiem, dicht op de huid', img: 'noot-musk', w: { musk: 3, poederig: 1 }, chip: 'Musk' },
        { t: 'Amber en warmte', d: 'Gouden gloed die blijft', img: 'noot-amber', w: { amber: 3 }, warm: 1, chip: 'Amber' },
      ],
    },
    {
      title: 'Hoe zoet mag jouw parfum zijn?',
      hint: '',
      media: true,
      options: [
        { t: 'Heerlijk zoet', d: 'Vanille en gourmand mogen schitteren', img: 'zoet-vol', sweet: 3.5, chip: 'Zoet' },
        { t: 'Een zachte zoete rand', d: 'Zoet als accent, niet als hoofdrol', img: 'zoet-zacht', sweet: 1.5, chip: 'Licht zoet' },
        { t: 'Liever niet zoet', d: 'Houd het droog, fris of kruidig', img: 'zoet-niet', sweet: 0, chip: 'Niet zoet' },
      ],
    },
    {
      title: 'In welk seizoen moet hij schitteren?',
      hint: '',
      media: true,
      options: [
        { t: 'Lente', d: 'Bloesem en nieuw begin', img: 'seizoen-lente', warm: -1, w: { bloemig: 1.5, fris: 1 }, chip: 'Lente' },
        { t: 'Zomer', d: 'Zon op de huid', img: 'seizoen-zomer', warm: -2, w: { fris: 2, fruitig: 1 }, chip: 'Zomer' },
        { t: 'Herfst', d: 'Goudbruin en kruidig', img: 'seizoen-herfst', warm: 1, w: { hout: 1.5, kruidig: 1 }, chip: 'Herfst' },
        { t: 'Winter', d: 'Koude lucht, warme geur', img: 'seizoen-winter', warm: 2, w: { amber: 1.5, vanille: 1 }, chip: 'Winter' },
      ],
    },
    {
      title: 'Hoe aanwezig mag je geur zijn?',
      hint: '',
      media: true,
      options: [
        { t: 'Subtiel, dicht op de huid', d: 'Alleen wie dichtbij komt, weet het', img: 'aanwezig-subtiel', x: -2, chip: 'Subtiel' },
        { t: 'Merkbaar, met mate', d: 'Een spoor dat nieuwsgierig maakt', img: 'aanwezig-merkbaar', x: 0.5, chip: 'Gebalanceerd' },
        { t: 'Een statement', d: 'De kamer weet dat jij er bent', img: 'aanwezig-statement', x: 2.5, w: { oud: 0.5 }, chip: 'Statement' },
      ],
    },
    {
      title: 'Hoe wil je herinnerd worden?',
      hint: '',
      media: true,
      options: [
        { t: 'Mysterieus', d: 'Een raadsel dat blijft hangen', img: 'stijl-mysterieus', w: { oud: 1, leer: 1 }, o: 1, chip: 'Mysterieus' },
        { t: 'Warm en hartelijk', d: 'Als een omhelzing', img: 'stijl-warm', w: { vanille: 1, amber: 1 }, warm: 1, chip: 'Warm' },
        { t: 'Elegant en verfijnd', d: 'Tijdloos, tot in de details', img: 'stijl-elegant', w: { bloemig: 1, musk: 1, poederig: 0.5 }, chip: 'Elegant' },
        { t: 'Gedurfd en eigenzinnig', d: 'Niemand anders ruikt zoals jij', img: 'stijl-gedurfd', w: { kruidig: 1, leer: 0.5 }, x: 1, chip: 'Gedurfd' },
      ],
    },
    {
      title: 'Hoe goed ken je de wereld van parfum?',
      hint: '',
      media: true,
      options: [
        { t: 'Dit wordt mijn eerste echte parfum', d: 'We beginnen toegankelijk en raak', img: 'kennis-eerste', w: { fris: 0.5, musk: 0.5, fruitig: 0.5 }, x: -0.5, chip: null },
        { t: 'Ik heb er een paar staan', d: 'Je weet wat je lekker vindt', img: 'kennis-paar', chip: null },
        { t: 'Ik verzamel geuren', d: 'Verras me met iets bijzonders', img: 'kennis-verzamelaar', w: { oud: 1 }, x: 0.5, chip: 'Kenner' },
      ],
    },
  ];

  /* ─────────────────── Zinnen voor de onderbouwing ─────────────────── */
  const DIM_PHRASE = {
    oud: 'de diepe oud- en houttonen waar jij voor koos',
    hout: 'de warme houtnoten uit jouw profiel',
    vanille: 'de zachte vanille die jij aantrekkelijk vindt',
    gourmand: 'de zoete gourmandrand die jij zocht',
    bloemig: 'de bloemige signatuur die jij koos',
    fris: 'de frisse, sprankelende opening die bij jou past',
    kruidig: 'de specerijen met karakter uit jouw antwoorden',
    musk: 'de fluwelen muskbasis die jij mooi vindt',
    fruitig: 'de speelse fruitnoten die jij noemde',
    amber: 'de gouden amberwarmte waar jij van houdt',
    poederig: 'de poederzachte afdronk die jou past',
    leer: 'de rokerige, mysterieuze rand die jij zocht',
  };

  /* ─────────────────── State ─────────────────── */
  const state = {
    qIndex: 0,
    answers: QUESTIONS.map(() => new Set()),
    results: null,
    profileChips: [],
  };

  const $ = id => document.getElementById(id);
  const screens = {
    intro: $('screenIntro'),
    question: $('screenQuestion'),
    analyse: $('screenAnalyse'),
    lead: $('screenLead'),
    results: $('screenResults'),
  };

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('is-active', 'is-entering'));
    const el = screens[name];
    el.classList.add('is-active');
    if (!prefersReduced) {
      requestAnimationFrame(() => el.classList.add('is-entering'));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('qprogress').classList.toggle('is-visible', name === 'question');
  }

  /* ─────────────────── Vragenflow ─────────────────── */
  function renderQuestion() {
    const q = QUESTIONS[state.qIndex];
    $('qqCount').textContent = `Vraag ${state.qIndex + 1} van ${QUESTIONS.length}`;
    $('qqTitle').textContent = q.title;
    $('qqHint').textContent = q.hint || '';
    $('qprogressBar').style.transform = `scaleX(${state.qIndex / QUESTIONS.length})`;

    const box = $('qqOptions');
    box.innerHTML = '';
    // kolommen zo kiezen dat elke rij vol is: 8 -> 4, 6/3 -> 3, 4 -> 2
    const n = q.options.length;
    const cols = n % 4 === 0 && n > 4 ? 4 : n % 3 === 0 ? 3 : 2;
    box.className = 'qq-options'
      + (q.media ? ' is-media' : '')
      + ` cols-${cols}`
      + (n % 2 === 1 ? ' modd' : '');
    q.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qopt' + (q.media ? ' has-media' : '');
      if (q.media) {
        // beeldkaart: foto als hij bestaat, anders een stijlvolle ornament-fallback
        b.innerHTML = `
          <span class="qopt-media">
            <span class="qopt-fallback" aria-hidden="true">${opt.t.charAt(0)}</span>
            <img src="assets/quiz/${opt.img}.webp" alt="" decoding="async"
                 onerror="this.remove()">
            <span class="qopt-check" aria-hidden="true">&#10003;</span>
          </span>
          <span class="qopt-body"><strong>${opt.t}</strong>${opt.d ? `<small>${opt.d}</small>` : ''}</span>`;
      } else {
        b.innerHTML = `<strong>${opt.t}</strong>` + (opt.d ? `<small>${opt.d}</small>` : '');
      }
      if (state.answers[state.qIndex].has(i)) b.classList.add('is-selected');
      b.addEventListener('click', () => pickOption(i, b));
      box.appendChild(b);
    });

    // vangnet: blijft er een halve rij over, vul aan met de winkelkaart
    if (q.media && n % cols !== 0) {
      const fill = cols - (n % cols);
      for (let f = 0; f < fill; f++) {
        const a = document.createElement('a');
        a.className = 'qopt has-media qopt-visit';
        a.href = 'index.html#bezoek';
        a.innerHTML = `
          <span class="qopt-media">
            <span class="qopt-fallback" aria-hidden="true">E</span>
            <img src="assets/parfumeur-lachend-geurwaaier.webp" alt="" decoding="async"
                 onerror="this.remove()">
          </span>
          <span class="qopt-body"><strong>Liever een andere geur?</strong><small>Maak een afspraak in de winkel</small></span>`;
        box.appendChild(a);
      }
    }

    $('btnBack').disabled = false;
    updateNext();
    showScreen('question');
  }

  function pickOption(i, btnEl) {
    const q = QUESTIONS[state.qIndex];
    const sel = state.answers[state.qIndex];
    if (q.multi) {
      if (sel.has(i)) { sel.delete(i); btnEl.classList.remove('is-selected'); }
      else { sel.add(i); btnEl.classList.add('is-selected'); }
      updateNext();
    } else {
      sel.clear();
      sel.add(i);
      [...$('qqOptions').children].forEach((c, j) => c.classList.toggle('is-selected', j === i));
      setTimeout(next, prefersReduced ? 0 : 380);
    }
  }

  function updateNext() {
    const q = QUESTIONS[state.qIndex];
    const has = state.answers[state.qIndex].size > 0;
    $('btnNext').classList.toggle('is-visible', Boolean(q.multi && has));
  }

  function next() {
    saveAnswers();
    if (state.qIndex < QUESTIONS.length - 1) {
      state.qIndex += 1;
      renderQuestion();
    } else {
      $('qprogressBar').style.transform = 'scaleX(1)';
      runAnalyse();
    }
  }

  /* antwoorden bewaren, zodat terugkeren vanaf de betaalpagina
     (annuleren bij Stripe) het resultaat niet weggooit */
  function saveAnswers() {
    try {
      sessionStorage.setItem('eliandi_quiz_answers',
        JSON.stringify(state.answers.map(s => [...s])));
    } catch (e) { /* privémodus */ }
  }

  function back() {
    if (state.qIndex === 0) { showScreen('intro'); return; }
    state.qIndex -= 1;
    renderQuestion();
  }

  /* ─────────────────── Matching-engine ─────────────────── */
  function buildProfile() {
    const dims = {};
    let warm = 0, warmN = 0, sweet = null, x = 0, xN = 0, o = 0, oN = 0;
    let genders = null;
    const chips = [];

    QUESTIONS.forEach((q, qi) => {
      state.answers[qi].forEach(oi => {
        const opt = q.options[oi];
        if (opt.gender !== undefined) genders = opt.gender;
        if (opt.w) for (const [d, v] of Object.entries(opt.w)) dims[d] = (dims[d] || 0) + v;
        if (opt.warm !== undefined) { warm += opt.warm; warmN += 1; }
        if (opt.sweet !== undefined) sweet = sweet === null ? opt.sweet : Math.max(sweet, opt.sweet);
        if (opt.x !== undefined) { x += opt.x; xN += 1; }
        if (opt.o !== undefined) { o += opt.o; oN += 1; }
        if (opt.chip) chips.push(opt.chip);
      });
    });

    return {
      dims,
      genders,
      warm: warmN ? Math.max(-3, Math.min(3, warm / Math.max(1, warmN * 0.6))) : 0,
      sweet: sweet === null ? null : sweet,
      x: xN ? Math.max(-2, Math.min(3, x / Math.max(1, xN * 0.55))) : 0,
      o: oN ? Math.max(-2, Math.min(3, o / Math.max(1, oN * 0.55))) : 0,
      chips: [...new Set(chips)],
    };
  }

  function scoreProduct(p, u) {
    // cosinus-gelijkenis op geurdimensies
    let dot = 0, uSq = 0, pSq = 0;
    const contributions = {};
    const allDims = new Set([...Object.keys(u.dims), ...Object.keys(p.d || {})]);
    allDims.forEach(d => {
      const uv = u.dims[d] || 0;
      const pv = (p.d && p.d[d]) || 0;
      dot += uv * pv;
      uSq += uv * uv;
      pSq += pv * pv;
      if (uv && pv) contributions[d] = uv * pv;
    });
    const cos = (uSq && pSq) ? dot / (Math.sqrt(uSq) * Math.sqrt(pSq)) : 0;

    let score = cos * 10;
    score += Math.max(-2.2, 2.2 - Math.abs(u.warm - (p.w || 0)) * 0.75);
    if (u.sweet !== null) score += Math.max(-2, 1.8 - Math.abs(u.sweet - (p.s || 0)) * 0.8);
    score += Math.max(-1.6, 1.5 - Math.abs(u.x - (p.x || 0)) * 0.55);
    score += Math.max(-1.3, 1.2 - Math.abs(u.o - (p.o || 0)) * 0.45);

    return { score, cos, contributions };
  }

  function computeResults() {
    const u = buildProfile();
    state.profileChips = u.chips;

    let pool = ELIANDI_CATALOG;
    if (u.genders) pool = pool.filter(p => u.genders.includes(p.g));

    const scored = pool.map(p => ({ p, ...scoreProduct(p, u) }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 5);

    const best = top[0] ? top[0].score : 1;
    top.forEach((r, i) => {
      let pct = 97 - Math.round((best - r.score) * 2.5) - i;
      r.pct = Math.max(78, Math.min(97, pct));
    });
    // strikt aflopend
    for (let i = 1; i < top.length; i++) {
      if (top[i].pct >= top[i - 1].pct) top[i].pct = top[i - 1].pct - 1;
    }

    state.results = { u, top };
  }

  function reasonsFor(r, u, rank) {
    const dims = Object.entries(r.contributions).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const parts = [];
    if (dims[0] && DIM_PHRASE[dims[0]]) parts.push(DIM_PHRASE[dims[0]]);
    if (dims[1] && DIM_PHRASE[dims[1]]) parts.push(DIM_PHRASE[dims[1]]);

    const openers = [
      'Hier komen %s samen.',
      'Deze geur draagt precies %s.',
      'Gebouwd rond %s.',
      'In dit flesje vind je %s terug.',
      'Een compositie van %s.',
    ];
    let s1;
    if (parts.length === 2) {
      s1 = openers[rank % openers.length].replace('%s', parts[0] + ' en ' + parts[1]);
    } else if (parts.length === 1) {
      s1 = openers[rank % openers.length].replace('%s', parts[0]);
    } else {
      s1 = 'Deze geur sluit in karakter het dichtst aan op jouw antwoorden.';
    }

    let s2 = '';
    const p = r.p;
    if (u.o > 0.8 && (p.o || 0) >= 2) s2 = 'Gemaakt voor avonden en bijzondere momenten, precies zoals jij hem wilt dragen.';
    else if (u.o < -0.8 && (p.o || 0) <= 0) s2 = 'Licht genoeg om elke dag te dragen, zoals jij aangaf.';
    else if (u.warm >= 1 && (p.w || 0) >= 1) s2 = 'Met de warmte die jij zoekt voor koude dagen en avonden.';
    else if (u.warm <= -1 && (p.w || 0) <= 0) s2 = 'Fris en licht, zoals jij hem het liefst draagt.';
    else if (u.x >= 1.5 && (p.x || 0) >= 2) s2 = 'En hij laat een spoor achter dat niemand ontgaat.';
    else if (u.x <= -1 && (p.x || 0) <= 0) s2 = 'Subtiel aanwezig, dicht op de huid.';

    return s1 + (s2 ? ' ' + s2 : '');
  }

  /* ─────────────────── Analyse-scherm ─────────────────── */
  function runAnalyse() {
    showScreen('analyse');
    const status = $('qaStatus');
    const lines = [
      'Je antwoorden worden gelezen…',
      `Jouw profiel wordt gewogen tegen ${ELIANDI_CATALOG.length} geuren…`,
      'Jouw selectie staat klaar.',
    ];
    computeResults();
    if (prefersReduced) { showScreen('lead'); return; }
    let i = 0;
    const step = () => {
      if (i >= lines.length) { showScreen('lead'); return; }
      status.style.opacity = 0;
      setTimeout(() => {
        status.textContent = lines[i];
        status.style.opacity = 1;
        i += 1;
        setTimeout(step, 1150);
      }, 300);
    };
    step();
  }

  /* ─────────────────── Lead-capture ─────────────────── */
  function submitLead(name, email, phone, consent) {
    const payload = {
      source: 'eliandi-geurwijzer',
      name, email, phone, consent,
      profile: state.profileChips,
      top5: state.results.top.map(r => r.p.n),
      answers: QUESTIONS.map((q, i) => ({
        q: q.title,
        a: [...state.answers[i]].map(oi => q.options[oi].t),
      })),
      ts: new Date().toISOString(),
      page: location.href,
    };
    try {
      const log = JSON.parse(localStorage.getItem('eliandi_leads') || '[]');
      log.push(payload);
      localStorage.setItem('eliandi_leads', JSON.stringify(log.slice(-50)));
    } catch (e) { /* privémodus */ }
    if (LEAD_WEBHOOK) {
      fetch(LEAD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  }

  /* ─────────────────── Essence-visual per parfum ───────────────────
     Geen echte flesfoto's in de catalogus; elke geur krijgt een
     flacon-silhouet met een gloed in de kleur van zijn dominante
     geurdimensie. Eerlijk en consistent over de hele collectie. */
  const DIM_COLOR = {
    oud:      ['#7a5024', '#2e1f10'],
    hout:     ['#8a6132', '#332412'],
    vanille:  ['#d9b26a', '#6e4c1e'],
    gourmand: ['#c9944a', '#5e3a14'],
    bloemig:  ['#c9909c', '#5e3440'],
    fris:     ['#9fb8a4', '#31473a'],
    kruidig:  ['#b06a32', '#4a2810'],
    musk:     ['#cbb9a0', '#57493a'],
    fruitig:  ['#c97f6a', '#5c2f24'],
    amber:    ['#d4a73c', '#6e4a10'],
    poederig: ['#cfc0ae', '#5a5044'],
    leer:     ['#6e4a3a', '#241511'],
  };

  /* De echte productfoto van 50 ml (dezelfde als in de shop): per doelgroep
     een eigen flacon, zie api/_fotos.json. Ontbreekt het beeld, of heeft
     een zelf toegevoegde geur geen doelgroep, dan valt de kaart terug op
     het getekende flacon-silhouet. */
  function bottleVisual(p, groot) {
    if (!['dames', 'heren', 'unisex'].includes(p.g)) return bottleSVG(p);
    return `
      <img class="qr-mock" src="assets/producten/${p.g}-50ml${groot ? '' : '-600'}.webp" alt="${String(p.n).replace(/"/g, '&quot;')}, 50 ml"
           decoding="async" onerror="this.remove()">${bottleSVG(p)}`;
  }

  let gradSeq = 0;
  function bottleSVG(p) {
    const dims = Object.entries(p.d || {}).sort((a, b) => b[1] - a[1]);
    const key = (dims[0] && DIM_COLOR[dims[0][0]]) ? dims[0][0] : 'amber';
    const [c1, c2] = DIM_COLOR[key];
    const id = 'ess' + (gradSeq += 1);
    return `
      <svg class="qr-bottle" viewBox="0 0 120 170" aria-hidden="true">
        <defs>
          <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${c1}"/>
            <stop offset="1" stop-color="${c2}"/>
          </linearGradient>
          <radialGradient id="${id}g" cx="0.5" cy="0.35" r="0.75">
            <stop offset="0" stop-color="${c1}" stop-opacity=".55"/>
            <stop offset="1" stop-color="${c1}" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <ellipse cx="60" cy="92" rx="56" ry="66" fill="url(#${id}g)"/>
        <rect x="49" y="12" width="22" height="12" rx="2.5" fill="#b8860b"/>
        <rect x="52.5" y="24" width="15" height="9" rx="1.5" fill="#8a6a28"/>
        <path d="M40 45 C40 38 46 33 53 33 L67 33 C74 33 80 38 80 45 L82 128
                 C82 141 72 150 60 150 C48 150 38 141 38 128 Z"
              fill="url(#${id})" stroke="rgba(212,167,60,.55)" stroke-width="1.4"/>
        <path d="M46 42 C46 55 44 95 44 118" stroke="rgba(255,244,214,.35)"
              stroke-width="3.5" stroke-linecap="round" fill="none"/>
        <g fill="none" stroke="rgba(233,199,103,.8)" stroke-width="1.1">
          <circle cx="60" cy="92" r="14"/>
          <path d="M60 71 l4.5 12 12 4.5 -12 4.5 -4.5 12 -4.5 -12 -12 -4.5 12 -4.5 Z"/>
        </g>
      </svg>`;
  }

  function meterHTML(label, lo, hi, value, min, max) {
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return `
      <div class="qr-meter">
        <span class="qr-meter-label">${label}</span>
        <span class="qr-meter-ends"><i>${lo}</i><i>${hi}</i></span>
        <span class="qr-meter-track"><b style="left:${(t * 100).toFixed(0)}%"></b></span>
      </div>`;
  }

  function pyramidHTML(p) {
    const rows = [
      ['Topnoten', p.t], ['Hartnoten', p.h], ['Basisnoten', p.b],
    ].filter(r => r[1] && r[1].length);
    if (!rows.length) return '';
    return `<div class="qr-pyramid">` + rows.map(([lbl, notes]) => `
      <div class="qr-pyr-row">
        <span class="qr-pyr-label">${lbl}</span>
        <span class="qr-pyr-notes">${notes.slice(0, 4).map(n => `<i>${n}</i>`).join('')}</span>
      </div>`).join('') + `</div>`;
  }

  function profileSentence(u) {
    const bits = [];
    if (u.warm >= 1) bits.push('warm');
    else if (u.warm <= -1) bits.push('fris');
    if (u.dims.oud || u.dims.kruidig) bits.push('oosters getint');
    else if (u.dims.bloemig >= 2) bits.push('bloemig');
    if (u.o >= 1) bits.push('gemaakt voor de avond');
    else if (u.o <= -1) bits.push('licht genoeg voor elke dag');
    if (u.x >= 1.5) bits.push('met een spoor dat blijft');
    if (!bits.length) return 'Dit is jouw geurprofiel, gewogen over de hele collectie.';
    if (bits.length === 1) return `Jouw signatuur is ${bits[0]}.`;
    return `Jouw signatuur is ${bits.slice(0, -1).join(', ')} en ${bits[bits.length - 1]}.`;
  }

  /* ─────────────────── Bestellen per parfum ───────────────────
     p.v = prijzen [30, 50, 100 ml]; null = niet leverbaar. */
  const ML = [30, 50, 100];
  const euro = n => '€' + n.toFixed(2).replace('.', ',');

  function buyHTML(p, preferIdx) {
    const v = p.v || [];
    if (!v.some(Boolean)) return '';
    const sel = v[preferIdx] ? preferIdx : v.findIndex(Boolean);
    return `
      <div class="qr-buy">
        <div class="qr-sizes" role="radiogroup" aria-label="Kies een maat">
          ${ML.map((ml, k) => `<button type="button" class="qr-size${k === sel ? ' is-selected' : ''}"
             data-k="${k}" ${v[k] ? '' : 'disabled'} role="radio" aria-checked="${k === sel}">
             ${ml} ml<small>${v[k] ? euro(v[k]) : 'n.v.t.'}</small></button>`).join('')}
        </div>
        <button type="button" class="btn btn-gold qr-add">In winkelmand</button>
      </div>`;
  }

  function wireBuy(card, p) {
    const box = card.querySelector('.qr-buy');
    if (!box) return;
    box.addEventListener('click', e => {
      const size = e.target.closest('.qr-size');
      if (size && !size.disabled) {
        box.querySelectorAll('.qr-size').forEach(b => {
          b.classList.toggle('is-selected', b === size);
          b.setAttribute('aria-checked', b === size);
        });
        return;
      }
      const add = e.target.closest('.qr-add');
      if (!add || !window.EliandiCart) return;
      const k = +box.querySelector('.qr-size.is-selected').dataset.k;
      window.EliandiCart.add(p.n, ML[k], p.v[k]);
      add.textContent = 'Toegevoegd ✓';
      add.classList.add('is-added');
      setTimeout(() => { add.textContent = 'In winkelmand'; add.classList.remove('is-added'); }, 1800);
    });
  }

  /* ─────────────────── Resultaat ─────────────────── */
  function renderResults() {
    const { u, top } = state.results;

    $('qrTitle').innerHTML = `Vijf geuren die bij jou horen.`;
    $('qrSentence').textContent = profileSentence(u);

    const prof = $('qrProfile');
    prof.innerHTML = '';
    state.profileChips.forEach(c => {
      const s = document.createElement('span');
      s.className = 'qr-chip';
      s.textContent = c;
      prof.appendChild(s);
    });

    const list = $('qrList');
    list.innerHTML = '';
    top.forEach((r, i) => {
      const p = r.p;
      const card = document.createElement('article');
      card.className = 'qr-card' + (i === 0 ? ' is-first' : '');

      const fams = (p.f && p.f.length) ? p.f.slice(0, 4).join(' · ') : '';
      const meta = [
        'Extrait de parfum',
        p.g === 'unisex' ? 'Unisex' : p.g === 'dames' ? 'Voor haar' : 'Voor hem',
        fams,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');

      if (i === 0) {
        card.innerHTML = `
          <span class="qr-badge">Jouw signatuur &middot; ${r.pct}% match</span>
          <div class="qr-hero">
            <div class="qr-hero-visual">${bottleVisual(p, true)}</div>
            <div class="qr-hero-body">
              <h3 class="qr-name">${p.n}</h3>
              <p class="qr-meta">${meta}</p>
              ${p.i ? `<p class="qr-intro">${p.i}</p>` : ''}
              <div class="qr-why"><p>${reasonsFor(r, u, i)}</p></div>
              ${pyramidHTML(p)}
              <div class="qr-meters">
                ${meterHTML('Aanwezigheid', 'subtiel', 'statement', p.x || 0, -2, 4)}
                ${meterHTML('Karakter', 'fris', 'warm', p.w || 0, -3, 3)}
                ${meterHTML('Moment', 'overdag', 'avond', p.o || 0, -2, 3)}
              </div>
              ${buyHTML(p, 1)}
            </div>
          </div>`;
      } else {
        const noteLine = [];
        if (p.t && p.t.length) noteLine.push(`<b>Top</b> ${p.t.slice(0, 3).join(', ')}`);
        if (p.h && p.h.length) noteLine.push(`<b>Hart</b> ${p.h.slice(0, 3).join(', ')}`);
        if (p.b && p.b.length) noteLine.push(`<b>Basis</b> ${p.b.slice(0, 3).join(', ')}`);
        card.innerHTML = `
          <div class="qr-side-visual">${bottleVisual(p)}</div>
          <div class="qr-side-body">
            <div class="qr-rank">nr. ${i + 1} &middot; ${r.pct}% match</div>
            <h3 class="qr-name">${p.n}</h3>
            <p class="qr-meta">${meta}</p>
            <div class="qr-why"><p>${reasonsFor(r, u, i)}</p></div>
            ${noteLine.length ? `<p class="qr-notes">${noteLine.join(' &nbsp;·&nbsp; ')}</p>` : ''}
            ${buyHTML(p, 1)}
          </div>`;
      }
      wireBuy(card, p);
      list.appendChild(card);
    });

    // bewaar het resultaat voor de bedankpagina en terugkeer na afrekenen
    try {
      localStorage.setItem('eliandi_last_result', JSON.stringify({
        top5: top.map(r => r.p.n),
        profile: state.profileChips,
        ts: new Date().toISOString(),
      }));
    } catch (e) { /* privémodus */ }

    showScreen('results'); if (window.EliandiMeet) window.EliandiMeet.eens('geurwijzer-klaar');
  }

  /* ─────────────────── Het aanbod (eenmalig of De Geurreis) ───────────────────
     Opgebouwd volgens het Godfather Offer-principe: reden voor het
     aanbod, waardestapel met bonussen, omgekeerd risico (garantie),
     echte schaarste (handwerk) en een echte einddatum voor de bonussen. */
  state.plan = 'once';

  const STACK_ONCE = [
    '5 × 10 ml uit jouw geurprofiel',
    'Gesigneerde gouden doos',
    '€10 flacontegoed',
    'Gesigneerde geurprofielkaart',
  ];
  const STACK_SUB = [
    'Elk kwartaal 5 nieuwe geuren',
    '€10 voordeel + gratis verzending',
    '€10 flacontegoed per doos',
    'Altijd opzegbaar na doos één',
  ];

  function renderOffer() {
    const once = state.plan === 'once';
    $('planOnce').classList.toggle('is-selected', once);
    $('planOnce').setAttribute('aria-checked', once);
    $('planSub').classList.toggle('is-selected', !once);
    $('planSub').setAttribute('aria-checked', !once);
    $('planOncePrice').innerHTML = `€${DISCOVERY_PRICE}`;
    $('planSubPrice').innerHTML = `€${SUBSCRIPTION_PRICE} <small>p/kwartaal</small>`;

    const stack = once ? STACK_ONCE : STACK_SUB;
    $('qdUsps').innerHTML = stack.map(t =>
      `<li><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z"/></svg><span>${t}</span></li>`
    ).join('');

    // schaarste: de actie is tijdelijk, met een echte einddatum
    const urg = $('qdUrgency');
    if (OFFER_DEADLINE) {
      const end = new Date(OFFER_DEADLINE + 'T23:59:59');
      if (end >= new Date()) {
        const dat = end.toLocaleDateString(window.ELIANDI_LOCALE || 'nl-NL', { day: 'numeric', month: 'long' });
        urg.textContent = `Lanceringsactie, loopt t/m ${dat}.`;
        urg.hidden = false;
      } else { urg.hidden = true; }
    } else { urg.hidden = true; }

    $('btnOrderSet').textContent = once
      ? `Bestel jouw Discovery Set · €${DISCOVERY_PRICE}`
      : `Start De Geurreis · €${SUBSCRIPTION_PRICE} p/kwartaal`;

    /* wisselt hij van formule, dan klopt het totaal onder het adres weer */
    if (!$('qdAdres').hidden) toonAdres();

    /* De Geurreis is een abonnement en kan dus niet in de winkelmand */
    const toCart = $('btnSetToCart');
    if (toCart) {
      toCart.hidden = !once;
      if (once) { toCart.textContent = 'Zet in de winkelmand'; toCart.classList.remove('is-done'); }
    }
  }

  /* Echte aflopende timer: vandaag besteld = zesde sample cadeau.
     Telt af naar middernacht (lokale tijd van de bezoeker). */
  function startBonusTimer() {
    const clock = $('qdTimer');
    if (!clock) return;
    const pad = n => String(n).padStart(2, '0');
    const tick = () => {
      const now = new Date();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
      let s = Math.max(0, Math.floor((end - now) / 1000));
      const h = Math.floor(s / 3600); s -= h * 3600;
      const m = Math.floor(s / 60); s -= m * 60;
      clock.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
    };
    tick();
    setInterval(tick, 1000);
  }
  startBonusTimer();

  $('planOnce').addEventListener('click', () => { state.plan = 'once'; renderOffer(); });
  $('planSub').addEventListener('click', () => { state.plan = 'sub'; renderOffer(); });

  /* ─────────────────── Afrekenen ───────────────────
     Eerst het bezorgadres, want de doos moet ergens heen. Pas als dat
     er staat, gaan we naar de betaalpagina. */
  const VERZENDING = 4.95;

  function toonAdres() {
    const vak = $('qdAdres');
    vak.hidden = false;
    const prijs = Number((state.plan === 'once' ? DISCOVERY_PRICE : SUBSCRIPTION_PRICE).replace(',', '.'));
    const verzend = state.plan === 'once' ? VERZENDING : 0;
    $('adrTotaal').innerHTML = verzend
      ? `Verzending €${VERZENDING.toFixed(2).replace('.', ',')}. Samen <b>€${(prijs + verzend).toFixed(2).replace('.', ',')}</b>.`
      : 'Verzending is bij de prijs inbegrepen.';
    $('btnOrderSet').textContent = 'Naar de betaling';
    $('adrStraat').focus();
  }

  function leesAdres() {
    const a = {
      street: $('adrStraat').value.trim(),
      postcode: $('adrPostcode').value.trim(),
      city: $('adrPlaats').value.trim(),
      country: $('adrLand').value,
    };
    if (!a.street || !a.postcode || !a.city) return { fout: 'Vul je volledige bezorgadres in.' };
    if (a.country === 'NL' && !/^\d{4}\s?[A-Za-z]{2}$/.test(a.postcode)) return { fout: 'Die postcode klopt nog niet.' };
    return { adres: a };
  }

  async function startCheckout() {
    const btn = $('btnOrderSet');
    const err = $('qdError');
    if (!state.results) return;

    if ($('qdAdres').hidden) { err.textContent = ''; return toonAdres(); }
    const { fout, adres } = leesAdres();
    if (fout) { err.textContent = fout; return; }
    state.adres = adres;
    btn.disabled = true;
    btn.textContent = 'Een moment…';
    err.textContent = '';
    try {
      const resp = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: state.plan,
          perfumes: state.results.top.map(r => r.p.n),
          profile: state.profileChips,
          address: state.adres,
          name: $('leadName') ? $('leadName').value.trim() : '',
          email: $('leadEmail') ? $('leadEmail').value.trim() : '',
          phone: $('leadPhone') ? $('leadPhone').value.trim() : '',
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.url) throw new Error(data.error || 'geen url');
      window.location.href = data.url;
    } catch (e) {
      err.textContent = 'Het afrekenen kon niet worden gestart. Probeer het opnieuw, of bestel via de winkel.';
      btn.disabled = false;
      renderOffer();
    }
  }

  /* ─────────────────── Events ─────────────────── */
  $('btnStart').addEventListener('click', () => { state.qIndex = 0; renderQuestion(); if (window.EliandiMeet) window.EliandiMeet.eens('geurwijzer'); });
  $('btnBack').addEventListener('click', back);
  $('btnNext').addEventListener('click', next);
  $('btnOrderSet').addEventListener('click', startCheckout);

  /* Discovery Set in de winkelmand, zodat hij samen met losse flacons
     in één keer afgerekend kan worden. De prijs hier is weergave; de
     server rekent opnieuw met DISCOVERY_PRICE_CENTS. */
  $('btnSetToCart').addEventListener('click', e => {
    if (!state.results || !window.EliandiCart) return;
    const perfumes = state.results.top.map(r => r.p.n);
    window.EliandiCart.add('Discovery Set', 10, Number(DISCOVERY_PRICE.replace(',', '.')), {
      kind: 'discovery', perfumes,
    });
    e.currentTarget.textContent = 'Staat in je winkelmand ✓';
    e.currentTarget.classList.add('is-done');
  });
  renderOffer();
  $('btnRestart').addEventListener('click', () => {
    state.qIndex = 0;
    state.answers = QUESTIONS.map(() => new Set());
    state.results = null;
    showScreen('intro');
  });

  $('leadForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('leadName').value.trim();
    const email = $('leadEmail').value.trim();
    const phone = $('leadPhone').value.trim();
    const consent = $('leadConsent').checked;
    const err = $('leadError');
    if (!name) { err.textContent = 'Vul je voornaam in, dan weten we wie we mogen verwelkomen.'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Dat e-mailadres lijkt nog niet te kloppen.'; return; }
    if (phone.replace(/\D/g, '').length < 10) { err.textContent = 'Vul een geldig telefoonnummer in.'; return; }
    if (!consent) { err.textContent = 'Vink even aan dat we je het profiel mogen sturen.'; return; }
    err.textContent = '';
    submitLead(name, email, phone, consent);
    renderResults();
  });

  /* Terug van een geannuleerde betaling: herstel het resultaat direct */
  (function restoreAfterCancel() {
    if (!new URLSearchParams(location.search).get('canceled')) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem('eliandi_quiz_answers') || 'null');
      if (!saved || saved.length !== QUESTIONS.length) return;
      state.answers = saved.map(arr => new Set(arr));
      computeResults();
      renderResults();
      history.replaceState(null, '', location.pathname);
    } catch (e) { /* privémodus */ }
  })();

  /* ─────────────────── Ambient goudnevel ─────────────────── */
  const canvas = $('qessence');
  if (!prefersReduced && canvas) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, parts = [];
    const make = fresh => ({
      x: Math.random() * W,
      y: fresh ? H + 15 : Math.random() * H,
      r: 0.7 + Math.random() * 1.8,
      vy: 0.1 + Math.random() * 0.25,
      drift: 0.3 + Math.random() * 0.8,
      ph: Math.random() * Math.PI * 2,
      sp: 0.003 + Math.random() * 0.005,
      a: 0.1 + Math.random() * 0.25,
      warm: Math.random() < 0.35,
    });
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts = Array.from({ length: Math.round(Math.min(W / 24, 56)) }, () => make(false));
    };
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.ph += p.sp * 16;
        p.y -= p.vy;
        p.x += Math.sin(p.ph) * p.drift * 0.3;
        if (p.y < -15) Object.assign(p, make(true));
        const a = p.a * (0.75 + Math.sin(p.ph * 1.7) * 0.25);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
        const c = p.warm ? '205,127,50' : '212,167,60';
        g.addColorStop(0, `rgba(${c},${a})`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(tick);
    };
    window.addEventListener('resize', resize, { passive: true });
    resize();
    requestAnimationFrame(tick);
  }
})();
