/* ═══════════════════════════════════════════════════════════════
   ELIANDI — eerlijke melding op een host zonder server.

   GitHub Pages zet alleen bestanden neer: de functies in api/
   draaien daar niet. Reserveren, bestellen en het beheer kunnen
   dan niets doen. In plaats van knoppen die stilletjes falen,
   zeggen we hier gewoon hoe het zit.

   Op localhost en op Vercel antwoordt /api/slots gewoon, dan
   gebeurt er niets van dit alles.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  const TEL = '06 87 08 02 56';

  const banner = () => {
    const bar = document.createElement('div');
    bar.className = 'geen-server';
    bar.innerHTML = `<span>Je kijkt naar een voorbeeldlink. Reserveren, bestellen en het beheer werken hier nog niet,
      die draaien straks op de definitieve hosting. Vragen? Bel Angelo op <a href="tel:+31687080256">${TEL}</a>.</span>
      <button type="button" aria-label="Melding sluiten">&times;</button>`;
    const style = document.createElement('style');
    style.textContent = `
      .geen-server{position:fixed;left:0;right:0;bottom:0;z-index:9998;display:flex;align-items:center;gap:14px;
        justify-content:center;padding:12px 18px;background:#17150f;border-top:1px solid #d4a73c;
        font:400 13px/1.6 Montserrat,system-ui,sans-serif;color:#f2ecdf;text-align:center}
      .geen-server a{color:#e9c767}
      .geen-server button{background:none;border:0;color:#e9c767;font-size:20px;line-height:1;cursor:pointer;padding:0 4px}
      @media (max-width:700px){.geen-server{font-size:12px;padding:10px 14px}}`;
    document.head.append(style);
    bar.querySelector('button').addEventListener('click', () => bar.remove());
    document.body.append(bar);
  };

  /* het beheer heeft een server nodig; laat dat zien in plaats van
     een inlogveld dat nooit iets kan doen */
  const beheer = () => {
    const card = document.querySelector('#loginForm');
    if (!card) return;
    card.innerHTML = `
      <img src="assets/logo-eliandi.png" alt="" class="bh-login-logo">
      <p class="bh-login-kicker">Beheer</p>
      <p class="bh-err" style="color:#f2ecdf;line-height:1.8">Het beheer werkt alleen op de definitieve hosting,
      omdat boekingen en wijzigingen op een server bewaard worden. Op deze voorbeeldlink staan alleen de pagina's.</p>
      <p class="bh-err" style="line-height:1.8">Vragen? Bel ${TEL}.</p>`;
    card.addEventListener('submit', e => e.preventDefault());
  };

  fetch('/api/slots', { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error('geen api'); return r.json(); })
    .catch(() => { banner(); beheer(); });
})();
