/* ELIANDI — balk bovenaan tijdens een actie (zie api/_actie.js) */
(() => {
  'use strict';
  fetch('/api/products', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(d => {
    const a = d && d.actie;
    if (!a || document.querySelector('.actie-balk')) return;
    const [d1, d2, d3] = a.staffel;
    const tot = new Date(a.tot + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
    const balk = document.createElement('a');
    balk.className = 'actie-balk'; balk.href = '/shop';
    balk.innerHTML = `<b>${a.naam}</b> t/m ${tot}: 1e fles ${d1}%, 2e fles ${d2}%, 3e fles en verder ${d3}% korting`;
    document.body.prepend(balk);
    document.body.classList.add('met-actie');
    /* vaste kopbalken schuiven onder de actiebalk */
    const hoogte = () => document.documentElement.style.setProperty('--actie-h', balk.offsetHeight + 'px');
    hoogte(); addEventListener('resize', hoogte, { passive: true });
  }).catch(() => {});
})();
