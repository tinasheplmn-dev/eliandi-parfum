/* ELIANDI — anonieme meting voor de inzichten van Angelo.
   Geen cookies, geen persoonsgegevens: alleen "er was een bezoek",
   "iemand legde iets in de winkelmand" en zoekwoorden, als tellers.
   Per browsertab telt een bezoek één keer (sessionStorage). */
(() => {
  'use strict';
  const stuur = (e, extra) => {
    try {
      const body = JSON.stringify(Object.assign({ e }, extra || {}));
      if (navigator.sendBeacon) navigator.sendBeacon('/api/products', new Blob([body], { type: 'application/json' }));
      else fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch (x) { /* meten mag nooit iets breken */ }
  };
  const eersteKeer = k => { try { if (sessionStorage.getItem('em:' + k)) return false; sessionStorage.setItem('em:' + k, '1'); } catch (x) { /* privémodus */ } return true; };
  window.EliandiMeet = { event: stuur, eens: (e, extra) => { if (eersteKeer(e)) stuur(e, extra); } };
  if (/^(localhost|127\.)/.test(location.hostname) && !/meet=1/.test(location.search)) return; // lokaal niet meetellen
  if (location.hostname.endsWith('github.io')) return;
  window.EliandiMeet.eens('bezoek');
  const pad = location.pathname;
  if (pad.startsWith('/geur/')) stuur('product', { n: pad.slice(6).replace(/\/$/, '') });
  if (/afrekenen/.test(pad)) window.EliandiMeet.eens('afrekenen');
})();
