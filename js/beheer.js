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
      const d = await api({ action: 'login', password: $('loginPw').value, code: $('loginCode').value.replace(/\s/g, '') });
      if (d.tweestap) {
        $('loginCodeBox').hidden = false; $('loginCode').focus();
        $('loginErr').textContent = 'Vul de code uit je authenticator-app in.';
        return;
      }
      localStorage.setItem(TOKEN, d.token);
      $('loginCode').value = ''; $('loginCodeBox').hidden = true;
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
    if (b.dataset.tab === 'vandaag') renderVandaag();
    if (b.dataset.tab === 'inzichten') loadInzichten();
    if (b.dataset.tab === 'account') loadAccount();
    try { sessionStorage.setItem('bh-tab', b.dataset.tab); } catch (x) { /* */ }
    window.scrollTo(0, 0);
    if (b.dataset.tab === 'instellingen') loadSettings();
    if (b.dataset.tab === 'klanten') renderKlanten();
    if (b.dataset.tab === 'geurwijzer') { renderGeurwijzer(); gwGezien(); }
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
    renderVandaag();
    const teDoen = state.orders.filter(o => OPEN.includes(o.status)).length;
    $('badgeOrders').hidden = !teDoen; $('badgeOrders').textContent = teDoen;
    const sel = $('orStatus');
    if (sel.options.length <= 1) (d.statussen || []).concat(['wacht op betaling']).forEach(st => sel.add(new Option(st, st)));
    if (!$('klList').closest('.bh-tab').hidden) renderKlanten();
    if (!$('gwList').closest('.bh-tab').hidden) { renderGeurwijzer(); gwGezien(); }
    gwBadge();
  }
  const naarTab = tab => { const b = document.querySelector(`#nav [data-tab="${tab}"]`); if (b) b.click(); };

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

  /* ── creditnota's: bij een bestelling of boeking met factuur ── */
  const terug = r => (r.creditnotas || []).reduce((t, c) => t + c.cents, 0);
  const creditLinks = (soort, r) => (r.creditnotas || []).map(c => `<button class="bh-link" data-dl="creditnota" data-id="${soort}:${r.id}:${esc(c.nummer)}">Creditnota ${esc(c.nummer)}</button>`).join('');
  const creditKnop = (soort, r, totaal) => r.factuur && totaal - terug(r) > 0
    ? `<button class="bh-btn bh-sm" data-credit="${soort}" data-id="${r.id}" data-open="${totaal - terug(r)}">Creditnota</button>` : '';
  document.addEventListener('click', async e => {
    const k = e.target.closest('[data-credit]'); if (!k) return;
    const open = Number(k.dataset.open);
    if (!confirm('Heb je het geld al terugbetaald in Mollie? Een creditnota maakt alleen het papier: hij krijgt een eigen nummer en gaat per mail naar de klant.')) return;
    const bedrag = prompt('Hoeveel heb je terugbetaald (incl. btw)? Laat staan voor het hele bedrag.', fmt(open / 100));
    if (bedrag === null) return;
    const reden = prompt('Reden (komt op de creditnota, mag leeg)', '') || '';
    try {
      const r = await api({ action: 'creditnota', soort: k.dataset.credit, id: k.dataset.id, bedrag, reden });
      toast(`Creditnota ${r.nummer} gemaakt${r.gemaild ? ' en naar de klant gemaild' : ''}`);
      await loadOverview();
    } catch (x) { toast(x.message, true); }
  });

  /* administratie per maand: standaard de vorige maand */
  (() => {
    const m = $('orMaand'); if (!m) return;
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    const zet = () => { $('orMaandKnop').dataset.id = m.value || '-'; };
    m.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    m.max = new Date().toISOString().slice(0, 7);
    m.addEventListener('input', zet); zet();
  })();

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
        <div class="bh-card-when"><b>${when(b.slot)}</b><span class="bh-pill">${gezelschap(b)} · ${b.minutes || 30} min</span>${b.factuur ? `<button class="bh-link" data-dl="factuur-boeking" data-id="${b.id}">Factuur ${esc(b.factuur.nummer)}</button>` : ''}${creditLinks('booking', b)}</div>
        <div class="bh-card-main">
          <p class="bh-name">${esc(b.name)}</p>
          <p class="bh-contact">${b.phone ? `<a href="tel:${esc(b.phone)}">${esc(b.phone)}</a>` : ''}${b.phone && b.email ? ' · ' : ''}${b.email ? `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ''}</p>
          ${b.note ? `<p class="bh-note">“${esc(b.note)}”</p>` : ''}
          ${b.top5 ? `<p class="bh-meta"><b>Geurwijzer:</b> ${esc(b.top5)}</p>` : ''}
          ${b.profile ? `<p class="bh-meta"><b>Profiel:</b> ${esc(b.profile)}</p>` : ''}
        </div>
        <div class="bh-card-side">
          <span class="bh-status bh-s-${b.status.replace(/\s/g, '-')}">${b.done ? 'afgerond' : b.status}</span>
          <p class="bh-money">${b.voucher ? 'Cadeaubon ' + esc(b.voucher) : `${euro(b.paid)} betaald<br>${euro(b.price - b.paid)} in de winkel`}</p>${terug(b) ? `<p class="bh-src">${euro(terug(b))} terugbetaald</p>` : ''}
          <p class="bh-src">${b.source === 'handmatig' ? 'Zelf ingepland' : 'Via de website'}${b.mock ? ' · test' : ''}</p>
          <div class="bh-card-actions">
            ${b.status === 'geboekt' ? `<button class="bh-btn bh-sm" data-done="${b.id}">${b.done ? 'Heropenen' : 'Afgerond'}</button>
            <button class="bh-btn bh-sm bh-danger" data-cancel="${b.id}">Annuleren</button>` : ''}
            ${creditKnop('booking', b, b.paid)}${b.factuur ? '' : `<button class="bh-btn bh-sm bh-weg" data-del="${b.id}" title="Definitief uit het overzicht halen">Verwijderen</button>`}
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
    let lijst = orFilter === 'open' ? state.orders.filter(o => OPEN.includes(o.status) || o.status === 'wacht op betaling') : state.orders;
    const zq = ($('orZoek').value || '').trim().toLowerCase(), zs = $('orStatus').value, zp = Number($('orPeriode').value) || 0;
    if (zq) lijst = lijst.filter(o => [o.name, o.email, o.phone, o.id, o.factuur && o.factuur.nummer, o.address, o.note, ...(o.items || []).map(i => i.name), ...(o.perfumes || [])].join(' ').toLowerCase().includes(zq));
    if (zs) lijst = lijst.filter(o => o.status === zs);
    if (zp) lijst = lijst.filter(o => o.created > Date.now() - zp * 86400000);
    const statussen = (state.statussen || []).filter(x => x !== 'betaald');
    $('orList').innerHTML = lijst.length ? lijst.map(o => `
      <article class="bh-card" data-order="${o.id}">
        <div class="bh-card-when"><b>${date(o.created)}</b><span class="bh-pill">${o.delivery === 'ophalen' ? 'Ophalen' : 'Verzenden'}</span>${o.factuur ? `<button class="bh-link" data-dl="factuur" data-id="${o.id}">Factuur ${esc(o.factuur.nummer)}</button>` : ''}${creditLinks('order', o)}${o.status !== 'wacht op betaling' ? `<button class="bh-link" data-dl="pakbon" data-id="${o.id}">Pakbon</button>` : ''}</div>
        <div class="bh-card-main">
          <p class="bh-name">${esc(o.name)} <small class="bh-ref">#${esc(o.id.toUpperCase())}</small></p>
          <p class="bh-contact">${o.phone ? `<a href="tel:${esc(o.phone)}">${esc(o.phone)}</a> · ` : ''}<a href="mailto:${esc(o.email)}">${esc(o.email)}</a></p>
          <ul class="bh-items">${o.items.map(i => `<li>${i.qty}× ${esc(i.name)}</li>`).join('')}</ul>
          ${o.perfumes && o.perfumes.length ? `<p class="bh-meta"><b>Samples:</b> ${o.perfumes.map(esc).join(' · ')}</p>` : ''}
          ${o.address ? `<p class="bh-meta"><b>Adres:</b> ${esc(o.address)}</p>` : ''}
          ${o.korting ? `<p class="bh-meta"><b>Korting:</b> ${esc(o.korting.code)} (-${euro(o.korting.cents)})</p>` : ''}
          ${o.trackTrace ? `<p class="bh-meta"><b>Track &amp; trace:</b> ${esc(o.trackTrace)}</p>` : ''}
          <p class="bh-meta bh-notitie"><b>Privénotitie</b> <small>alleen voor jou</small> <span data-note="${o.id}" contenteditable="true" spellcheck="false" data-leeg="Klik om iets te noteren">${esc(o.note || '')}</span></p>
        </div>
        <div class="bh-card-side">
          <span class="bh-status bh-s-${o.status.replace(/\s/g, '-')}">${o.status}</span>
          <p class="bh-money">${euro(o.total)}</p>${terug(o) ? `<p class="bh-src">${euro(terug(o))} terugbetaald</p>` : ''}${o.mock ? '<p class="bh-src">test</p>' : ''}
          ${o.status !== 'wacht op betaling' ? `<div class="bh-card-actions bh-statusrow">
            <select class="bh-select" data-status="${o.id}">${statussen.map(st => `<option value="${st}" ${st === o.status ? 'selected' : ''}>${st}</option>`).join('')}</select>
            ${o.delivery === 'verzenden' ? `<input class="bh-tt" data-tt="${o.id}" placeholder="track & trace (optioneel)" value="${esc(o.trackTrace || '')}">` : ''}
            <button class="bh-btn bh-sm bh-gold" data-setstatus="${o.id}">Status opslaan</button>
          </div>` : ''}
          <div class="bh-card-actions">${creditKnop('order', o, o.total)}${o.factuur ? '' : `<button class="bh-btn bh-sm bh-weg" data-delorder="${o.id}" title="Definitief uit het overzicht halen">Verwijderen</button>`}</div>
        </div>
      </article>`).join('') : `<p class="bh-empty">${zq || zs || zp ? 'Geen bestellingen gevonden met deze filters.' : orFilter === 'open' ? 'Niets te doen. Alles is afgehandeld.' : 'Nog geen bestellingen.'}</p>`;
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

  ['orZoek', 'orStatus', 'orPeriode'].forEach(id => $(id).addEventListener('input', () => {
    if ($('orZoek').value || $('orStatus').value || $('orPeriode').value) { orFilter = 'alle'; $('orFilter').querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x.dataset.f === 'alle')); }
    renderOrders();
  }));
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
    const notities = state.notities || {};
    const rows = alle.filter(k => !q || k.naam.toLowerCase().includes(q) || k.email.includes(q) || ((notities[k.email] || {}).notitie || '').toLowerCase().includes(q));
    const totaal = k => k.besteed + (k.oud ? k.oud.besteed : 0);
    $('klStats').innerHTML = `<span><b>${alle.length}</b> klanten</span><span><b>${euro(alle.reduce((s, k) => s + totaal(k), 0))}</b> besteed</span>`;
    const imp = state.klantenImport;
    $('klImportInfo').hidden = !imp;
    if (imp) $('klImportInfo').textContent = `${imp.aantal} klanten uit je oude webshop staan erin (geïmporteerd ${date(imp.geimporteerd)}${imp.bestand ? ` uit ${imp.bestand}` : ''}). Opnieuw importeren vervangt die lijst.`;
    $('klList').innerHTML = rows.length ? rows.map(k => `
      <article class="bh-card bh-klant${open === k.email ? ' is-open' : ''}" data-klant="${esc(k.email)}">
        <div class="bh-card-main">
          <p class="bh-name">${esc(k.naam || k.email)}${(notities[k.email] || {}).notitie ? ' <span class="bh-pill bh-pill-notitie" title="Heeft een privénotitie">notitie</span>' : ''}${k.bestellingen + k.boekingen > 1 ? ' <span class="bh-pill">vaste klant</span>' : ''}${k.oud ? ' <span class="bh-pill" title="Klant uit je vorige webshop">oude webshop</span>' : ''}</p>
          <p class="bh-contact">${k.tel ? `<a href="tel:${esc(k.tel)}">${esc(k.tel)}</a> · ` : ''}<a href="mailto:${esc(k.email)}">${esc(k.email)}</a></p>
        </div>
        <div class="bh-card-side">
          <p class="bh-money">${euro(totaal(k))}</p>
          <p class="bh-src">${k.bestellingen || !k.oud ? `${k.bestellingen} ${k.bestellingen === 1 ? 'bestelling' : 'bestellingen'}` : 'nog niet op de nieuwe site'}${k.boekingen ? ` · ${k.boekingen} ${k.boekingen === 1 ? 'experience' : 'experiences'}` : ''}</p>
          ${k.oud && k.oud.besteed ? `<p class="bh-src">waarvan ${euro(k.oud.besteed)} in de oude webshop</p>` : ''}
          <p class="bh-src">laatst ${date(k.laatst)}</p>
        </div>
        ${open === k.email ? klantKaart(k, notities[k.email]) : ''}
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
  let open = null;
  function klantKaart(k, n) {
    const mail = k.email;
    const best = state.orders.filter(o => String(o.email).toLowerCase() === mail).sort((a, b) => b.created - a.created);
    const boek = state.bookings.filter(b => String(b.email).toLowerCase() === mail);
    return `<div class="bh-kaart">
      <div class="bh-kaart-kol">
        <h4>Aankopen</h4>
        ${best.map(o => `<p class="bh-kaart-regel"><span>${date(o.created)}</span><span>${esc((o.items || []).map(i => i.qty + '× ' + i.name).join(', '))}</span><b>${euro(o.total)}</b><em class="bh-status bh-s-${o.status.replace(/\s/g, '-')}">${esc(o.status)}</em></p>`).join('') || '<p class="bh-meta">Geen bestellingen.</p>'}
        ${boek.length ? `<h4>Experience</h4>${boek.map(b => `<p class="bh-kaart-regel"><span>${when(b.slot)}</span><span>${gezelschap(b)}</span><b>${euro(b.paid || 0)}</b><em class="bh-status">${esc(b.status)}</em></p>`).join('')}` : ''}
        ${k.oud ? `<h4>Oude webshop</h4><p class="bh-kaart-regel"><span>klant sinds ${k.oud.sinds ? date(k.oud.sinds) : 'onbekend'}</span><span>samen besteed</span><b>${euro(k.oud.besteed)}</b></p>` : ''}
        ${(state.geurwijzer || []).filter(g => g.email === mail).slice(0, 3).map(g => `<h4>Geurwijzer <small>${date(g.created)}</small></h4><p class="bh-meta">${esc(g.top5.join(' · '))}</p>`).join('')}
      </div>
      <div class="bh-kaart-kol">
        <h4>Privénotitie <small>alleen voor jou, nooit zichtbaar voor de klant</small></h4>
        <textarea class="bh-kaart-notitie" data-klantnotitie="${esc(mail)}" rows="5" placeholder="Bijvoorbeeld: houdt van oud en saffraan, verjaardag in maart, komt vaak op zaterdag">${esc(n ? n.notitie : '')}</textarea>
        <div class="bh-card-actions">
          <button class="bh-btn bh-sm bh-gold" data-klantopslaan="${esc(mail)}">Notitie opslaan</button>
          <button class="bh-btn bh-sm bh-weg" data-klantwissen="${esc(mail)}" title="Voor een verzoek om gegevens te verwijderen">Gegevens wissen</button>
        </div>
        ${n && n.t ? `<p class="bh-meta">Laatst bijgewerkt ${date(n.t)}</p>` : ''}
      </div>
    </div>`;
  }
  $('klList').addEventListener('click', async e => {
    const opslaan = e.target.closest('[data-klantopslaan]'), wissen = e.target.closest('[data-klantwissen]');
    if (opslaan) {
      const email = opslaan.dataset.klantopslaan;
      const tekst = $('klList').querySelector(`[data-klantnotitie="${CSS.escape(email)}"]`).value;
      try { await api({ action: 'klantNotitie', email, notitie: tekst }); state.notities = state.notities || {}; if (tekst.trim()) state.notities[email] = { notitie: tekst.trim(), t: Date.now() }; else delete state.notities[email]; toast('Notitie bewaard'); renderKlanten(); } catch (x) { toast(x.message, true); }
      return;
    }
    if (wissen) {
      if (!confirm('Privénotitie, wachtlijst, geurwijzer en gegevens uit de oude webshop van deze klant wissen?\n\nBestellingen en facturen blijven bewaard, omdat die wettelijk zeven jaar bewaard moeten worden.')) return;
      try { const r = await api({ action: 'klantWissen', email: wissen.dataset.klantwissen }); toast(`Gewist${r.gewist ? ` (ook ${r.gewist} ${r.gewist === 1 ? 'aanmelding' : 'aanmeldingen'} en profielen)` : ''}`); await loadOverview(); renderKlanten(); } catch (x) { toast(x.message, true); }
      return;
    }
    if (e.target.closest('a, button, textarea, .bh-kaart')) return;
    const kaart = e.target.closest('[data-klant]'); if (!kaart) return;
    open = open === kaart.dataset.klant ? null : kaart.dataset.klant;
    renderKlanten();
  });
  $('wlList').addEventListener('click', async e => {
    const b = e.target.closest('[data-delwl]'); if (!b) return;
    try { await api({ action: 'wachtlijstDelete', id: b.dataset.delwl }); await loadOverview(); } catch (x) { toast(x.message, true); }
  });

  /* klantenexport van de oude webshop (CSV uit PrestaShop) */
  $('klImportKnop').addEventListener('click', () => $('klImportBestand').click());
  $('klImportBestand').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (state.klantenImport && !confirm(`Er staan al ${state.klantenImport.aantal} klanten uit de oude webshop in. Vervangen door dit bestand?`)) return;
    try {
      const r = await api({ action: 'klantenImport', csv: await f.text(), bestand: f.name });
      toast(`${r.aantal} klanten geïmporteerd${r.samengevoegd ? `, ${r.samengevoegd} dubbele samengevoegd` : ''}${r.overgeslagen ? `, ${r.overgeslagen} test- of spamaccounts overgeslagen` : ''}`);
      await loadOverview(); renderKlanten();
    } catch (x) { toast(x.message, true); }
  });

  /* ── geurwijzer ── */
  const GW_GEZIEN = 'bh-gw-gezien';
  const gwLaatst = () => { try { return Number(localStorage.getItem(GW_GEZIEN)) || 0; } catch (x) { return 0; } };
  function gwBadge() {
    const n = (state.geurwijzer || []).filter(g => g.created > gwLaatst()).length;
    $('badgeGw').hidden = !n; $('badgeGw').textContent = n;
  }
  function gwGezien() {
    try { localStorage.setItem(GW_GEZIEN, String(Date.now())); } catch (x) { /* */ }
    gwBadge();
  }
  let gwOpen = null;
  function renderGeurwijzer() {
    const q = ($('gwZoek').value || '').trim().toLowerCase();
    const alle = state.geurwijzer || [];
    const rows = alle.filter(g => !q || [g.name, g.email, g.phone, ...g.top5].join(' ').toLowerCase().includes(q));
    const week = alle.filter(g => Date.now() - g.created < 7 * 86400000).length;
    const telling = {};
    alle.forEach(g => g.top5.slice(0, 1).forEach(n => { telling[n] = (telling[n] || 0) + 1; }));
    const vaakst = Object.entries(telling).sort((a, b) => b[1] - a[1])[0];
    $('gwStats').innerHTML = `<span><b>${alle.length}</b> ingevuld</span><span><b>${week}</b> deze week</span>${vaakst ? `<span>vaakst nr. 1: <b>${esc(vaakst[0])}</b></span>` : ''}`;
    const klant = new Set((state.klanten || []).map(k => k.email));
    $('gwList').innerHTML = rows.length ? rows.map(g => `
      <article class="bh-card bh-klant${gwOpen === g.id ? ' is-open' : ''}" data-gw="${esc(g.id)}">
        <div class="bh-card-when"><b>${date(g.created)}</b>${klant.has(g.email) ? '<span class="bh-pill">klant</span>' : ''}</div>
        <div class="bh-card-main">
          <p class="bh-name">${esc(g.name)}</p>
          <p class="bh-contact">${g.phone ? `<a href="tel:${esc(g.phone)}">${esc(g.phone)}</a> · ` : ''}<a href="mailto:${esc(g.email)}">${esc(g.email)}</a></p>
          <p class="bh-note">${g.top5.map((n, i) => `${i + 1}. ${esc(n)}`).join(' &nbsp; ')}</p>
        </div>
        <div class="bh-card-side"><div class="bh-card-actions">
          <a class="bh-btn bh-sm" href="https://wa.me/${esc(String(g.phone).replace(/\D/g, '').replace(/^0/, '31'))}?text=${encodeURIComponent(`Hoi ${g.name}, je deed de geurwijzer op onze site. Je top 3: ${g.top5.slice(0, 3).join(', ')}. Zin om ze te komen ruiken?`)}" target="_blank" rel="noopener">WhatsApp</a>
          <button class="bh-btn bh-sm bh-weg" data-delgw="${esc(g.id)}">Wissen</button>
        </div></div>
        ${gwOpen === g.id ? `<div class="bh-kaart">
          <div class="bh-kaart-kol">
            <h4>Geurprofiel</h4>
            ${g.zin ? `<p class="bh-meta">${esc(g.zin)}</p>` : ''}
            ${g.profiel.length ? `<p>${g.profiel.map(c => `<span class="bh-pill">${esc(c)}</span>`).join(' ')}</p>` : ''}
            <h4>Top 5</h4>
            ${g.top5.map((n, i) => `<p class="bh-kaart-regel"><span>${i + 1}</span><span><a href="/geur/${esc(n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))}" target="_blank" rel="noopener">${esc(n)}</a></span></p>`).join('')}
          </div>
          <div class="bh-kaart-kol">
            <h4>Antwoorden</h4>
            ${g.antwoorden.map(a => `<p class="bh-kaart-regel"><span>${esc(a.q)}</span><b>${esc(a.a.join(', ') || '–')}</b></p>`).join('') || '<p class="bh-meta">Geen antwoorden bewaard.</p>'}
          </div>
        </div>` : ''}
      </article>`).join('') : `<p class="bh-empty">${alle.length ? 'Niemand gevonden.' : 'Nog niemand heeft de geurwijzer ingevuld sinds deze functie aanstaat.'}</p>`;
  }
  $('gwZoek').addEventListener('input', renderGeurwijzer);
  $('gwList').addEventListener('click', async e => {
    const del = e.target.closest('[data-delgw]');
    if (del) {
      if (!confirm('Deze inzending wissen? Dat kan niet ongedaan worden.')) return;
      try { await api({ action: 'geurwijzerDelete', id: del.dataset.delgw }); toast('Gewist'); await loadOverview(); } catch (x) { toast(x.message, true); }
      return;
    }
    if (e.target.closest('a, button, .bh-kaart')) return;
    const kaart = e.target.closest('[data-gw]'); if (!kaart) return;
    gwOpen = gwOpen === kaart.dataset.gw ? null : kaart.dataset.gw;
    renderGeurwijzer();
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
    ['naam', 'tel', 'straat', 'postcode', 'plaats', 'email', 'kvk', 'btwNummer', 'iban', 'btwPct', 'factuurPrefix', 'factuurVolgend'].forEach(k => { f[k].value = bedrijf[k] == null ? '' : bedrijf[k]; });
    f.gratisVanaf.value = fmt((bedrijf.gratisVanaf || 0) / 100);
    f.olie.value = bedrijf.olie === false ? 'nee' : 'ja';
    f.olie6.value = fmt((bedrijf.olie6 || 0) / 100);
    f.olie13.value = fmt((bedrijf.olie13 || 0) / 100);
  }
  $('bedrijfForm').addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try { await api({ action: 'bedrijfSave', bedrijf: d }); toast('Opgeslagen'); await loadBedrijf(); } catch (x) { toast(x.message, true); }
  });

  /* ── producten ── */
  async function loadProducts() {
    state.products = await api({ action: 'productsList' });
    state.reviews = (await api({ action: 'reviewsList' })).reviews;
    renderCustom();
    renderBase();
  }
  const fmt = v => v == null ? '' : String(v).replace('.', ',');
  /* video bij een geur: uploaden, bekijken, weghalen */
  function videoBlok(n) {
    const v = (state.products.videos || {})[n];
    return `<div class="bh-video" data-video-n="${esc(n)}">
      ${v ? `<a class="bh-video-prev" href="${esc(v.url)}" target="_blank" rel="noopener">${v.poster ? `<img src="${esc(v.poster)}" alt="">` : ''}<i aria-hidden="true"></i></a>` : ''}
      <p class="bh-meta"><b>Video:</b> ${v ? `staat op de productpagina${v.datum ? ' sinds ' + esc(v.datum.split('-').reverse().join('-')) : ''}` : 'nog geen'}</p>
      <label class="bh-btn bh-sm bh-upload">${v ? 'Andere video' : 'Video toevoegen'}<input type="file" accept="${window.EliandiVideo ? EliandiVideo.accept : 'video/*'}" data-videoup hidden></label>
      ${v ? '<button type="button" class="bh-btn bh-sm bh-danger" data-videoweg>Video weghalen</button>' : ''}
      <span class="bh-voortgang" aria-live="polite"></span>
    </div>`;
  }
  async function videoWissel(blok, bestand) {
    const n = blok.dataset.videoN, tel = blok.querySelector('.bh-voortgang');
    try {
      let video = null;
      if (bestand) {
        tel.textContent = 'Voorbereiden…';
        blok.classList.add('is-bezig');
        video = await EliandiVideo.upload(bestand, api, pct => { tel.textContent = `Uploaden… ${pct}%`; });
      }
      const waarschuwing = video && video.waarschuwing;
      if (video) delete video.waarschuwing;
      await api({ action: 'productVideo', n, video });
      toast(bestand ? 'Video staat op de productpagina' : 'Video weggehaald');
      if (waarschuwing) alert(waarschuwing);
      state.products = await api({ action: 'productsList' });
      renderCustom(); renderBase();
    } catch (x) { toast(x.message, true); tel.textContent = ''; blok.classList.remove('is-bezig'); }
  }
  ['customList', 'baseList'].forEach(id => {
    $(id).addEventListener('change', e => {
      const inp = e.target.closest('[data-videoup]');
      if (inp && inp.files[0]) videoWissel(inp.closest('.bh-video'), inp.files[0]);
    });
    $(id).addEventListener('click', e => {
      const weg = e.target.closest('[data-videoweg]');
      if (!weg) return;
      e.preventDefault();
      if (confirm('Deze video van de productpagina halen?')) videoWissel(weg.closest('.bh-video'), null);
    });
  });
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
        ${videoBlok(p.n)}
      </article>`).join('') : '';
  }
  function renderBase() {
    const q = $('prodSearch').value.trim().toLowerCase();
    const metTags = $('prodMetTags').checked;
    let rows = state.products.base;
    if (metTags) rows = rows.filter(p => p.tags);
    rows = q.length < 2 && !metTags ? [] : rows.filter(p => !q || p.n.toLowerCase().includes(q) || String(p.tags || '').toLowerCase().includes(q)).slice(0, metTags ? 60 : 12);
    renderTags();
    $('baseList').innerHTML = rows.map(p => `
      <form class="bh-card bh-prod bh-base" data-n="${esc(p.n)}">
        <div class="bh-card-main"><p class="bh-name">${esc(p.n)}</p>${p.tags ? `<div class="bh-tagrij">${p.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => `<span class="bh-tag">${esc(t)}</span>`).join('')}</div>` : ''}</div>
        <div class="bh-base-fields">
          ${['30', '50', '100'].map((ml, i) => `<label>${ml} ml<input name="v${i}" value="${fmt(p.v[i])}" inputmode="decimal"></label>`).join('')}
          ${['30', '50', '100', 'olie 6', 'olie 13'].map((ml, i) => `<label>Voorraad ${ml}<input name="s${i}" value="${p.stock && p.stock[i] != null ? p.stock[i] : ''}" inputmode="numeric" placeholder="∞"></label>`).join('')}
          <label class="bh-tags">Zoektermen<input name="tags" value="${esc(p.tags || '')}" placeholder="bijv. Bleu de Chanel"></label>
          <label class="bh-check"><input type="checkbox" name="hidden" ${p.hidden ? 'checked' : ''}> Verbergen</label>
          <button class="bh-btn bh-sm bh-gold" type="submit">Opslaan</button>
        </div>
        ${videoBlok(p.n)}
        <div class="bh-reviews" data-product="${esc(p.n)}">
          <p class="bh-meta"><b>Reviews:</b> ${(state.reviews && state.reviews[p.n] || []).map(r => `<span class="bh-review">${'★'.repeat(r.sterren)} ${esc(r.naam)}: “${esc(r.tekst.slice(0, 60))}${r.tekst.length > 60 ? '…' : ''}” <button type="button" class="bh-x" data-delreview="${r.id}" title="Verwijderen">×</button></span>`).join('') || 'nog geen'}</p>
          <div class="bh-review-add"><input data-rv="naam" placeholder="Naam klant"><select data-rv="sterren"><option>5</option><option>4</option><option>3</option></select><input data-rv="tekst" placeholder="Wat zei de klant?"><button type="button" class="bh-btn bh-sm" data-addreview="${esc(p.n)}">Review toevoegen</button></div>
        </div>
      </form>`).join('') || (q.length >= 2 ? '<p class="bh-empty">Geen parfum gevonden.</p>' : '');
  }
  $('prodSearch').addEventListener('input', renderBase);
  $('prodMetTags').addEventListener('change', renderBase);
  function renderTags() {
    const lijst = [...state.products.base, ...(state.products.custom || []).map(p => ({ ...p, eigen: true }))].filter(p => p.tags);
    $('tagTel').textContent = lijst.length ? `${lijst.length} ${lijst.length === 1 ? 'geur' : 'geuren'}` : '';
    $('tagLijst').innerHTML = lijst.length ? lijst.sort((a, b) => a.n.localeCompare(b.n)).map(p => `<button type="button" class="bh-tagregel" data-tagnaam="${esc(p.n)}"><b>${esc(p.n)}${p.eigen ? ' <small>(eigen)</small>' : ''}</b><span>${p.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => `<i class="bh-tag">${esc(t)}</i>`).join('')}</span></button>`).join('')
      : '<p class="bh-empty">Nog geen zoektermen. Voeg ze toe bij een geur hierboven.</p>';
  }
  $('tagLijst').addEventListener('click', e => {
    const b = e.target.closest('[data-tagnaam]'); if (!b) return;
    $('prodMetTags').checked = false; $('prodSearch').value = b.dataset.tagnaam; renderBase();
    $('prodSearch').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
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
      await api({ action: 'productOverride', n: f.dataset.n, v: [d.v0, d.v1, d.v2], stock: [d.s0, d.s1, d.s2, d.s3, d.s4], tags: d.tags || '', hidden: Boolean(d.hidden) });
      toast('Opgeslagen');
      state.products = await api({ action: 'productsList' });
      renderTags();
    } catch (x) { toast(x.message, true); }
  });

  $('prodForm').addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await api({ action: 'productSave', product: { id: d.id || undefined, n: d.n, g: d.g, f: d.f, t: d.t, h: d.h, b: d.b, i: d.i, v: [d.v0, d.v1, d.v2], tags: d.tags } });
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
      f.v0.value = fmt(p.v[0]); f.v1.value = fmt(p.v[1]); f.v2.value = fmt(p.v[2]); f.tags.value = p.tags || '';
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

  /* ── downloads: link die vijf minuten geldig is ── */
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-dl]'); if (!b) return;
    e.preventDefault();
    const pdf = b.dataset.dl === 'factuur' || b.dataset.dl === 'pakbon';
    /* venster meteen openen, anders blokkeert Safari het */
    const w = pdf ? window.open('', '_blank') : null;
    try {
      const { url } = await api({ action: 'downloadLink', soort: b.dataset.dl, id: b.dataset.id || '-' });
      if (w) w.location = url; else { const a = document.createElement('a'); a.href = url; a.download = ''; document.body.append(a); a.click(); a.remove(); }
    } catch (x) { if (w) w.close(); toast(x.message, true); }
  });

  /* ── vandaag ── */
  const vandaagStr = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date());
  const dagVan = ts => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date(ts));
  const BETAALD = o => !['wacht op betaling', 'geannuleerd', 'verlopen'].includes(o.status);
  function kpi(label, waarde, sub, cls) { return `<div class="bh-kpi ${cls || ''}"><span>${label}</span><b>${waarde}</b>${sub ? `<small>${sub}</small>` : ''}</div>`; }
  function renderVandaag() {
    if (!state.orders) return;
    const nu = new Date(), u = nu.getHours();
    $('vdGroet').textContent = u < 6 ? 'Goedenacht, Angelo' : u < 12 ? 'Goedemorgen, Angelo' : u < 18 ? 'Goedemiddag, Angelo' : 'Goedenavond, Angelo';
    $('vdDatum').textContent = nu.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
    const vandaag = vandaagStr();
    const startWeek = Date.now() - 6 * 86400000, startMaand = Date.now() - 29 * 86400000;
    const omzet = from => state.orders.filter(o => BETAALD(o) && o.created >= from).reduce((t, o) => t + o.total, 0)
      + state.bookings.filter(b => b.status === 'geboekt' && b.created >= from).reduce((t, b) => t + (b.paid || 0), 0);
    const vandaagStart = state.orders.concat(state.bookings).filter(x => dagVan(x.created) === vandaag).reduce((m, x) => Math.min(m, x.created), Date.now());
    const omzetVandaag = state.orders.filter(o => BETAALD(o) && dagVan(o.created) === vandaag).reduce((t, o) => t + o.total, 0)
      + state.bookings.filter(b => b.status === 'geboekt' && dagVan(b.created) === vandaag).reduce((t, b) => t + (b.paid || 0), 0);
    const todo = state.orders.filter(o => OPEN.includes(o.status));
    $('vdKpis').innerHTML = kpi('Omzet vandaag', euro(omzetVandaag)) + kpi('Laatste 7 dagen', euro(omzet(startWeek))) + kpi('Laatste 30 dagen', euro(omzet(startMaand)))
      + kpi('Te doen', todo.length, todo.length ? 'bestellingen klaarmaken' : 'alles is afgehandeld', todo.length ? 'is-let' : '');
    $('vdTodo').innerHTML = todo.length ? todo.slice(0, 6).map(o => `<button class="bh-regel" data-ga="bestellingen" data-zoek="${esc(o.id)}"><b>${esc(o.name)}</b><span>${esc((o.items || []).map(i => i.qty + '× ' + i.name).join(', '))}</span><em>${o.delivery === 'ophalen' ? 'ophalen' : 'verzenden'} · ${euro(o.total)}</em></button>`).join('')
      + (todo.length > 6 ? `<p class="bh-meta">en nog ${todo.length - 6}</p>` : '') : '<p class="bh-leeg">Niets klaar te maken. Mooi zo.</p>';
    const morgen = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date(Date.now() + 86400000));
    const boek = state.bookings.filter(b => b.status === 'geboekt' && (b.slot.startsWith(vandaag) || b.slot.startsWith(morgen)));
    $('vdBoek').innerHTML = boek.length ? boek.map(b => `<div class="bh-regel"><b>${b.slot.startsWith(vandaag) ? 'Vandaag' : 'Morgen'} ${b.slot.slice(11)}</b><span>${esc(b.name)} · ${gezelschap(b)}</span><em>${b.phone ? `<a href="tel:${esc(b.phone)}">${esc(b.phone)}</a>` : ''}</em></div>`).join('') : '<p class="bh-leeg">Geen Experience vandaag of morgen.</p>';
    const laag = state.voorraadLaag || [];
    $('vdVoorraad').innerHTML = laag.length ? laag.slice(0, 8).map(v => `<div class="bh-regel"><b>${esc(v.n)}</b><span>${esc(v.maat)}</span><em class="${v.over === 0 ? 'bh-rood' : ''}">${v.over === 0 ? 'uitverkocht' : 'nog ' + v.over}</em></div>`).join('') : '<p class="bh-leeg">Geen voorraad die bijna op is. Voorraad bijhouden doe je per geur bij Producten.</p>';
    const afgebroken = state.orders.filter(o => o.status === 'wacht op betaling' && Date.now() - o.created > 3600000 && Date.now() - o.created < 7 * 86400000);
    const wl = state.wachtlijst || [];
    const items = [];
    if (afgebroken.length) items.push(`<div class="bh-regel"><b>${afgebroken.length} afgebroken ${afgebroken.length === 1 ? 'betaling' : 'betalingen'}</b><span>deze week, samen ${euro(afgebroken.reduce((t, o) => t + o.total, 0))}. Ze krijgen na een dag automatisch één herinnering.</span><em><button class="bh-link-btn" data-ga="bestellingen" data-status="wacht op betaling">Bekijk</button></em></div>`);
    if (wl.length) items.push(`<div class="bh-regel"><b>${wl.length} op de wachtlijst</b><span>voor de Experience</span><em><button class="bh-link-btn" data-ga="klanten">Bekijk</button></em></div>`);
    const gw = (state.geurwijzer || []).filter(g => g.created > gwLaatst());
    if (gw.length) items.push(`<div class="bh-regel"><b>${gw.length} ${gw.length === 1 ? 'nieuwe geurwijzer' : 'nieuwe geurwijzers'}</b><span>${esc(gw.slice(0, 3).map(g => g.name).join(', '))}${gw.length > 3 ? ' en meer' : ''}: bel of app ze met hun top 5</span><em><button class="bh-link-btn" data-ga="geurwijzer">Bekijk</button></em></div>`);
    if (!state.tweestap) items.push(`<div class="bh-regel"><b>Beveilig je dashboard</b><span>Zet tweestapsverificatie aan, dan kan niemand inloggen zonder jouw telefoon.</span><em><button class="bh-link-btn" data-ga="account">Instellen</button></em></div>`);
    $('vdOpvolgen').innerHTML = items.join('') || '<p class="bh-leeg">Niets op te volgen.</p>';
    void vandaagStart;
  }
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-ga]'); if (!g || g.closest('#nav')) return;
    naarTab(g.dataset.ga);
    if (g.dataset.zoek) { $('orZoek').value = g.dataset.zoek; $('orZoek').dispatchEvent(new Event('input')); }
    if (g.dataset.status) { $('orStatus').value = g.dataset.status; $('orStatus').dispatchEvent(new Event('input')); }
  });

  /* ── inzichten ── */
  let inDagen = 30;
  const pct = x => (x == null ? '–' : (x * 100).toFixed(1).replace('.', ',') + '%');
  const verschil = (nu, toen) => {
    if (!toen) return '';
    const d = (nu - toen) / toen;
    return `<i class="${d >= 0 ? 'bh-op' : 'bh-neer'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))}%</i> t.o.v. de periode ervoor`;
  };
  const kortDatum = d => new Date(d + 'T12:00:00Z').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  function staven(el, data, waarde, label) {
    /* één reeks, één kleur; elke staaf heeft een tooltip met datum en waarde */
    const max = Math.max(1, ...data.map(waarde));
    const groep = data.length > 120 ? 7 : 1;
    const punten = groep === 1 ? data : data.reduce((acc, x, i) => { const k = Math.floor(i / groep); (acc[k] = acc[k] || []).push(x); return acc; }, []).map(g => ({ d: g[0].d, tot: g[g.length - 1].d, ...Object.fromEntries(['omzet', 'bezoek', 'bestellingen'].map(k => [k, g.reduce((t, y) => t + (y[k] || 0), 0)])) }));
    const m = Math.max(1, ...punten.map(waarde));
    el.innerHTML = `<div class="bh-bars-plot" style="--n:${punten.length}">${punten.map(x => { const v = waarde(x); return `<span class="bh-bar${v ? '' : ' is-nul'}" style="--h:${(v / m * 100).toFixed(1)}%" data-tip="${kortDatum(x.d)}${x.tot ? ' – ' + kortDatum(x.tot) : ''}: ${label(v)}" tabindex="0"></span>`; }).join('')}</div>
      <div class="bh-bars-as"><span>${kortDatum(punten[0].d)}</span><span>${label(m)} hoogste</span><span>${kortDatum(punten[punten.length - 1].d)}</span></div>`;
    void max;
  }
  function lijstBalken(rijen, maxV) {
    const m = maxV || Math.max(1, ...rijen.map(r => r.v));
    return rijen.length ? rijen.map(r => `<div class="bh-hbar" data-tip="${esc(r.tip || '')}"><span class="bh-hbar-label">${esc(r.l)}</span><span class="bh-hbar-spoor"><span style="width:${Math.max(1.5, r.v / m * 100).toFixed(1)}%"></span></span><b>${r.t}</b></div>`).join('') : '<p class="bh-leeg">Nog geen gegevens in deze periode.</p>';
  }
  async function loadInzichten() {
    try {
      const d = await api({ action: 'inzichten', dagen: inDagen });
      const t = d.totaal;
      $('inUitleg').textContent = `Bezoeken worden zonder cookies geteld: één bezoek per browservenster, geen persoonsgegevens.${d.meetSinds ? ` Gemeten sinds ${kortDatum(d.meetSinds)}.` : ' De meting is net gestart; cijfers bouwen vanaf nu op.'}`;
      $('inKpis').innerHTML = kpi('Omzet', euro(t.omzet), verschil(t.omzet, t.omzetVorig))
        + kpi('Bezoeken', t.bezoek.toLocaleString('nl-NL'), verschil(t.bezoek, t.bezoekVorig))
        + kpi('Conversie', pct(t.conversie), 'bezoeken die bestelden of boekten')
        + kpi('Bestellingen', t.bestellingen, `gemiddeld ${euro(t.gemiddeld)}`)
        + kpi('Experiences', t.boekingen, `${t.personen} ${t.personen === 1 ? 'persoon' : 'personen'} · ${euro(t.omzetExperience)}`)
        + kpi('Verlaten winkelwagens', t.verlaten, 'wel iets in de mand, niet naar afrekenen')
        + kpi('Afgebroken betalingen', t.afgebroken, t.afgebroken ? `samen ${euro(t.afgebrokenWaarde)}` : 'niemand haakte af bij betalen')
        + kpi('Klanten', t.nieuweKlanten + t.terugkerend, `${t.nieuweKlanten} nieuw · ${t.terugkerend} terugkerend`)
        + kpi('Geurwijzer', t.geurwijzer, `${t.geurwijzerKlaar} keer helemaal afgerond`);
      staven($('inOmzet'), d.perDag, x => x.omzet, euro);
      staven($('inBezoek'), d.perDag, x => x.bezoek, v => `${v} ${v === 1 ? 'bezoek' : 'bezoeken'}`);
      const top = d.trechter[0].n || 0;
      $('inTrechter').innerHTML = lijstBalken(d.trechter.map((r, i) => ({ l: r.stap, v: r.n, t: `${r.n.toLocaleString('nl-NL')}${i && top ? ` <small>${pct(r.n / top)}</small>` : ''}` })), top || 1);
      $('inSoort').innerHTML = lijstBalken(Object.entries(d.soort).filter(([, v]) => v).map(([l, v]) => ({ l, v, t: `${v}×` })));
      $('inBest').innerHTML = lijstBalken(d.bestsellers.map(b => ({ l: b.n, v: b.stuks, t: `${b.stuks}× <small>${euro(b.omzet)}</small>` })));
      $('inBekeken').innerHTML = lijstBalken(d.bekeken.map(b => ({ l: b.q.replace(/-/g, ' '), v: b.n, t: `${b.n}×` })));
      $('inZoek').innerHTML = lijstBalken(d.zoekTop.map(b => ({ l: b.q, v: b.n, t: `${b.n}×` })));
      $('inLeeg').innerHTML = lijstBalken(d.zoekLeeg.map(b => ({ l: b.q, v: b.n, t: `${b.n}×` })));
      $('inKorting').innerHTML = lijstBalken(d.kortingen.map(k => ({ l: k.code, v: k.keer, t: `${k.keer}× <small>${euro(k.korting)} korting</small>` })));
    } catch (x) { toast(x.message, true); }
  }
  $('inPeriode').addEventListener('click', e => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    inDagen = Number(b.dataset.d);
    $('inPeriode').querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x === b));
    loadInzichten();
  });
  /* tooltip voor staven en balken, ook met het toetsenbord */
  const tip = document.createElement('div'); tip.className = 'bh-tip'; tip.hidden = true; document.body.append(tip);
  const toonTip = el => { const r = el.getBoundingClientRect(); tip.textContent = el.dataset.tip; tip.hidden = !el.dataset.tip; tip.style.left = Math.min(innerWidth - 12 - tip.offsetWidth, Math.max(12, r.left + r.width / 2 - tip.offsetWidth / 2)) + 'px'; tip.style.top = (r.top + scrollY - tip.offsetHeight - 8) + 'px'; };
  ['mouseover', 'focusin'].forEach(t => document.addEventListener(t, e => { const el = e.target.closest('.bh-bar[data-tip]'); if (el) toonTip(el); }));
  ['mouseout', 'focusout'].forEach(t => document.addEventListener(t, e => { if (e.target.closest('.bh-bar[data-tip]')) tip.hidden = true; }));

  /* ── account en beveiliging ── */
  async function loadAccount() {
    try {
      const d = await api({ action: 'beveiliging' });
      $('acTweestap').innerHTML = d.tweestap
        ? `<p class="bh-ok">✓ Staat aan. Inloggen kan alleen met je wachtwoord én de code uit je app.</p>
           <p class="bh-hint">Nog ${d.herstelOver} van de 8 herstelcodes over.${d.herstelOver <= 2 ? ' Zet tweestapsverificatie uit en weer aan voor nieuwe codes.' : ''}</p>
           <form class="bh-form" id="acTweestapUit"><label>Wachtwoord, om uit te zetten<input type="password" name="wachtwoord" required></label><button class="bh-btn bh-weg" type="submit">Tweestapsverificatie uitzetten</button></form>`
        : `<p class="bh-hint">Met tweestapsverificatie heeft iemand die je wachtwoord kent nog steeds je telefoon nodig. Je gebruikt een gratis app zoals Google Authenticator, Microsoft Authenticator of de ingebouwde codes van je iPhone.</p>
           <button class="bh-btn bh-gold" id="acTweestapAan">Instellen</button><div id="acTweestapStap"></div>`;
      $('acLog').innerHTML = d.logboek.length ? `<div class="bh-log">${d.logboek.map(l => `<p><span>${date(l.t)}</span><b>${esc(l.actie)}</b><em>${esc(l.info || '')}</em><small>${esc(l.apparaat || '')}${l.ip ? ' · ' + esc(l.ip) : ''}</small></p>`).join('')}</div>` : '<p class="bh-leeg">Nog niets gelogd.</p>';
    } catch (x) { toast(x.message, true); }
  }
  $('acTweestap').addEventListener('click', async e => {
    if (!e.target.closest('#acTweestapAan')) return;
    try {
      const d = await api({ action: 'tweestapStart' });
      const qr = window.qrcode ? (() => { const q = window.qrcode(0, 'M'); q.addData(d.uri); q.make(); return q.createSvgTag({ cellSize: 5, margin: 3, scalable: true }); })() : '';
      $('acTweestapStap').innerHTML = `<ol class="bh-stappen">
          <li>Open je authenticator-app en scan deze code.<div class="bh-qr">${qr}</div><small>Scannen lukt niet? Voer deze sleutel handmatig in: <code>${esc(d.secret.replace(/(.{4})/g, '$1 ').trim())}</code></small></li>
          <li>Vul de code van 6 cijfers in die de app nu laat zien.
            <form class="bh-inline" id="acTweestapCode"><input name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123 456" maxlength="7" required><button class="bh-btn bh-gold" type="submit">Bevestigen</button></form></li>
        </ol>`;
      e.target.closest('#acTweestapAan').hidden = true;
    } catch (x) { toast(x.message, true); }
  });
  $('acTweestap').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      if (f.id === 'acTweestapCode') {
        const { codes } = await api({ action: 'tweestapBevestig', code: f.code.value.replace(/\s/g, '') });
        $('acTweestap').innerHTML = `<p class="bh-ok">✓ Tweestapsverificatie staat aan.</p>
          <p><b>Bewaar deze herstelcodes op een veilige plek</b> (bijvoorbeeld uitgeprint in de kluis). Elke code werkt één keer, als je telefoon kwijt is. Je ziet ze maar één keer.</p>
          <div class="bh-herstel">${codes.map(c => `<code>${c}</code>`).join('')}</div>
          <button class="bh-btn" onclick="window.print()">Afdrukken</button> <button class="bh-btn bh-gold" id="acKlaar">Ik heb ze bewaard</button>`;
        state.tweestap = true; renderVandaag();
      }
      if (f.id === 'acTweestapUit') {
        if (!confirm('Tweestapsverificatie uitzetten? Je dashboard is dan alleen nog beveiligd met je wachtwoord.')) return;
        await api({ action: 'tweestapUit', wachtwoord: f.wachtwoord.value });
        toast('Tweestapsverificatie staat uit'); state.tweestap = false; loadAccount(); renderVandaag();
      }
    } catch (x) { toast(x.message, true); }
  });
  $('acTweestap').addEventListener('click', e => { if (e.target.closest('#acKlaar')) loadAccount(); });
  $('acWachtwoord').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    if (f.nieuw.value !== f.nogmaals.value) { toast('De twee nieuwe wachtwoorden zijn niet gelijk.', true); return; }
    try {
      const d = await api({ action: 'wachtwoordWijzigen', huidig: f.huidig.value, nieuw: f.nieuw.value });
      localStorage.setItem(TOKEN, d.token); f.reset();
      toast('Wachtwoord gewijzigd. Andere apparaten zijn uitgelogd.');
      loadAccount();
    } catch (x) { toast(x.message, true); }
  });
  $('acOveral').addEventListener('click', async () => {
    if (!confirm('Overal uitloggen? Alle andere telefoons en computers moeten opnieuw inloggen.')) return;
    try { const d = await api({ action: 'overalUitloggen' }); localStorage.setItem(TOKEN, d.token); toast('Overal uitgelogd behalve hier'); loadAccount(); } catch (x) { toast(x.message, true); }
  });

  /* ── start ── */
  async function start() {
    $('login').hidden = true;
    $('app').hidden = false;
    try { await loadOverview(); await loadAgenda(); } catch (x) { toast(x.message, true); }
    let tab = 'vandaag'; try { tab = sessionStorage.getItem('bh-tab') || 'vandaag'; } catch (x) { /* */ }
    naarTab(tab);
  }
  if (localStorage.getItem(TOKEN)) start();
  setInterval(() => { if (!$('app').hidden && !document.hidden) loadOverview().catch(() => {}); }, 60000);
})();
