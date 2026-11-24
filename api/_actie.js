/* Tijdelijke actie op flacons (extrait 30/50/100 ml), automatisch aan en uit.
   Black Friday 24 t/m 28 november 2026: de duurste flacon telt als 1e en
   krijgt 15%, de 2e 20%, de 3e en verder 25%. Olie, autoparfum, Discovery
   Set en huisparfum doen niet mee. Niet te combineren met een kortingscode:
   de hoogste korting telt. */
const ACTIE = { naam: 'Black Friday', van: '2026-11-24', tot: '2026-11-28', staffel: [15, 20, 25] };

const vandaag = (nu = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(nu);
const actief = (nu) => { const d = vandaag(nu); return d >= ACTIE.van && d <= ACTIE.tot; };

/* korting in centen over de regels van een bestelling ({ cents, qty, kind }) */
function korting(lines, nu) {
  if (!actief(nu)) return 0;
  const flacons = lines.filter(l => !l.kind).flatMap(l => Array(l.qty).fill(l.cents)).sort((a, b) => b - a);
  return flacons.reduce((t, c, i) => t + Math.round(c * ACTIE.staffel[Math.min(i, ACTIE.staffel.length - 1)] / 100), 0);
}

/* wat de browser moet weten om het te tonen en mee te rekenen */
const publiek = nu => (actief(nu) ? { naam: ACTIE.naam, tot: ACTIE.tot, staffel: ACTIE.staffel } : null);

module.exports = { ACTIE, actief, korting, publiek };
