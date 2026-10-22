/* GET /api/slots — beschikbare Experience-tijden en actuele prijzen.

   Per slot geven we 'run' mee: hoeveel aaneengesloten vrije halfuren
   er vanaf dat moment zijn. De site weet dan voor elk gezelschap of
   het past, zonder voor elke grootte apart te hoeven vragen. */
const { send, store } = require('./_lib');
const { getSettings, priceTable, allSlots, slotStoreKey, amsKey, slotEnd, plus30 } = require('./_slots');
const agenda = require('./_agenda');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  try {
    const cfg = await getSettings();
    const slots = allSlots(cfg);
    const taken = await store.mget(slots.map(slotStoreKey));
    const free = new Set(slots.filter((_, i) => !taken[i]));

    /* staat er al iets anders in de agenda van Angelo, dan gaat dat
       tijdstip ook dicht */
    if (agenda.enabled() && slots.length) {
      const nu = new Date();
      const perioden = await agenda.bezet(nu, new Date(nu.getTime() + (cfg.horizonDays + 2) * 86400000), amsKey);
      perioden.forEach(p => {
        slots.forEach(key => {
          if (key < p.tot && slotEnd(key) > p.van) free.delete(key);
        });
      });
    }

    const all = new Set(slots);
    const runFrom = key => {
      let n = 0, k = key;
      while (all.has(k) && free.has(k)) { n++; k = `${k.slice(0, 10)}T${plus30(k.slice(11))}`; }
      return n;
    };

    const days = [];
    slots.forEach(key => {
      const date = key.slice(0, 10);
      let day = days.find(d => d.date === date);
      if (!day) { day = { date, slots: [] }; days.push(day); }
      const run = runFrom(key);
      day.slots.push({ key, time: key.slice(11), free: run > 0, run });
    });

    send(res, 200, {
      people: {
        min: 1, max: cfg.maxPeople, minutesPerPerson: cfg.minutesPerPerson,
        extraPerPerson: cfg.extraPerPerson, options: priceTable(cfg),
      },
      depositPct: cfg.depositPct,
      days,
    });
  } catch (e) {
    console.error('slots', e.message);
    send(res, 500, { error: 'De agenda kon niet worden geladen.' });
  }
};
