/* ═══════════════════════════════════════════════════════════════
   ELIANDI — winkelmand (gedeeld door geurwijzer en afrekenpagina)

   Bewaard in localStorage. De getoonde prijs is alleen weergave;
   de server rekent altijd opnieuw met api/_prices.json.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  const KEY = 'eliandi_cart';
  const euro = n => '€' + n.toFixed(2).replace('.', ',');

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  /* twee regels zijn dezelfde regel als ook de inhoud gelijk is: twee
     Discovery Sets met andere geuren blijven dus apart staan */
  const same = (a, b) => a.n === b.n && a.ml === b.ml && (a.kind || '') === (b.kind || '')
    && (a.perfumes || []).join('|') === (b.perfumes || []).join('|');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const meta = i => i.kind === 'discovery'
    ? '5 &times; 10 ml &middot; ' + esc((i.perfumes || []).join(', '))
    : i.kind === 'olie' ? esc(i.ml) + ' ml &middot; parfumolie'
    : esc(i.ml) + ' ml &middot; extrait de parfum';
  const write = items => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* privémodus */ }
    render();
    document.dispatchEvent(new CustomEvent('cart:change', { detail: items }));
  };

  const api = {
    items: read,
    count: () => read().reduce((s, i) => s + i.qty, 0),
    total: () => read().reduce((s, i) => s + i.qty * i.p, 0),
    /* extra (optioneel): { kind: 'discovery', perfumes: [..5..] } */
    add(n, ml, p, extra) {
      const items = read();
      const line = Object.assign({ n, ml, p, qty: 1 }, extra || {});
      const hit = items.find(i => same(i, line));
      if (hit) hit.qty = Math.min(10, hit.qty + 1); else items.push(line);
      write(items);
      open();
    },
    setQty(idx, qty) {
      const items = read();
      if (!items[idx]) return;
      if (qty < 1) items.splice(idx, 1); else items[idx].qty = Math.min(10, qty);
      write(items);
    },
    clear: () => write([]),
    euro,
  };
  api.gratisVanaf = 0;
  window.EliandiCart = api;
  fetch('/api/products', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(d => {
    if (d && d.gratisVanaf) { api.gratisVanaf = d.gratisVanaf / 100; render(); }
  }).catch(() => {});

  /* ── knop + lade, in huisstijl ── */
  const btn = document.createElement('button');
  btn.className = 'cart-fab';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Winkelmand openen');
  btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg><b class="cart-count">0</b>`;

  const drawer = document.createElement('aside');
  drawer.className = 'cart-drawer';
  drawer.setAttribute('aria-label', 'Winkelmand');
  drawer.innerHTML = `
    <div class="cart-head">
      <p class="cart-title">Jouw winkelmand</p>
      <button class="cart-close" type="button" aria-label="Sluiten">&times;</button>
    </div>
    <ul class="cart-lines"></ul>
    <div class="cart-foot">
      <p class="cart-free"></p>
      <p class="cart-sum"><span>Subtotaal</span><b class="cart-total"></b></p>
      <a class="btn btn-gold cart-go" href="afrekenen.html">Afrekenen</a>
    </div>`;
  const veil = document.createElement('div');
  veil.className = 'cart-veil';

  function open() { document.body.classList.add('cart-open'); }
  function close() { document.body.classList.remove('cart-open'); }
  btn.addEventListener('click', open);
  veil.addEventListener('click', close);
  drawer.querySelector('.cart-close').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  function render() {
    const items = read();
    btn.querySelector('.cart-count').textContent = api.count();
    btn.classList.toggle('has-items', items.length > 0);
    const ul = drawer.querySelector('.cart-lines');
    ul.innerHTML = items.length ? items.map((i, idx) => `
      <li>
        <div class="cart-line-main">
          <p class="cart-line-name">${esc(i.n)}</p>
          <p class="cart-line-meta">${meta(i)}</p>
        </div>
        <div class="cart-qty">
          <button type="button" data-q="${idx}" data-d="-1" aria-label="Minder">&minus;</button>
          <span>${i.qty}</span>
          <button type="button" data-q="${idx}" data-d="1" aria-label="Meer">+</button>
        </div>
        <p class="cart-line-price">${euro(i.p * i.qty)}</p>
      </li>`).join('') : '<li class="cart-empty">Nog leeg. Kies een geur uit jouw selectie.</li>';
    drawer.querySelector('.cart-total').textContent = euro(api.total());
    drawer.querySelector('.cart-foot').hidden = !items.length;
    const free = drawer.querySelector('.cart-free');
    if (api.gratisVanaf && items.length) {
      const rest = api.gratisVanaf - api.total();
      free.innerHTML = rest > 0 ? `Nog <b>${euro(rest)}</b> tot gratis verzending` : '✦ Gratis verzending';
      free.hidden = false;
    } else free.hidden = true;
  }
  drawer.addEventListener('click', e => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    const items = read();
    const idx = +b.dataset.q;
    api.setQty(idx, items[idx].qty + Number(b.dataset.d));
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.nocartfab === undefined) document.body.append(btn);
    document.body.append(veil, drawer);
    render();
  });
})();
