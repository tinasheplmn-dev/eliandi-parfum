/* ELIANDI — beheerdashboard voor Angelo */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const TOKEN = 'eliandi_admin_token';
  const euro = c => '€' + (c / 100).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  const when = slot => {
    const d = new Date(slot.slice(0, 10) + 'T12:00:00Z');
    return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) + ' · ' + slot.slice(11);
  };
  const date = ts => new Date(ts).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  let state = { bookings: [], orders: [], vouchers: [], filter: 'komend', products: null };

  function toast(msg, bad) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'bh-toast is-on' + (bad ? ' is-bad' : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.className = 'bh-toast'; }, 2600);
  }

  async function api(body) {
    const r = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem(TOKEN) || '') },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && body.action !== 'login') { logout(); throw new Error('Log opnieuw in.'); }
    if (!r.ok) throw new Error(d.error || 'Er ging iets mis.');
    return d;
  }

  /* ── inloggen ── */
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('loginErr').textContent = '';
    try {
      const d = await api({ action: 'login', password: $('loginPw').value });
      localStorage.setItem(TOKEN, d.token);
      start();
    } catch (x) { $('loginErr').textContent = x.message; }
  });
  function logout() {
    localStorage.removeItem(TOKEN);
    $('app').hidden = true;
    $('login').hidden = false;
  }
  $('logout').addEventListener('click', logout);

  /* ── tabbladen ── */
  $('nav').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('is-on', x === b));
    document.querySelectorAll('.bh-tab').forEach(t => { t.hidden = t.dataset.tab !== b.dataset.tab; });
    if (b.dataset.tab === 'producten' && !state.products) loadProducts();
    if (b.dataset.tab === 'instellingen') loadSettings();
    if (b.dataset.tab === 'klanten') renderKlanten();
    if (b.dataset.tab === 'kortingen') loadKortingen().catch(x => toast(x.message, true));
    if (b.dataset.tab === 'bedrijf') loadBedrijf().catch(x => toast(x.message, true));
  });

  /* nieuwe records hebben 'people', oude 'variant' */
  const gezelschap = b => { const n = Number(b.people) || (b.variant === 'duo' ? 2 : 1); return n === 1 ? 'Solo' : n + ' personen'; };

  /* ── boekingen ── */
  async function loadOverview() {
    const d = await api({ action: 'overview' });
    Object.assign(state, d);
    $('warnStore').hidden = d.persistent;
    toonKoppelingen(d.koppelingen);
    renderBookings();
    renderOrders();
    if (!$('klList').closest('.bh-tab').hidden) renderKlanten();
  }

  /* agenda en betalingen: alleen melden wat nog niet aanstaat */
  function toonKoppelingen(k) {
    const box = $('warnKoppeling');
    if (!k) { box.hidden = true; return; }
    const open = [];
    if (!k.agenda) open.push('De agenda van Angelo is nog niet gekoppeld, dus eigen afspraken sluiten nog geen tijden af.');
    if (k.betalen === 'test') open.push('Betalingen staan in testmodus: er wordt niets afgeschreven.');
    box.innerHTML = open.length
      ? '<b>Nog te doen:</b> ' + open.join(' ')
      : '<b>Gekoppeld:</b> de agenda van Angelo loopt mee en betalingen gaan via ' + (k.betalen === 'mollie' ? 'Mollie' : 'Stripe') + '.';
    box.hidden = false;
  }

  function renderBookings() {
    const today = new Date().toISOString().slice(0, 10);
    const live = state.bookings.filter(b => b.status === 'geboekt');
    const upcoming = live.filter(b => b.slot.slice(0, 10) >= today);
    $('bkStats').innerHTML = `<span><b>${upcoming.length}</b> komend</span>
      <span><b>${euro(upcoming.reduce((s, b) => s + b.paid, 0))}</b> al ontvangen</span>
      <span><b>${euro(upcoming.reduce((s, b) => s + (b.price - b.paid), 0))}</b> nog te innen</span>`;
    const rows = state.filter === 'komend'
      ? state.bookings.filter(b => b.status === 'geboekt' && b.slot.slice(0, 10) >= today)
      : state.bookings.slice().reverse();
    $('bkList').innerHTML = rows.length ? rows.map(b => `
      <article class="bh-card${b.done ? ' is-done' : ''}">
        <div class="bh-card-when"><b>${when(b.slot)}</b><span class="bh-pill">${gezelschap(b)} · ${b.minutes || 30} min</span></div>
        <div class="bh-card-main">
          <p class="bh-name">${esc(b.name)}</p>
          <p class="bh-contact">${b.phone ? `<a href="tel:${esc(b.phone)}">${esc(b.phone)}</a>` : ''}${b.phone && b.email ? ' · ' : ''}${b.email ? `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ''}</p>
          ${b.note ? `<p class="bh-note">“${esc(b.note)}”</p>` : ''}
          ${b.top5 ? `<p class="bh-meta"><b>Geurwijzer:</b> ${esc(b.top5)}</p>` : ''}
          ${b.profile ? `<p class="bh-meta"><b>Profiel:</b> ${esc(b.profile)}</p>` : ''}
        </div>
        <div class="bh-card-side">
          <span class="bh-status bh-s-${b.status.replace(/\s/g, '-')}">${b.done ? 'afgerond' : b.status}</span>
          <p class="bh-money">${b.voucher ? 'Cadeaubon ' + esc(b.voucher) : `${euro(b.paid)} betaald<br>${euro(b.price - b.paid)} in de winkel`}</p>
          <p class="bh-src">${b.source === 'handmatig' ? 'Zelf ingepland' : 'Via de website'}${b.mock ? ' · test' : ''}</p>
          <div class="bh-card-actions">
            ${b.status === 'geboekt' ? `<button class="bh-btn bh-sm" data-done="${b.id}">${b.done ? 'Heropenen' : 'Afgerond'}</button>
            <button class="bh-btn bh-sm bh-danger" data-cancel="${b.id}">Annuleren</button>` : ''}
            <button class="bh-btn bh-sm bh-weg" data-del="${b.id}" title="Definitief uit het overzicht halen">Verwijderen</button>
          </div>
        </div>
      </article>`).join('') : '<p class="bh-empty">Nog geen boekingen.</p>';
  }

  document.querySelector('.bh-filter').addEventListener('click', e => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    state.filter = b.dataset.f;
    document.querySelectorAll('.bh-filter button').forEach(x => x.classList.toggle('is-on', x === b));
    renderBookings();
  });

  $('bkList').addEventListener('click', async e => {
    const c = e.target.closest('[data-cancel]'), d = e.target.closest('[data-done]');
    try {
      const w = e.target.closest('[data-del]');
      if (c) {
        if (!confirm('Deze boeking annuleren? Het moment komt weer vrij, de afspraak verdwijnt uit je agenda en de klant krijgt bericht. Een aanbetaling stort je zelf terug in Mollie.')) return;
        await api({ action: 'bookingCancel', id: c.dataset.cancel });
        toast('Boeking geannuleerd');
      }
      if (d) await api({ action: 'bookingDone', id: d.dataset.done });
      if (w) {
        if (!confirm('Deze boeking definitief uit het overzicht halen? Dit kun je niet terugdraaien.')) return;
        await api({ action: 'recordDelete', soort: 'booking', id: w.dataset.del });
        toast('Verwijderd');
      }
      if (c || d || w) { await loadOverview(); await loadAgenda(); }
    } catch (x) { toast(x.message, true); }
  });

  /* ── agenda ── */
  async function loadAgenda() {
    const { slots } = await api({ action: 'agenda' });
    const byDay = {};
    slots.forEach(s => { (byDay[s.slot.slice(0, 10)] = byDay[s.slot.slice(0, 10)] || []).push(s); });
    $('agenda').innerHTML = Object.entries(byDay).map(([day, list]) => `
      <div class="bh-day"><p>${when(day + 'T00:00').split(' · ')[0]}</p>
        <div>${list.map(s => `<button type="button" class="bh-slot bh-st-${s.state}" data-slot="${s.slot}"
          ${s.state === 'booked' || s.state === 'held' ? 'disabled' : ''} title="${s.state}">${s.slot.slice(11)}</button>`).join('')}</div>
      </div>`).join('');
    $('addSlot').innerHTML = slots.filter(s => s.state === 'vrij').map(s => `<option value="${s.slot}">${when(s.slot)}</option>`).join('');
  }
  $('agenda').addEventListener('click', async e => {
    const b = e.target.closest('[data-slot]');
    if (!b || b.disabled) return;
    try {
      const d = await api({ action: 'slotToggle', slot: b.dataset.slot });
      toast(d.blocked ? 'Moment dichtgezet' : 'Moment weer open');
      loadAgenda();
    } catch (x) { toast(x.message, true); }
  });

  $('addForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      await api({ action: 'bookingAdd', ...f });
      e.target.reset();
      toast('Ingepland');
      await loadOverview(); await loadAgenda();
    } catch (x) { toast(x.message, true); }
  });

  /* ── bestellingen en bonnen ── */
  const OPEN = ['betaald', 'wordt voorbereid'];
  let orFilter = 'open';
  function renderOrders() {
    const echt = state.orders.filter(o => o.status !== 'wacht op betaling' && o.status !== 'geannuleerd');
    const maand = Date.now() - 30 * 86400000;
    $('orStats').innerHTML = `<span><b>${state.orders.filter(o => OPEN.includes(o.status)).length}</b> te doen</span><span><b>${euro(echt.filter(o => o.created > maand).reduce((s, o) => s + o.total, 0))}</b> omzet 30 dagen</span>`;
    const lijst = orFilter === 'open' ? state.orders.filter(o => OPEN.includes(o.status) || o.status === 'wacht op betaling') : state.orders;
    const statussen = (state.statussen || []).filter(x => x !== 'betaald');
    $('orList').innerHTML = lijst.length ? lijst.map(o => `
      <article class="bh-card" data-order="${o.id}">
        <div class="bh-card-when"><b>${date(o.created)}</b><span class="bh-pill">${o.delivery === 'ophalen' ? 'Ophalen' : 'Verzenden'}</span>${o.factuur ? `<a class="bh-link" href="/api/admin?factuur=${o.id}&token=${encodeURIComponent(localStorage.getItem(TOKEN) || '')}" target="_blank" rel="noopener">Factuur ${esc(o.factuur.nummer)}</a>` : ''}</div>
        <div class="bh-card-main">
          <p class="bh-name">${esc(o.name)} <small class="bh-ref">#${esc(o.id.toUpperCase())}</small></p>
          <p class="bh-contact">${o.phone ? `<a href="tel:${esc(o.phone)}">${esc(o.phone)}</a> · ` : ''}<a href="mailto:${esc(o.email)}">${esc(o.email)}</a></p>
          <ul class="bh-items">${o.items.map(i => `<li>${i.qty}× ${esc(i.name)}</li>`).join('')}</ul>
          ${o.perfumes && o.perfumes.length ? `<p class="bh-meta"><b>Samples:</b> ${o.perfumes.map(esc).join(' · ')}</p>` : ''}
          ${o.address ? `<p class="bh-meta"><b>Adres:</b> ${esc(o.address)}</p>` : ''}
          ${o.korting ? `<p class="bh-meta"><b>Korting:</b> ${esc(o.korting.code)} (-${euro(o.korting.cents)})</p>` : ''}
          ${o.trackTrace ? `<p class="bh-meta"><b>Track &amp; trace:</b> ${esc(o.trackTrace)}</p>` : ''}
          <p class="bh-meta bh-notitie"><b>Notitie:</b> <span data-note="${o.id}" contenteditable="true" spellcheck="false">${esc(o.note || '')}</span></p>
        </div>
        <div class="bh-card-side">
          <span class="bh-status bh-s-${o.status.replace(/\s/g, '-')}">${o.status}</span>
          <p class="bh-money">${euro(o.total)}</p>${o.mock ? '<p class="bh-src">test</p>' : ''}
          ${o.status !== 'wacht op betaling' ? `<div class="bh-card-actions bh-statusrow">
            <select class="bh-select" data-status="${o.id}">${statussen.map(st => `<option value="${st}" ${st === o.status ? 'selected' : ''}>${st}</option>`).join('')}</select>
            ${o.delivery === 'verzenden' ? `<input class="bh-tt" data-tt="${o.id}" placeholder="track & trace (optioneel)" value="${esc(o.trackTrace || '')}">` : ''}
            <button class="bh-btn bh-sm bh-gold" data-setstatus="${o.id}">Status opslaan</button>
          </div>` : ''}
          <div class="bh-card-actions"><button class="bh-btn bh-sm bh-weg" data-delorder="${o.id}" title="Definitief uit het overzicht halen">Verwijderen</button></div>
        </div>
      </article>`).join('') : `<p class="bh-empty">${orFilter === 'open' ? 'Niets te doen. Alles is afgehandeld.' : 'Nog geen bestellingen.'}</p>`;
    $('vcList').innerHTML = state.vouchers.length ? state.vouchers.map(v => `
      <article class="bh-card">
        <div class="bh-card-when"><b>${esc(v.code)}</b><span class="bh-pill">${gezelschap(v)}</span></div>
        <div class="bh-card-main">
          <p class="bh-name">Van ${esc(v.buyer.name)}${v.recipient ? ' voor ' + esc(v.recipient) : ''}</p>
          <p class="bh-contact"><a href="mailto:${esc(v.buyer.email)}">${esc(v.buyer.email)}</a></p>
          ${v.message ? `<p class="bh-note">“${esc(v.message)}”</p>` : ''}
        </div>
        <div class="bh-card-side">
          <span class="bh-status bh-v-${v.status}">${{ pending: 'wacht op betaling', paid: 'te besteden', used: 'ingewisseld' }[v.status]}</span>
          <p class="bh-money">${euro(v.price)}</p>
          <a class="bh-btn bh-sm" href="cadeaubon.html?code=${esc(v.code)}" target="_blank" rel="noopener">Bon bekijken</a>
        </div>
      </article>`).join('') : '<p class="bh-empty">Nog geen cadeaubonnen.</p>';
  }

  $('orFilter').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    orFilter = b.dataset.f;
    $('orFilter').querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x === b));
    renderOrders();
  });
  $('orList').addEventListener('focusout', async e => {
    const n = e.target.closest('[data-note]'); if (!n) return;
    try { await api({ action: 'orderNote', id: n.dataset.note, note: n.textContent.trim() }); toast('Notitie bewaard'); } catch (x) { toast(x.message, true); }
  });
  $('orList').addEventListener('click', async e => {
    const st = e.target.closest('[data-setstatus]');
    if (st) {
      const id = st.dataset.setstatus;
      const card = st.closest('.bh-card');
      const status = card.querySelector('[data-status]').value;
      const tt = card.querySelector('[data-tt]');
      try {
        await api({ action: 'orderStatus', id, status, trackTrace: tt ? tt.value : undefined });
        toast(['verzonden', 'klaar om op te halen', 'geannuleerd'].includes(status) ? 'Status opgeslagen, klant krijgt een mail' : 'Status opgeslagen');
        await loadOverview();
      } catch (x) { toast(x.message, true); }
      return;
    }
    const w = e.target.closest('[data-delorder]');
    if (!w) return;
    if (!confirm('Deze bestelling definitief uit het overzicht halen? Dit kun je niet terugdraaien.')) return;
    try {
      await api({ action: 'recordDelete', soort: 'order', id: w.dataset.delorder });
      toast('Verwijderd');
      await loadOverview();
    } catch (x) { toast(x.message, true); }
  });

  /* ── klanten en wachtlijst ── */
  function renderKlanten() {
    const q = ($('klSearch').value || '').trim().toLowerCase();
    const alle = state.klanten || [];
    const rows = alle.filter(k => !q || k.naam.toLowerCase().includes(q) || k.email.includes(q));
    $('klStats').innerHTML = `<span><b>${alle.length}</b> klanten</span><span><b>${euro(alle.reduce((s, k) => s + k.besteed, 0))}</b> besteed</span>`;
    $('klList').innerHTML = rows.length ? rows.map(k => `
      <article class="bh-card bh-klant">
        <div class="bh-card-main">
          <p class="bh-name">${esc(k.naam || k.email)}</p>
          <p class="bh-contact">${k.tel ? `<a href="tel:${esc(k.tel)}">${esc(k.tel)}</a> · ` : ''}<a href="mailto:${esc(k.email)}">${esc(k.email)}</a></p>
        </div>
        <div class="bh-card-side">
          <p class="bh-money">${euro(k.besteed)}</p>
          <p class="bh-src">${k.bestellingen} ${k.bestellingen === 1 ? 'bestelling' : 'bestellingen'}${k.boekingen ? ` · ${k.boekingen} ${k.boekingen === 1 ? 'experience' : 'experiences'}` : ''}</p>
          <p class="bh-src">laatst ${date(k.laatst)}</p>
        </div>
      </article>`).join('') : '<p class="bh-empty">Nog geen klanten.</p>';
    const wl = state.wachtlijst || [];
    $('wlList').innerHTML = wl.length ? wl.map(w => `
      <article class="bh-card">
        <div class="bh-card-when"><b>${date(w.created)}</b><span class="bh-pill">${w.people} ${w.people === 1 ? 'persoon' : 'personen'}</span></div>
        <div class="bh-card-main">
          <p class="bh-name">${esc(w.name)}</p>
          <p class="bh-contact">${w.phone ? `<a href="tel:${esc(w.phone)}">${esc(w.phone)}</a> · ` : ''}<a href="mailto:${esc(w.email)}">${esc(w.email)}</a></p>
          ${w.wens ? `<p class="bh-note">“${esc(w.wens)}”</p>` : ''}
        </div>
        <div class="bh-card-side"><div class="bh-card-actions"><button class="bh-btn bh-sm bh-weg" data-delwl="${w.id}">Afgehandeld</button></div></div>
      </article>`).join('') : '<p class="bh-empty">Niemand op de wachtlijst.</p>';
  }
  $('klSearch').addEventListener('input', renderKlanten);
  $('wlList').addEventListener('click', async e => {
    const b = e.target.closest('[data-delwl]'); if (!b) return;
    try { await api({ action: 'wachtlijstDelete', id: b.dataset.delwl }); await loadOverview(); } catch (x) { toast(x.message, true); }
  });

  /* ── kortingscodes ── */
  async function loadKortingen() {
    const { codes } = await api({ action: 'kortingList' });
    $('kortList').innerHTML = codes.length ? codes.map(c => `
      <article class="bh-card bh-prod">
        <div class="bh-card-main">
          <p class="bh-name">${esc(c.code)} <small class="bh-ref">${c.soort === 'pct' ? c.waarde + '%' : euro(c.waarde)} korting</small></p>
          <p class="bh-meta">${c.min ? `vanaf ${euro(c.min)} · ` : ''}${c.tot ? `geldig tot ${c.tot} · ` : ''}${c.max ? `${c.gebruikt || 0} van ${c.max} gebruikt` : `${c.gebruikt || 0}× gebruikt`}</p>
        </div>
        <div class="bh-card-side"><div class="bh-card-actions"><button class="bh-btn bh-sm bh-weg" data-delkort="${esc(c.code)}">Verwijderen</button></div></div>
      </article>`).join('') : '<p class="bh-empty">Nog geen kortingscodes.</p>';
  }
  $('kortForm').addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try { await api({ action: 'kortingSave', ...d }); toast('Code opgeslagen'); e.target.reset(); await loadKortingen(); } catch (x) { toast(x.message, true); }
  });
  $('kortList').addEventListener('click', async e => {
    const b = e.target.closest('[data-delkort]'); if (!b) return;
    if (!confirm(`Code ${b.dataset.delkort} verwijderen?`)) return;
    try { await api({ action: 'kortingDelete', code: b.dataset.delkort }); await loadKortingen(); } catch (x) { toast(x.message, true); }
  });

  /* ── bedrijf & facturen ── */
  async function loadBedrijf() {
    const { bedrijf } = await api({ action: 'bedrijfGet' });
    const f = $('bedrijfForm').elements;
    ['naam', 'tel', 'straat', 'postcode', 'plaats', 'email', 'kvk', 'btwNummer', 'iban', 'btwPct', 'factuurPrefix', 'factuurStart'].forEach(k => { f[k].value = bedrijf[k] == null ? '' : bedrijf[k]; });
    f.gratisVanaf.value = fmt((bedrijf.gratisVanaf || 0) / 100);
  }
  $('bedrijfForm').addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try { await api({ action: 'bedrijfSave', bedrijf: d }); toast('Opgeslagen'); } catch (x) { toast(x.message, true); }
  });

  /* ── producten ── */
  async function loadProducts() {
    state.products = await api({ action: 'productsList' });
    state.reviews = (await api({ action: 'reviewsList' })).reviews;
    renderCustom();
    renderBase();
  }
  const fmt = v => v == null ? '' : String(v).replace('.', ',');
  function renderCustom() {
    const c = state.products.custom;
    $('customList').innerHTML = c.length ? '<h3 class="bh-sub">Zelf toegevoegd</h3>' + c.map(p => `
      <article class="bh-card bh-prod">
        <div class="bh-card-main"><p class="bh-name">${esc(p.n)}</p>
          <p class="bh-meta">${esc([p.g, ...p.f].join(' · '))}</p>
          <p class="bh-meta">${['30', '50', '100'].map((ml, i) => p.v[i] ? `${ml} ml €${fmt(p.v[i])}` : '').filter(Boolean).join(' · ')}</p></div>
        <div class="bh-card-actions">
          <button class="bh-btn bh-sm" data-edit="${p.id}">Bewerken</button>
          <button class="bh-btn bh-sm bh-danger" data-del="${p.id}">Verwijderen</button></div>
      </article>`).join('') : '';
  }
  function renderBase() {
    const q = $('prodSearch').value.trim().toLowerCase();
    const rows = q.length < 2 ? [] : state.products.base.filter(p => p.n.toLowerCase().includes(q)).slice(0, 12);
    $('baseList').innerHTML = rows.map(p => `
      <form class="bh-card bh-prod bh-base" data-n="${esc(p.n)}">
        <div class="bh-card-main"><p class="bh-name">${esc(p.n)}</p></div>
        <div class="bh-base-fields">
          ${['30', '50', '100'].map((ml, i) => `<label>${ml} ml<input name="v${i}" value="${fmt(p.v[i])}" inputmode="decimal"></label>`).join('')}
          ${['30', '50', '100'].map((ml, i) => `<label>Voorraad ${ml}<input name="s${i}" value="${p.stock && p.stock[i] != null ? p.stock[i] : ''}" inputmode="numeric" placeholder="∞"></label>`).join('')}
          <label class="bh-check"><input type="checkbox" name="hidden" ${p.hidden ? 'checked' : ''}> Verbergen</label>
          <button class="bh-btn bh-sm bh-gold" type="submit">Opslaan</button>
        </div>
        <div class="bh-reviews" data-product="${esc(p.n)}">
          <p class="bh-meta"><b>Reviews:</b> ${(state.reviews && state.reviews[p.n] || []).map(r => `<span class="bh-review">${'★'.repeat(r.sterren)} ${esc(r.naam)}: “${esc(r.tekst.slice(0, 60))}${r.tekst.length > 60 ? '…' : ''}” <button type="button" class="bh-x" data-delreview="${r.id}" title="Verwijderen">×</button></span>`).join('') || 'nog geen'}</p>
          <div class="bh-review-add"><input data-rv="naam" placeholder="Naam klant"><select data-rv="sterren"><option>5</option><option>4</option><option>3</option></select><input data-rv="tekst" placeholder="Wat zei de klant?"><button type="button" class="bh-btn bh-sm" data-addreview="${esc(p.n)}">Review toevoegen</button></div>
        </div>
      </form>`).join('') || (q.length >= 2 ? '<p class="bh-empty">Geen parfum gevonden.</p>' : '');
  }
  $('prodSearch').addEventListener('input', renderBase);
  $('baseList').addEventListener('click', async e => {
    const add = e.target.closest('[data-addreview]'), del = e.target.closest('[data-delreview]');
    if (!add && !del) return;
    e.preventDefault();
    const box = e.target.closest('.bh-reviews');
    try {
      if (add) {
        const g = k => box.querySelector(`[data-rv="${k}"]`).value;
        await api({ action: 'reviewSave', product: box.dataset.product, naam: g('naam'), sterren: g('sterren'), tekst: g('tekst') });
        toast('Review toegevoegd');
      } else {
        await api({ action: 'reviewDelete', product: box.dataset.product, id: del.dataset.delreview });
      }
      const { reviews } = await api({ action: 'reviewsList' });
      state.reviews = reviews; renderBase();
    } catch (x) { toast(x.message, true); }
  });
  $('baseList').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, d = Object.fromEntries(new FormData(f));
    try {
      await api({ action: 'productOverride', n: f.dataset.n, v: [d.v0, d.v1, d.v2], stock: [d.s0, d.s1, d.s2], hidden: Boolean(d.hidden) });
      toast('Opgeslagen');
      state.products = await api({ action: 'productsList' });
    } catch (x) { toast(x.message, true); }
  });

  $('prodForm').addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await api({ action: 'productSave', product: { id: d.id || undefined, n: d.n, g: d.g, f: d.f, t: d.t, h: d.h, b: d.b, i: d.i, v: [d.v0, d.v1, d.v2] } });
      e.target.reset();
      e.target.elements.id.value = '';
      toast('Parfum opgeslagen');
      loadProducts();
    } catch (x) { toast(x.message, true); }
  });
  $('customList').addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) {
      const p = state.products.custom.find(x => x.id === ed.dataset.edit);
      const f = $('prodForm').elements;
      f.id.value = p.id; f.n.value = p.n; f.g.value = p.g; f.f.value = p.f.join(', ');
      f.t.value = p.t.join(', '); f.h.value = p.h.join(', '); f.b.value = p.b.join(', '); f.i.value = p.i;
      f.v0.value = fmt(p.v[0]); f.v1.value = fmt(p.v[1]); f.v2.value = fmt(p.v[2]);
      $('prodForm').scrollIntoView({ behavior: 'smooth' });
    }
    if (del && confirm('Dit parfum verwijderen?')) {
      try { await api({ action: 'productDelete', id: del.dataset.del }); toast('Verwijderd'); loadProducts(); }
      catch (x) { toast(x.message, true); }
    }
  });

  /* ── instellingen ── */
  async function loadSettings() {
    const { settings: s } = await api({ action: 'settingsGet' });
    const f = $('setForm').elements;
    f.depositPct.value = s.depositPct;
    f.minutesPerPerson.value = s.minutesPerPerson;
    f.maxPeople.value = s.maxPeople;
    f.extraPerPerson.value = fmt(s.extraPerPerson / 100);
    $('setPrices').innerHTML = (s.prices || []).map((p, i) => `
      <label>${i + 1} ${i ? 'personen' : 'persoon'} (€)<input data-price="${i}" value="${fmt(p / 100)}" inputmode="decimal"></label>`).join('');
    f.blockedDates.value = (s.blockedDates || []).join(' ');
    $('setDays').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => `
      <label><span>${DAYS[d]}</span><input data-day="${d}" value="${(s.schedule[d] || []).join(' ')}" placeholder="gesloten"></label>`).join('');
  }
  $('setForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.elements, schedule = {};
    document.querySelectorAll('#setDays input').forEach(i => { schedule[i.dataset.day] = i.value; });
    try {
      await api({ action: 'settingsSave', settings: {
        prices: [...document.querySelectorAll('#setPrices input')].map(i => i.value),
        extraPerPerson: f.extraPerPerson.value, minutesPerPerson: f.minutesPerPerson.value,
        maxPeople: f.maxPeople.value, depositPct: f.depositPct.value,
        schedule, blockedDates: f.blockedDates.value,
      } });
      toast('Opgeslagen');
      loadAgenda();
    } catch (x) { toast(x.message, true); }
  });

  /* ── start ── */
  async function start() {
    $('login').hidden = true;
    $('app').hidden = false;
    try { await loadOverview(); await loadAgenda(); } catch (x) { toast(x.message, true); }
  }
  if (localStorage.getItem(TOKEN)) start();
  setInterval(() => { if (!$('app').hidden && !document.hidden) loadOverview().catch(() => {}); }, 60000);
})();
