/* ELIANDI — productpagina: maat kiezen, foto wisselen, in de winkelmand */
(() => {
  'use strict';
  const P = window.PRODUCT;
  if (!P) return;
  const ML = [30, 50, 100, 6, 13];
  const LABEL = i => (i >= 3 ? `${ML[i]} ml olie` : `${ML[i]} ml`);
  const euro = n => '€' + Number(n).toFixed(2).replace('.', ',');
  const $ = id => document.getElementById(id);
  let k = [...document.querySelectorAll('.pd-size')].findIndex(b => b.classList.contains('is-on'));

  function kies(i) {
    /* de olie-miniatuur kiest de kleinste leverbare olie */
    if (i === 3 && !P.v[3] && P.v[4]) i = 4;
    if (!P.v[i]) return;
    k = i;
    document.querySelectorAll('.pd-size').forEach(b => { const on = +b.dataset.k === i; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); });
    document.querySelectorAll('.pd-thumb').forEach(b => b.classList.toggle('is-on', +b.dataset.k === i || (+b.dataset.k === 3 && i === 4)));
    if ($('pdPrice')) $('pdPrice').textContent = euro(P.v[i]);
    if ($('pdStageMl')) $('pdStageMl').textContent = LABEL(i);
    const stage = $('pdStage');
    if (stage) { stage.querySelector('video')?.remove(); stage.classList.remove('is-video'); $('pdVideoKnop')?.classList.remove('is-on'); }
    if (stage && P.fotos[i]) {
      let img = stage.querySelector('img');
      if (!img) { img = document.createElement('img'); stage.prepend(img); stage.querySelector('svg')?.remove(); }
      img.src = '/' + P.fotos[i]; img.alt = `${P.n}, ${LABEL(i)}`;
    }
  }
  document.querySelectorAll('.pd-size, .pd-thumb[data-k]').forEach(b => b.addEventListener('click', () => kies(+b.dataset.k)));

  /* de video van Angelo: speelt in het grote vak, met geluid en knoppen */
  if (P.video && $('pdVideoKnop')) {
    $('pdVideoKnop').addEventListener('click', () => {
      const stage = $('pdStage');
      if (stage.querySelector('video')) return;
      const v = document.createElement('video');
      v.src = P.video.url; v.controls = true; v.playsInline = true; v.autoplay = true;
      v.setAttribute('playsinline', '');
      if (P.video.poster) v.poster = P.video.poster;
      v.setAttribute('aria-label', `Video van ${P.n}`);
      stage.prepend(v); stage.classList.add('is-video');
      document.querySelectorAll('.pd-thumb').forEach(b => b.classList.toggle('is-on', b.id === 'pdVideoKnop'));
      if ($('pdStageMl')) $('pdStageMl').textContent = 'Video';
    });
  }

  /* telefoon: een balk onderin met prijs en knop, zolang de echte knop niet in beeld is */
  if ($('pdAdd')) {
    const balk = document.createElement('div');
    balk.className = 'pd-balk';
    balk.innerHTML = `<div class="pd-balk-info"><b id="pdBalkPrijs"></b><small id="pdBalkMaat"></small></div><button type="button" class="btn btn-gold" id="pdBalkKnop">In winkelmand</button>`;
    document.body.append(balk);
    const zet = () => { if (k >= 0) { $('pdBalkPrijs').textContent = euro(P.v[k]); $('pdBalkMaat').textContent = `${P.n} · ${LABEL(k)}`; } };
    zet();
    new IntersectionObserver(([e]) => {
      document.body.classList.toggle('pd-balk-aan', !e.isIntersecting && k >= 0);
    }, { rootMargin: '0px 0px -40px 0px' }).observe(document.querySelector('.pd-buy') || $('pdAdd'));
    document.addEventListener('click', ev => { if (ev.target.closest('.pd-size, .pd-thumb')) setTimeout(zet, 0); });
    $('pdBalkKnop').addEventListener('click', () => { $('pdAdd').click(); $('pdBalkKnop').textContent = 'Toegevoegd ✓'; setTimeout(() => { $('pdBalkKnop').textContent = 'In winkelmand'; }, 1800); });
  }

  const add = $('pdAdd');
  if (add) add.addEventListener('click', () => {
    if (k < 0 || !window.EliandiCart) return;
    window.EliandiCart.add(P.n, ML[k], P.v[k], k >= 3 ? { kind: 'olie' } : undefined);
    add.textContent = 'Toegevoegd ✓'; add.classList.add('is-done');
    setTimeout(() => { add.textContent = 'In winkelmand'; add.classList.remove('is-done'); }, 1800);
  });

  /* recent bekeken: deze geur vooraan, de vorige als rij onderaan */
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem('eliandi_recent') || '[]'); } catch (e) { /* privémodus */ }
  const vorige = recent.filter(r => r.n !== P.n).slice(0, 8);
  /* foto van 50 ml (anders de eerste) voor de rij recent bekeken */
  const klein = f => (f ? f.replace(/\.webp$/, '-600.webp') : '');
  try { localStorage.setItem('eliandi_recent', JSON.stringify([{ n: P.n, s: P.slug, g: P.g, f: klein(P.fotos[1] || P.fotos[0] || '') }, ...vorige].slice(0, 12))); } catch (e) { /* privémodus */ }
  const box = $('pdRecent');
  if (box && vorige.length) {
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    box.innerHTML = `<p class="kicker">Recent bekeken</p><div class="pd-recent-row">${vorige.filter(r => r.s).map(r => `<a href="/geur/${esc(r.s)}"${r.f ? ' class="has-foto"' : ''}>${r.f ? `<img src="/${esc(r.f)}" alt="" loading="lazy">` : ''}<span>${esc(r.n)}</span></a>`).join('')}</div>`;
    box.hidden = false;
  }
})();
