/* GET /api/slots — beschikbare Experience-tijden en actuele prijzen. */
const { send, store } = require('./_lib');
const { VARIANTS, getSettings, priceOf, allSlots, slotsFor, slotStoreKey, amsKey, slotEnd } = require('./_slots');
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
    const days = [];
    slots.forEach(key => {
      const date = key.slice(0, 10);
      let day = days.find(d => d.date === date);
      if (!day) { day = { date, slots: [] }; days.push(day); }
      const duo = slotsFor(cfg, key, 'duo');
      day.slots.push({
        key, time: key.slice(11),
        free: free.has(key),
        duoFree: Boolean(duo && duo.every(k => free.has(k))),
      });
    });
    const variants = {};
    Object.entries(VARIANTS).forEach(([k, v]) => {
      variants[k] = { label: v.label, minutes: v.minutes, people: v.people, ...priceOf(cfg, k) };
    });
    send(res, 200, { variants, depositPct: cfg.depositPct, days });
  } catch (e) {
    console.error('slots', e.message);
    send(res, 500, { error: 'De agenda kon niet worden geladen.' });
  }
};
