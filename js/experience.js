/* ELIANDI — The Experience: gezelschap, agenda, aanbetalen, cadeaubon */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const euro = c => '€' + (c / 100).toFixed(2).replace('.', ',');
  const euroKort = c => '€' + (c % 100 ? (c / 100).toFixed(2).replace('.', ',') : c / 100);
  const WOORD = { 1: 'Voor jezelf', 2: "Met z'n tweeën", 3: "Met z'n drieën", 4: "Met z'n vieren", 5: "Met z'n vijven", 6: "Met z'n zessen", 7: "Met z'n zevenen", 8: "Met z'n achten" };
  const state = { data: null, people: 1, giftPeople: 1, date: null, slot: null };

  /* ── sfeer: navigatie, reveals, goudstof ── */
  const nav = document.querySelector('.xp-nav');
  const onScroll = () => nav.classList.toggle('is-solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); }
  }), { threshold: .12 });
  document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));

  const cv = $('xpDust');
  if (cv && !reduce) {
    const ctx = cv.getContext('2d');
    let W, H, parts = [];
    const make = fresh => ({
      x: Math.random() * W, y: fresh ? H + 10 : Math.random() * H,
      r: .5 + Math.random() * 1.6, vy: .12 + Math.random() * .3,
      ph: Math.random() * 6.28, sp: .004 + Math.random() * .006, a: .12 + Math.random() * .35,
    });
    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts = Array.from({ length: Math.round(Math.min(W / 22, 60)) }, () => make(false));
    };
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.ph += p.sp * 16; p.y -= p.vy; p.x += Math.sin(p.ph) * .25;
        if (p.y < -10) Object.assign(p, make(true));
        const a = p.a * (.7 + Math.sin(p.ph * 1.6) * .3);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.2);
        g.addColorStop(0, `rgba(222,180,80,${a})`); g.addColorStop(1, 'rgba(222,180,80,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.2, 0, 6.28); ctx.fill();
      }
      requestAnimationFrame(tick);
    };
    addEventListener('resize', size, { passive: true });
    size(); requestAnimationFrame(tick);
  }

  /* ── prijzen per gezelschap ── */
  const maxPeople = () => (state.data && state.data.people.max) || 6;
  const option = n => {
    if (!state.data) return null;
    const o = state.data.people.options;
    return o[Math.min(n, o.length) - 1];
  };
  const label = n => n === 1 ? 'Solo' : `${n} personen`;
  const duur = m => m === 30 ? 'een half uur' : m === 60 ? 'een uur' : m === 90 ? 'anderhalf uur' : m === 120 ? 'twee uur' : `${m} minuten`;

  /* de drie tellers (geurtafel, boekstudio, cadeau) ── */
  function paintSteppers(scope, n) {
    document.querySelectorAll(`.xp-people[data-scope="${scope}"]`).forEach(el => {
      el.querySelector('[data-people-nr]').textContent = n;
      el.querySelector('[data-people-word]').textContent = n === 1 ? 'persoon' : 'personen';
      el.querySelector('[data-step="-1"]').disabled = n <= 1;
      el.querySelector('[data-step="1"]').disabled = n >= maxPeople();
    });
  }

  /* de geurtafel: stoelen, gloed, prijs */
  const SEAT = `<svg viewBox="0 0 40 66" aria-hidden="true">
    <rect x="15" y="1" width="10" height="9" rx="1.5" fill="#D4A73C"/>
    <rect x="14" y="10" width="12" height="4" fill="#2a2620"/>
    <path class="xp-seat-glass" d="M11 17h18l4 7v34a5 5 0 0 1-5 5H12a5 5 0 0 1-5-5V24z"/>
    <rect x="12" y="33" width="16" height="16" fill="none" stroke="rgba(233,199,103,.55)" stroke-width=".8"/>
  </svg>`;
  let seatsBuilt = 0;
  function paintTafel(prev) {
    const n = state.people;
    const seats = $('xpSeats');
    if (seats && seatsBuilt !== maxPeople()) {
      seats.innerHTML = Array.from({ length: maxPeople() }, () => `<div class="xp-seat">${SEAT}</div>`).join('');
      seatsBuilt = maxPeople();
    }
    if (seats) seats.querySelectorAll('.xp-seat').forEach((s, i) => {
      const lit = i < n;
      s.classList.toggle('is-new', lit && i >= (prev || 0) && !reduce);
      s.classList.toggle('is-lit', lit);
    });
    const stage = document.querySelector('.xp-tafel-stage');
    if (stage) stage.style.setProperty('--n', n);
    const o = option(n);
    if (!o) return;
    const amount = $('tafelAmount');
    if (amount) {
      $('tafelPrice').textContent = euro(o.price);
      amount.classList.remove('is-ticking'); void amount.offsetWidth; amount.classList.add('is-ticking');
    }
    if ($('tafelLine')) $('tafelLine').innerHTML = `${WOORD[n] || `Met ${n} personen`} &middot; ${o.minutes} minuten aan de geurtafel`;
    if ($('tafelPer')) $('tafelPer').textContent = n === 1
      ? 'Alles inbegrepen, ook je flacon van 50 ml'
      : `${euro(Math.round(o.price / n))} per persoon · ieder een flacon van 50 ml`;
    if ($('tafelBook')) $('tafelBook').textContent = n === 1 ? 'Reserveer voor jezelf' : `Reserveer voor ${n} personen`;
    const note = $('tafelNote');
    if (note && state.data) {
      const tabel = state.data.people.options.filter(x => x.people <= 5).length;
      note.textContent = `Vanaf ${tabel + 1} personen rekenen we ${euroKort(state.data.people.extraPerPerson)} per extra persoon. Groter gezelschap dan ${maxPeople()}? Bel Angelo, dan kijken we wat kan.`;
    }
    if ($('xpPeopleHint')) $('xpPeopleHint').innerHTML = `<b>${o.minutes} minuten</b> &middot; ${euro(o.price)} in totaal &middot; nu ${euro(o.deposit)} aanbetalen`;
  }

  function setPeople(n, scope = 'booking') {
    n = Math.max(1, Math.min(maxPeople(), n));
    if (scope === 'gift') {
      state.giftPeople = n;
      paintSteppers('gift', n);
      gcUpdate();
      return;
    }
    const prev = state.people;
    state.people = n;
    paintSteppers('booking', n);
    paintTafel(prev);
    const day = state.data && state.data.days.find(d => d.date === state.date);
    const s = day && day.slots.find(x => x.key === state.slot);
    if (s && !isFree(s)) state.slot = null;
    render();
  }
  document.querySelectorAll('.xp-people').forEach(el => el.addEventListener('click', e => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    const scope = el.dataset.scope;
    setPeople((scope === 'gift' ? state.giftPeople : state.people) + Number(b.dataset.step), scope);
  }));

  /* ── agenda ── */
  const dayLabel = ds => {
    const d = new Date(ds + 'T12:00:00Z');
    const f = o => d.toLocaleDateString(window.ELIANDI_LOCALE || 'nl-NL', { ...o, timeZone: 'UTC' }).replace('.', '');
    return { wd: f({ weekday: 'short' }), day: d.getUTCDate(), mo: f({ month: 'short' }), long: f({ weekday: 'long', day: 'numeric', month: 'long' }) };
  };
  /* past dit gezelschap vanaf dit moment? 'run' = vrije halfuren achter elkaar */
  const isFree = s => { const o = option(state.people); return o ? s.run >= o.slots : s.free; };

  async function load() {
    try {
      const r = await fetch('/api/slots', { cache: 'no-store' });
      state.data = await r.json();
      document.querySelectorAll('[data-price]').forEach(el => {
        const o = option(Number(el.dataset.price));
        if (o) el.textContent = euroKort(o.price);
      });
      $('xpLoading').hidden = true;
      paintSteppers('booking', state.people); paintSteppers('gift', state.giftPeople);
      paintTafel(0); gcUpdate();
      render();
    } catch (e) {
      $('xpLoading').textContent = 'De agenda kon niet worden geladen. Ververs de pagina of app Angelo.';
    }
  }

  function render() {
    if (!state.data) return;
    const days = state.data.days.filter(d => d.slots.some(isFree));
    if (!days.length) {
      $('xpDays').innerHTML = '';
      $('xpLoading').hidden = false;
      $('xpLoading').textContent = state.people > 1
        ? `Er is de komende weken geen aaneengesloten plek voor ${state.people} personen. Probeer een kleiner gezelschap, of app Angelo.`
        : 'Alle momenten zijn volgeboekt.';
      $('xpWait').hidden = false;
      ['Name', 'Phone', 'Email'].forEach(k => { if (!$('wl' + k).value) $('wl' + k).value = $('xp' + k).value; });
    } else $('xpLoading').hidden = true;
    if (!days.find(d => d.date === state.date)) { state.date = days[0] && days[0].date; state.slot = null; }
    $('xpDays').innerHTML = days.map(d => {
      const l = dayLabel(d.date), on = d.date === state.date;
      return `<button type="button" class="xp-day${on ? ' is-on' : ''}" data-date="${d.date}" role="radio" aria-checked="${on}">
        <span>${l.wd}</span><b>${l.day}</b><span>${l.mo}</span></button>`;
    }).join('');
    const day = days.find(d => d.date === state.date);
    $('xpTimes').innerHTML = day ? day.slots.map(s => {
      const free = isFree(s), on = s.key === state.slot;
      return `<button type="button" class="xp-time${on ? ' is-on' : ''}" data-slot="${s.key}" ${free ? '' : 'disabled'}
        role="radio" aria-checked="${on}">${s.time}${free ? '' : '<small>vol</small>'}</button>`;
    }).join('') : '';
    summary();
  }

  function summary() {
    const o = option(state.people);
    if (!o) return;
    const code = !$('xpVoucherBox').hidden && $('xpVoucher').value.trim();
    $('sumTitle').textContent = label(state.people);
    if (state.slot) {
      const l = dayLabel(state.date);
      $('sumWhen').textContent = `${l.long.charAt(0).toUpperCase() + l.long.slice(1)} · ${state.slot.slice(11)} (${o.minutes} min)`;
    } else $('sumWhen').textContent = 'Kies een dag en tijd';
    $('sumTotal').textContent = euro(o.price);
    $('sumDepLabel').textContent = code ? 'Cadeaubon' : `Nu aanbetalen (${state.data.depositPct}%)`;
    $('sumDep').textContent = code ? 'volledig betaald' : euro(o.deposit);
    $('sumRest').textContent = code ? '€0,00' : euro(o.price - o.deposit);
    const btn = $('xpPay');
    btn.disabled = !state.slot;
    zetBalk(o);
    btn.textContent = !state.slot ? 'Kies eerst een moment' : code ? 'Boek met cadeaubon' : `Reserveer en betaal ${euro(o.deposit)}`;
  }

  /* telefoon: na het kiezen van een moment een balk onderin naar de laatste stap */
  const balk = document.createElement('div');
  balk.className = 'xp-balk';
  balk.innerHTML = `<div><b id="xpBalkWanneer"></b><small id="xpBalkPrijs"></small></div><button type="button" class="btn btn-gold" id="xpBalkKnop">Verder</button>`;
  document.body.append(balk);
  let samenvattingInBeeld = false;
  function zetBalk(o) {
    if (!o) return;
    $('xpBalkWanneer').textContent = state.slot ? $('sumWhen').textContent : '';
    $('xpBalkPrijs').textContent = `${label(state.people)} · ${euro(o.price)}`;
    document.body.classList.toggle('xp-balk-aan', Boolean(state.slot) && !samenvattingInBeeld);
  }
  new IntersectionObserver(([e]) => { samenvattingInBeeld = e.isIntersecting; if (state.data) zetBalk(option(state.people)); }).observe(document.querySelector('.xp-summary'));
  $('xpBalkKnop').addEventListener('click', () => {
    const leeg = ['xpName', 'xpPhone', 'xpEmail'].map($).find(i => !i.value.trim());
    (leeg || document.querySelector('.xp-summary')).scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (leeg) setTimeout(() => leeg.focus({ preventScroll: true }), 450);
  });

  $('xpDays').addEventListener('click', e => {
    const b = e.target.closest('.xp-day');
    if (!b) return;
    state.date = b.dataset.date; state.slot = null; render();
  });
  $('xpTimes').addEventListener('click', e => {
    const b = e.target.closest('.xp-time');
    if (!b || b.disabled) return;
    state.slot = b.dataset.slot; render();
  });
  $('xpVoucherToggle').addEventListener('click', () => {
    $('xpVoucherBox').hidden = !$('xpVoucherBox').hidden;
    if (!$('xpVoucherBox').hidden) $('xpVoucher').focus();
    summary();
  });
  $('xpVoucher').addEventListener('input', summary);

  /* gegevens en geurprofiel uit de geurwijzer meenemen */
  let profile = [], top5 = [];
  try {
    const lead = JSON.parse(localStorage.getItem('eliandi_leads') || '[]').pop();
    if (lead) { $('xpName').value = lead.name || ''; $('xpEmail').value = lead.email || ''; $('xpPhone').value = lead.phone || ''; }
    const res = JSON.parse(localStorage.getItem('eliandi_last_result') || 'null');
    if (res && res.top5) {
      profile = res.profile || []; top5 = res.top5;
      $('xpProfile').textContent = '✦ Jouw geurprofiel uit de geurwijzer gaat mee naar Angelo, zodat hij je sessie kan voorbereiden.';
      $('xpProfile').hidden = false;
    }
  } catch (e) { /* privémodus */ }

  /* met een cadeaubon in de link: code invullen en het gezelschap van de bon overnemen */
  const bon = new URLSearchParams(location.search).get('bon');
  if (bon) {
    $('xpVoucherBox').hidden = false; $('xpVoucher').value = bon;
    fetch('/api/voucher?code=' + encodeURIComponent(bon)).then(r => (r.ok ? r.json() : null)).then(v => {
      if (v && v.people) { const wait = () => (state.data ? setPeople(v.people) : setTimeout(wait, 150)); wait(); }
    }).catch(() => {});
  }

  $('xpPay').addEventListener('click', async () => {
    const err = $('xpError'), btn = $('xpPay');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Een moment…';
    try {
      const r = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          people: state.people, slot: state.slot,
          name: $('xpName').value, email: $('xpEmail').value, phone: $('xpPhone').value, note: $('xpNote').value,
          voucher: $('xpVoucherBox').hidden ? '' : $('xpVoucher').value, profile, top5,
        }),
      });
      const data = await r.json();
      if (r.status === 409) { state.slot = null; await load(); }
      if (!r.ok || !data.url) throw new Error(data.error || 'Er ging iets mis.');
      try { localStorage.setItem('eliandi_last_purchase', JSON.stringify({ type: 'experience', slot: state.slot, people: state.people, ts: Date.now() })); } catch (x) { /* privémodus */ }
      location.href = data.url;
    } catch (x) {
      err.textContent = x.message;
      summary();
    }
  });

  /* ── wachtlijst: geen plek voor dit gezelschap ── */
  $('xpWaitToggle').addEventListener('click', () => {
    $('xpWait').hidden = false;
    ['Name', 'Phone', 'Email'].forEach(k => { if (!$('wl' + k).value) $('wl' + k).value = $('xp' + k).value; });
    $('xpWait').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('wlSend').addEventListener('click', async () => {
    const msg = $('wlMsg'), btn = $('wlSend');
    msg.textContent = ''; btn.disabled = true;
    try {
      const r = await fetch('/api/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wachtlijst: true, people: state.people, name: $('wlName').value, phone: $('wlPhone').value, email: $('wlEmail').value, wens: $('wlWens').value }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Er ging iets mis.');
      $('xpWait').innerHTML = `<h3 class="xp-wait-done">Je staat op de wachtlijst.</h3><p>Angelo neemt contact met je op zodra er een plek is voor ${state.people} ${state.people === 1 ? 'persoon' : 'personen'}.</p>`;
    } catch (x) { msg.textContent = x.message; btn.disabled = false; }
  });

  /* ── cadeaubon ── */
  function gcUpdate() {
    const n = state.giftPeople, o = option(n);
    $('gcVariant').textContent = `${label(n)} · ${o ? o.minutes : 30 * n} minuten privé met Angelo${n > 1 ? ', ieder een eigen flacon' : ''}`;
    $('gcTo').textContent = $('gTo').value.trim() ? 'Voor ' + $('gTo').value.trim() : 'Voor jou';
    $('gcMsg').textContent = $('gMsg').value.trim() || 'Jouw persoonlijke boodschap verschijnt hier.';
    $('gcFrom').textContent = $('gName').value.trim() ? 'Van ' + $('gName').value.trim() : '';
    $('gPay').textContent = o ? `Koop de cadeaubon · ${euro(o.price)}` : 'Koop de cadeaubon';
    if ($('gPeopleHint')) $('gPeopleHint').innerHTML = o ? `<b>${o.minutes} minuten</b> &middot; ${euro(o.price)}, volledig betaald` : '';
  }
  ['gTo', 'gMsg', 'gName'].forEach(id => $(id).addEventListener('input', gcUpdate));

  $('gForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('gError'), btn = $('gPay');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Een moment…';
    try {
      const r = await fetch('/api/voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          people: state.giftPeople, recipient: $('gTo').value, message: $('gMsg').value,
          name: $('gName').value, email: $('gEmail').value, phone: $('gPhone').value,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.url) throw new Error(data.error || 'Er ging iets mis.');
      location.href = data.url;
    } catch (x) {
      err.textContent = x.message;
      btn.disabled = false;
      gcUpdate();
    }
  });

  if (new URLSearchParams(location.search).get('geannuleerd')) {
    $('xpError').textContent = 'De betaling is afgebroken. Je kunt het opnieuw proberen.';
    setTimeout(() => document.getElementById('boeken').scrollIntoView(), 300);
  }

  paintSteppers('booking', 1); paintSteppers('gift', 1);
  load();
})();
