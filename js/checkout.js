/* ELIANDI — afrekenpagina: winkelmand + gegevens + levering -> /api/order */
(() => {
  'use strict';
  const SHIP = 4.95; // weergave; de server rekent met SHIPPING_PRICE_CENTS
  let gratisVanaf = 0;      // drempel in euro's, komt van de server
  let korting = null;       // { code, pct?, bedrag? } alleen voor de weergave; de server beslist
  fetch('/api/products', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(d => {
    if (d && d.gratisVanaf) { gratisVanaf = d.gratisVanaf / 100; render(); }
  }).catch(() => {});
  const $ = id => document.getElementById(id);
  const cart = window.EliandiCart;
  const euro = cart.euro;

  // gegevens uit de geurwijzer vooraf invullen
  try {
    const lead = JSON.parse(localStorage.getItem('eliandi_leads') || '[]').pop();
    if (lead) {
      $('coName').value = lead.name || '';
      $('coEmail').value = lead.email || '';
      $('coPhone').value = lead.phone || '';
    }
  } catch (e) { /* privémodus */ }

  const delivery = () => document.querySelector('input[name="delivery"]:checked').value;

  function render() {
    const items = cart.items();
    $('coEmpty').hidden = items.length > 0;
    $('coForm').hidden = items.length === 0;
    if (!items.length) return;
    $('coLines').innerHTML = items.map(i => `
      <li><span>${i.qty}&times; ${i.n}<small>${i.kind === 'discovery'
        ? '5 &times; 10 ml &middot; ' + (i.perfumes || []).join(', ')
        : i.kind === 'olie' ? i.ml + ' ml &middot; parfumolie'
        : i.ml + ' ml &middot; extrait de parfum'}</small></span>
      <b>${euro(i.p * i.qty)}</b></li>`).join('');
    const sub = cart.total();
    const disc = korting ? Math.min(sub, korting.pct ? sub * korting.pct / 100 : korting.bedrag) : 0;
    const naKorting = sub - disc;
    const gratis = gratisVanaf && naKorting >= gratisVanaf;
    const ship = delivery() === 'ship' ? (gratis ? 0 : SHIP) : 0;
    $('coSub').textContent = euro(sub);
    $('coDiscRow').hidden = !disc;
    if (disc) { $('coDiscLabel').textContent = `Korting (${korting.code})`; $('coDisc').textContent = '-' + euro(disc); }
    $('coShip').textContent = ship ? euro(ship) : 'Gratis';
    $('coTotal').textContent = euro(naKorting + ship);
    $('coAddress').hidden = delivery() !== 'ship';
    const free = $('coFree');
    if (gratisVanaf && delivery() === 'ship') {
      free.hidden = false;
      free.innerHTML = gratis ? '✦ Je hebt gratis verzending.' : `Nog <b>${euro(gratisVanaf - naKorting)}</b> tot gratis verzending.`;
    } else free.hidden = true;
  }

  document.querySelectorAll('input[name="delivery"]').forEach(r => r.addEventListener('change', render));

  /* kortingscode: we vragen de server wat hij waard is, zodat de weergave klopt */
  $('coCodeBtn').addEventListener('click', async () => {
    const code = $('coCode').value.trim().toUpperCase();
    const msg = $('coCodeMsg');
    if (!code) { korting = null; msg.textContent = ''; render(); return; }
    const r = await fetch('/api/products?code=' + encodeURIComponent(code) + '&sub=' + Math.round(cart.total() * 100));
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.korting) { korting = null; msg.textContent = d.error || 'Deze code kennen we niet.'; msg.classList.add('is-bad'); }
    else { korting = { code: d.korting.code, pct: d.korting.pct, bedrag: d.korting.bedrag }; msg.textContent = `✦ ${d.korting.label} toegepast.`; msg.classList.remove('is-bad'); }
    render();
  });
  document.addEventListener('cart:change', render);

  $('coForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('coError');
    const btn = $('coPay');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Een moment…';
    try {
      const resp = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.items().map(i => ({ n: i.n, ml: i.ml, qty: i.qty, kind: i.kind, perfumes: i.perfumes })),
          customer: { name: $('coName').value, email: $('coEmail').value, phone: $('coPhone').value },
          delivery: delivery(),
          code: korting ? korting.code : '',
          address: { street: $('coStreet').value, postcode: $('coPostcode').value, city: $('coCity').value, country: $('coCountry').value },
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.url) throw new Error(data.error || 'Er ging iets mis.');
      try {
        localStorage.setItem('eliandi_last_purchase', JSON.stringify({
          type: 'order', items: cart.items(), delivery: delivery(), ts: Date.now(),
        }));
      } catch (x) { /* privémodus */ }
      window.location.href = data.url;
    } catch (x) {
      err.textContent = x.message;
      btn.disabled = false;
      btn.textContent = 'Betalen';
    }
  });

  if (new URLSearchParams(location.search).get('geannuleerd')) {
    $('coError').textContent = 'De betaling is afgebroken. Je winkelmand staat nog klaar.';
  }
  render();
})();
