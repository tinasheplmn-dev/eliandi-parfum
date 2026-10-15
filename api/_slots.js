/* ═══════════════════════════════════════════════════════════════
   De Eliandi Experience — agenda en formules

   Standaardwaarden hieronder; Angelo past ze aan in het dashboard
   (opgeslagen als 'cms:settings'). Alle tijden in Nederlandse tijd,
   ook als de server in UTC draait. Een slot heet 'YYYY-MM-DDTHH:MM'.
   ═══════════════════════════════════════════════════════════════ */
const { store } = require('./_lib');

const DEFAULTS = {
  priceSolo: 7500,          // €75, één persoon, 50 ml extrait op maat
  priceDuo: 14000,          // €140, twee personen, twee keer 50 ml
  depositPct: 50,           // aanbetaling online, de rest in de winkel
  schedule: {               // weekdag (0 = zondag) -> starttijden
    2: ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30'],
    4: ['18:00', '18:30', '19:00', '19:30'],
  },
  blockedDates: [],         // hele dagen dicht, bijv. '2026-12-24'
  horizonDays: 42,
  leadMinutes: 180,
};

const VARIANTS = {
  solo: { label: 'Solo', slots: 1, minutes: 30, priceKey: 'priceSolo', people: 1 },
  duo: { label: 'Duo', slots: 2, minutes: 60, priceKey: 'priceDuo', people: 2 },
};

const HOLD_SECONDS = 32 * 60;
const TZ = 'Europe/Amsterdam';

async function getSettings() {
  const saved = await store.getJson('cms:settings', {});
  return { ...DEFAULTS, ...saved, schedule: saved.schedule || DEFAULTS.schedule };
}

function priceOf(cfg, variant) {
  const v = VARIANTS[variant] || VARIANTS.solo;
  const price = cfg[v.priceKey];
  return { price, deposit: Math.round(price * cfg.depositPct / 100) };
}

function amsKey(date) {
  const o = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).forEach(p => { o[p.type] = p.value; });
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}

const plus30 = t => {
  const [h, m] = t.split(':').map(Number);
  const x = h * 60 + m + 30;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

/* Alle boekbare startmomenten binnen de horizon, oplopend. */
function allSlots(cfg, now = new Date()) {
  const today = amsKey(now).slice(0, 10);
  const [y, m, d] = today.split('-').map(Number);
  const earliest = amsKey(new Date(now.getTime() + cfg.leadMinutes * 60000));
  const out = [];
  for (let i = 0; i <= cfg.horizonDays; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i));
    const times = cfg.schedule[day.getUTCDay()];
    if (!times || !times.length) continue;
    const ds = day.toISOString().slice(0, 10);
    if (cfg.blockedDates.includes(ds)) continue;
    times.forEach(t => { const key = `${ds}T${t}`; if (key >= earliest) out.push(key); });
  }
  return out;
}

/* De sleutels die een formule op dit startmoment bezet (duo = 2 halfuren). */
function slotsFor(cfg, start, variant, now) {
  const v = VARIANTS[variant] || VARIANTS.solo;
  const all = allSlots(cfg, now);
  if (!all.includes(start)) return null;
  const keys = [start];
  let t = start.slice(11);
  for (let i = 1; i < v.slots; i++) {
    t = plus30(t);
    const next = `${start.slice(0, 10)}T${t}`;
    if (!all.includes(next)) return null;
    keys.push(next);
  }
  return keys;
}

const slotStoreKey = key => 'exp:' + key;

module.exports = { DEFAULTS, VARIANTS, HOLD_SECONDS, getSettings, priceOf, allSlots, slotsFor, slotStoreKey };
