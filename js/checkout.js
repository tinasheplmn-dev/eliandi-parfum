/* ELIANDI — afrekenpagina: winkelmand + gegevens + levering -> /api/order */
(() => {
  'use strict';
  const SHIP = 4.95; // weergave; de server rekent met SHIPPING_PRICE_CENTS
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
        : i.ml + ' ml &middot; extrait de parfum'}</small></span>
      <b>${euro(i.p * i.qty)}</b></li>`).join('');
    const ship = delivery() === 'ship' ? SHIP : 0;
    $('coSub').textContent = euro(cart.total());
    $('coShip').textContent = ship ? euro(ship) : 'Gratis';
    $('coTotal').textContent = euro(cart.total() + ship);
    $('coAddress').hidden = delivery() !== 'ship';
  }

  document.querySelectorAll('input[name="delivery"]').forEach(r => r.addEventListener('change', render));
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
