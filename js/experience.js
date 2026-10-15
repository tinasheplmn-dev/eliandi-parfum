/* ELIANDI — De Experience: agenda, formules, aanbetalen, cadeaubon */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const euro = c => '€' + (c / 100).toFixed(2).replace('.', ',');
  const euroKort = c => '€' + (c % 100 ? (c / 100).toFixed(2).replace('.', ',') : c / 100);
  const state = { data: null, variant: 'solo', date: null, slot: null, giftVariant: 'solo' };

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

  /* ── agenda ── */
  const dayLabel = ds => {
    const d = new Date(ds + 'T12:00:00Z');
    const f = o => d.toLocaleDateString('nl-NL', { ...o, timeZone: 'UTC' }).replace('.', '');
    return { wd: f({ weekday: 'short' }), day: d.getUTCDate(), mo: f({ month: 'short' }), long: f({ weekday: 'long', day: 'numeric', month: 'long' }) };
  };
  const isFree = s => state.variant === 'duo' ? s.duoFree : s.free;

  async function load() {
    try {
      const r = await fetch('/api/slots', { cache: 'no-store' });
      state.data = await r.json();
      const v = state.data.variants;
      document.querySelectorAll('[data-price]').forEach(el => {
        const p = v[el.dataset.price];
        if (p) el.textContent = euroKort(p.price);
      });
      $('xpLoading').hidden = true;
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
      $('xpLoading').textContent = 'Alle momenten zijn volgeboekt. App Angelo voor een plekje.';
    }
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
    const v = state.data && state.data.variants[state.variant];
    if (!v) return;
    const code = !$('xpVoucherBox').hidden && $('xpVoucher').value.trim();
    $('sumTitle').textContent = state.variant === 'duo' ? 'Duo' : 'Solo';
    if (state.slot) {
      const l = dayLabel(state.date);
      const end = state.variant === 'duo' ? ' (60 min)' : '';
      $('sumWhen').textContent = l.long.charAt(0).toUpperCase() + l.long.slice(1) + ' · ' + state.slot.slice(11) + end;
    } else $('sumWhen').textContent = 'Kies een dag en tijd';
    $('sumTotal').textContent = euro(v.price);
    $('sumDepLabel').textContent = code ? 'Cadeaubon' : `Nu aanbetalen (${state.data.depositPct}%)`;
    $('sumDep').textContent = code ? 'volledig betaald' : euro(v.deposit);
    $('sumRest').textContent = code ? '€0,00' : euro(v.price - v.deposit);
    const btn = $('xpPay');
    btn.disabled = !state.slot;
    btn.textContent = !state.slot ? 'Kies eerst een moment' : code ? 'Boek met cadeaubon' : `Reserveer en betaal ${euro(v.deposit)}`;
  }

  function setVariant(v) {
    state.variant = v;
    document.querySelectorAll('#xpVariant button').forEach(b => {
      b.classList.toggle('is-on', b.dataset.v === v);
      b.setAttribute('aria-checked', b.dataset.v === v);
    });
    const day = state.data && state.data.days.find(d => d.date === state.date);
    const s = day && day.slots.find(x => x.key === state.slot);
    if (s && !isFree(s)) state.slot = null;
    render();
  }

  $('xpVariant').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) setVariant(b.dataset.v); });
  document.querySelectorAll('[data-variant]').forEach(a => a.addEventListener('click', () => setVariant(a.dataset.variant)));
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
    const code = new URLSearchParams(location.search).get('bon');
    if (code) { $('xpVoucherBox').hidden = false; $('xpVoucher').value = code; }
  } catch (e) { /* privémodus */ }

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
          variant: state.variant, slot: state.slot,
          name: $('xpName').value, email: $('xpEmail').value, phone: $('xpPhone').value, note: $('xpNote').value,
          voucher: $('xpVoucherBox').hidden ? '' : $('xpVoucher').value, profile, top5,
        }),
      });
      const data = await r.json();
      if (r.status === 409) { state.slot = null; await load(); }
      if (!r.ok || !data.url) throw new Error(data.error || 'Er ging iets mis.');
      try { localStorage.setItem('eliandi_last_purchase', JSON.stringify({ type: 'experience', slot: state.slot, variant: state.variant, ts: Date.now() })); } catch (x) { /* privémodus */ }
      location.href = data.url;
    } catch (x) {
      err.textContent = x.message;
      summary();
    }
  });

  /* ── cadeaubon ── */
  const gcUpdate = () => {
    const v = state.giftVariant;
    $('gcVariant').textContent = v === 'duo' ? 'Duo · 60 minuten privé met Angelo, voor twee' : 'Solo · 30 minuten privé met Angelo';
    $('gcTo').textContent = $('gTo').value.trim() ? 'Voor ' + $('gTo').value.trim() : 'Voor jou';
    $('gcMsg').textContent = $('gMsg').value.trim() || 'Jouw persoonlijke boodschap verschijnt hier.';
    $('gcFrom').textContent = $('gName').value.trim() ? 'Van ' + $('gName').value.trim() : '';
    const p = state.data && state.data.variants[v];
    $('gPay').textContent = p ? `Koop de cadeaubon · ${euro(p.price)}` : 'Koop de cadeaubon';
  };
  $('gVariant').addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    state.giftVariant = b.dataset.v;
    document.querySelectorAll('#gVariant button').forEach(x => {
      x.classList.toggle('is-on', x === b); x.setAttribute('aria-checked', x === b);
    });
    gcUpdate();
  });
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
          variant: state.giftVariant, recipient: $('gTo').value, message: $('gMsg').value,
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
  load().then(gcUpdate);
})();
