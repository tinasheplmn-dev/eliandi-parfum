/* ELIANDI — productpagina: maat kiezen, foto wisselen, in de winkelmand */
(() => {
  'use strict';
  const P = window.PRODUCT;
  if (!P) return;
  const ML = [30, 50, 100];
  const euro = n => '€' + Number(n).toFixed(2).replace('.', ',');
  const $ = id => document.getElementById(id);
  let k = [...document.querySelectorAll('.pd-size')].findIndex(b => b.classList.contains('is-on'));

  function kies(i) {
    if (!P.v[i]) return;
    k = i;
    document.querySelectorAll('.pd-size').forEach(b => { const on = +b.dataset.k === i; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); });
    document.querySelectorAll('.pd-thumb').forEach(b => b.classList.toggle('is-on', +b.dataset.k === i));
    if ($('pdPrice')) $('pdPrice').textContent = euro(P.v[i]);
    if ($('pdStageMl')) $('pdStageMl').textContent = ML[i] + ' ml';
    const stage = $('pdStage');
    if (stage && P.fotos[i]) {
      let img = stage.querySelector('img');
      if (!img) { img = document.createElement('img'); stage.prepend(img); stage.querySelector('svg')?.remove(); }
      img.src = '/' + P.fotos[i]; img.alt = `${P.n}, flacon van ${ML[i]} ml`;
    }
  }
  document.querySelectorAll('.pd-size, .pd-thumb').forEach(b => b.addEventListener('click', () => kies(+b.dataset.k)));

  const add = $('pdAdd');
  if (add) add.addEventListener('click', () => {
    if (k < 0 || !window.EliandiCart) return;
    window.EliandiCart.add(P.n, ML[k], P.v[k]);
    add.textContent = 'Toegevoegd ✓'; add.classList.add('is-done');
    setTimeout(() => { add.textContent = 'In winkelmand'; add.classList.remove('is-done'); }, 1800);
  });
})();
