/* GET /api/slots — beschikbare Experience-tijden en actuele prijzen. */
const { send, store } = require('./_lib');
const { VARIANTS, getSettings, priceOf, allSlots, slotsFor, slotStoreKey } = require('./_slots');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  try {
    const cfg = await getSettings();
    const slots = allSlots(cfg);
    const taken = await store.mget(slots.map(slotStoreKey));
    const free = new Set(slots.filter((_, i) => !taken[i]));
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
