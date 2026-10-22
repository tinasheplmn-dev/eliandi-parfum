/* ═══════════════════════════════════════════════════════════════
   The Eliandi Experience — agenda en prijzen per gezelschap

   Een sessie is voor 1 tot en met maxPeople personen. De prijs loopt
   op per persoon volgens de prijstabel; daarboven komt er een vast
   bedrag per extra persoon bij. De duur is minutesPerPerson keer het
   aantal personen, afgerond naar hele halfuren.

   Standaardwaarden hieronder; Angelo past ze aan in het dashboard
   (opgeslagen als 'cms:settings'). Alle tijden in Nederlandse tijd,
   ook als de server in UTC draait. Een slot heet 'YYYY-MM-DDTHH:MM'.
   ═══════════════════════════════════════════════════════════════ */
const { store } = require('./_lib');

const DEFAULTS = {
  prices: [7495, 13995, 19995, 24995, 27995], // 1 t/m 5 personen, in centen
  extraPerPerson: 5000,     // elke persoon boven de tabel: €50 erbij
  minutesPerPerson: 30,     // duur van de sessie per persoon
  maxPeople: 6,             // meer past niet aan de geurtafel
  depositPct: 50,           // aanbetaling online, de rest in de winkel
  schedule: {               // weekdag (0 = zondag) -> starttijden
    2: ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30'],
    4: ['18:00', '18:30', '19:00', '19:30'],
  },
  blockedDates: [],         // hele dagen dicht, bijv. '2026-12-24'
  horizonDays: 42,
  leadMinutes: 180,
};

const HOLD_SECONDS = 32 * 60;
const TZ = 'Europe/Amsterdam';

async function getSettings() {
  const saved = await store.getJson('cms:settings', {});
  const cfg = { ...DEFAULTS, ...saved, schedule: saved.schedule || DEFAULTS.schedule };
  /* oude instellingen (Solo/Duo) netjes meenemen */
  if (!Array.isArray(cfg.prices) || !cfg.prices.length) {
    cfg.prices = DEFAULTS.prices.slice();
    if (saved.priceSolo) cfg.prices[0] = saved.priceSolo;
    if (saved.priceDuo) cfg.prices[1] = saved.priceDuo;
  }
  cfg.maxPeople = Math.max(1, Math.min(12, parseInt(cfg.maxPeople, 10) || DEFAULTS.maxPeople));
  cfg.minutesPerPerson = Math.max(10, parseInt(cfg.minutesPerPerson, 10) || DEFAULTS.minutesPerPerson);
  return cfg;
}

/* Hoeveel personen: een getal, of de oude namen uit eerdere boekingen. */
function peopleFrom(cfg, v) {
  if (v === 'duo') return 2;
  if (v === 'solo') return 1;
  const n = parseInt(v, 10);
  if (!n || n < 1) return 1;
  return Math.min(n, cfg.maxPeople);
}

function priceFor(cfg, people) {
  const t = cfg.prices;
  if (people <= t.length) return t[people - 1];
  return t[t.length - 1] + cfg.extraPerPerson * (people - t.length);
}

function minutesFor(cfg, people) {
  return Math.ceil((cfg.minutesPerPerson * people) / 30) * 30;
}

/* Alles wat een gezelschap van n personen kost en inneemt. */
function priceOf(cfg, people) {
  const n = peopleFrom(cfg, people);
  const price = priceFor(cfg, n);
  const minutes = minutesFor(cfg, n);
  return { people: n, price, deposit: Math.round(price * cfg.depositPct / 100), minutes, slots: minutes / 30 };
}

/* Een regel per gezelschapsgrootte, voor de site en het dashboard. */
function priceTable(cfg) {
  return Array.from({ length: cfg.maxPeople }, (_, i) => priceOf(cfg, i + 1));
}

const label = people => people === 1 ? 'Solo' : `${people} personen`;

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

/* De halfuren die een gezelschap vanaf dit startmoment bezet; null als
   ze niet aaneengesloten in de agenda staan. */
function slotsFor(cfg, start, people, now) {
  const { slots } = priceOf(cfg, people);
  const all = allSlots(cfg, now);
  if (!all.includes(start)) return null;
  const keys = [start];
  let t = start.slice(11);
  for (let i = 1; i < slots; i++) {
    t = plus30(t);
    const next = `${start.slice(0, 10)}T${t}`;
    if (!all.includes(next)) return null;
    keys.push(next);
  }
  return keys;
}

const slotStoreKey = key => 'exp:' + key;

/* Een slot duurt een half uur; dit is het einde ervan. */
const slotEnd = key => `${key.slice(0, 10)}T${plus30(key.slice(11))}`;

module.exports = {
  DEFAULTS, HOLD_SECONDS, TZ, getSettings, peopleFrom, priceOf, priceTable, label,
  allSlots, slotsFor, slotStoreKey, amsKey, slotEnd, plus30,
};
