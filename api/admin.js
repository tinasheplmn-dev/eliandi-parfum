/* ═══════════════════════════════════════════════════════════════
   POST /api/admin — alle acties van het beheerdashboard.
   Body: { action, ... }. Alles behalve 'login' vereist het token
   (Authorization: Bearer ...) dat 'login' teruggeeft.
   ═══════════════════════════════════════════════════════════════ */
const { send, readJson, clean, store, newId, makeToken, isAdmin, checkPassword, sanitizeHtml } = require('./_lib');
const { DEFAULTS, getSettings, peopleFrom, priceOf, priceTable, slotsFor, slotStoreKey } = require('./_slots');
const { saveBooking, setBookingStatus, holdSlots, getBooking } = require('./_records');
const { analyze, getCustom, getOverrides, BASE_PRICES } = require('./_catalog');

const PAGES = ['index', 'experience', 'quiz'];
const TIME = /^([01]\d|2[0-3]):(00|30)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function list(idx, prefix) {
  const ids = await store.smembers(idx);
  const items = await store.mgetJson(ids.map(id => prefix + id));
  return items.filter(Boolean);
}

/* wat staat er aan: agenda en betaalprovider */
function koppelingen() {
  return {
    agenda: require('./_agenda').enabled(),
    betalen: require('./_mollie').enabled() ? 'mollie'
      : (process.env.STRIPE_SECRET_KEY ? 'stripe' : 'test'),
  };
}

const actions = {
  /* ── inloggen ── */
  async login(req, b) {
    await new Promise(r => setTimeout(r, 400)); // remt raden af
    if (!checkPassword(req, b.password)) return [401, { error: 'Onjuist wachtwoord.' }];
    return [200, { token: makeToken(req), persistent: store.persistent }];
  },

  /* ── overzicht: boekingen, bestellingen, cadeaubonnen ── */
  async overview() {
    const [bookings, orders, vouchers] = await Promise.all([
      list('idx:bookings', 'booking:'), list('idx:orders', 'order:'), list('idx:vouchers', 'voucher:'),
    ]);
    const now = Date.now();
    bookings.forEach(b => {
      if (b.status === 'wacht op betaling' && now - b.created > 35 * 60000) b.status = 'verlopen';
    });
    bookings.sort((a, b) => a.slot.localeCompare(b.slot));
    orders.sort((a, b) => b.created - a.created);
    vouchers.sort((a, b) => b.created - a.created);
    return [200, { bookings, orders, vouchers, persistent: store.persistent, koppelingen: koppelingen() }];
  },

  async bookingCancel(req, b) {
    const bk = await setBookingStatus(clean(b.id, 20), 'geannuleerd');
    return bk ? [200, { ok: true }] : [404, { error: 'Boeking niet gevonden.' }];
  },

  /* definitief weghalen uit het overzicht. Een boeking die nog staat
     wordt eerst geannuleerd, zodat het tijdstip vrijkomt en de
     afspraak uit de agenda van Angelo verdwijnt. */
  async recordDelete(req, b) {
    const soort = b.soort === 'order' ? 'order' : b.soort === 'voucher' ? 'voucher' : 'booking';
    const id = clean(b.id, 30);
    if (!id) return [400, { error: 'Welke wil je weghalen?' }];
    if (soort === 'booking') {
      const bk = await getBooking(id);
      if (!bk) return [404, { error: 'Niet gevonden.' }];
      if (bk.status === 'geboekt') await setBookingStatus(id, 'geannuleerd');
      await store.del('booking:' + id);
      await store.srem('idx:bookings', id);
    } else if (soort === 'order') {
      await store.del('order:' + id);
      await store.srem('idx:orders', id);
    } else {
      const code = id.toUpperCase();
      await store.del('voucher:' + code);
      await store.srem('idx:vouchers', code);
    }
    return [200, { ok: true }];
  },

  async bookingDone(req, b) {
    const bk = await getBooking(clean(b.id, 20));
    if (!bk) return [404, { error: 'Boeking niet gevonden.' }];
    bk.done = !bk.done;
    await saveBooking(bk);
    return [200, { ok: true }];
  },

  /* handmatig inplannen (telefoon, winkel); zonder betaling */
  async bookingAdd(req, b) {
    const cfg = await getSettings();
    const people = peopleFrom(cfg, b.people !== undefined ? b.people : b.variant);
    const slot = clean(b.slot, 16);
    const keys = slotsFor({ ...cfg, leadMinutes: 0 }, slot, people); // handmatig mag ook op korte termijn
    if (!keys) return [400, { error: `Dit moment past niet voor ${people} ${people === 1 ? 'persoon' : 'personen'}: het valt buiten de agenda of er zijn te weinig halfuren achter elkaar.` }];
    const name = clean(b.name, 80);
    if (!name) return [400, { error: 'Vul een naam in.' }];
    const id = newId(6);
    if (!(await holdSlots(keys, id, 0))) return [409, { error: 'Dit moment is al bezet.' }];
    const { price, minutes } = priceOf(cfg, people);
    await saveBooking({
      id, people, minutes, slot, slots: keys, name, email: clean(b.email, 120), phone: clean(b.phone, 30),
      note: clean(b.note, 600), profile: '', top5: '', price, deposit: 0, paid: 0,
      status: 'geboekt', source: 'handmatig', voucher: '', created: Date.now(),
    });
    await setBookingStatus(id, 'geboekt');
    return [200, { ok: true }];
  },

  /* één moment dichtzetten of weer openen */
  async slotToggle(req, b) {
    const slot = clean(b.slot, 16);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slot)) return [400, { error: 'Ongeldig moment.' }];
    const cur = await store.getJson(slotStoreKey(slot));
    if (cur && cur.status === 'blocked') { await store.del(slotStoreKey(slot)); return [200, { blocked: false }]; }
    if (cur) return [409, { error: 'Op dit moment staat al een boeking.' }];
    await store.setJson(slotStoreKey(slot), { status: 'blocked' });
    return [200, { blocked: true }];
  },

  async agenda() {
    const cfg = await getSettings();
    const { allSlots } = require('./_slots');
    const slots = allSlots(cfg);
    const vals = await store.mgetJson(slots.map(slotStoreKey));
    return [200, { slots: slots.map((s, i) => ({ slot: s, state: vals[i] ? vals[i].status : 'vrij', bookingId: vals[i] && vals[i].bookingId })) }];
  },

  /* ── instellingen Experience ── */
  async settingsGet() {
    const settings = await getSettings();
    return [200, { settings, defaults: DEFAULTS, table: priceTable(settings) }];
  },
  async settingsSave(req, b) {
    const s = b.settings || {};
    const euro = v => { const n = Math.round(parseFloat(String(v).replace(',', '.')) * 100); return n >= 0 ? n : null; };
    const out = {};
    /* prijstabel: één bedrag per gezelschapsgrootte, daarboven een vast bedrag per extra persoon */
    const prices = (Array.isArray(s.prices) ? s.prices : []).map(euro);
    if (!prices.length || prices.some(p => p === null)) return [400, { error: 'Vul voor elke gezelschapsgrootte een geldige prijs in.' }];
    out.prices = prices;
    const extra = euro(s.extraPerPerson);
    if (extra === null) return [400, { error: 'Vul een geldig bedrag in voor elke extra persoon.' }];
    out.extraPerPerson = extra;
    out.maxPeople = Math.max(prices.length, Math.min(12, parseInt(s.maxPeople, 10) || prices.length));
    out.minutesPerPerson = Math.max(10, Math.min(120, parseInt(s.minutesPerPerson, 10) || 30));
    out.depositPct = Math.max(0, Math.min(100, parseInt(s.depositPct, 10) || 0));
    out.schedule = {};
    for (const [day, times] of Object.entries(s.schedule || {})) {
      if (!/^[0-6]$/.test(day)) continue;
      const t = String(times).split(/[,\s]+/).filter(Boolean);
      const bad = t.find(x => !TIME.test(x));
      if (bad) return [400, { error: `Tijd "${bad}" klopt niet; gebruik hele of halve uren, bijv. 10:00, 10:30.` }];
      if (t.length) out.schedule[day] = [...new Set(t)].sort();
    }
    out.blockedDates = String(s.blockedDates || '').split(/[,\s]+/).filter(Boolean);
    const badDate = out.blockedDates.find(d => !DATE.test(d));
    if (badDate) return [400, { error: `Datum "${badDate}" klopt niet; gebruik jjjj-mm-dd.` }];
    await store.setJson('cms:settings', out);
    return [200, { ok: true }];
  },

  /* ── producten ── */
  async productsList() {
    const [custom, overrides] = await Promise.all([getCustom(), getOverrides()]);
    const base = Object.entries(BASE_PRICES).map(([n, v]) => ({ n, v: (overrides[n] && overrides[n].v) || v, hidden: Boolean(overrides[n] && overrides[n].hidden) }));
    return [200, { base, custom }];
  },
  async productOverride(req, b) {
    const n = clean(b.n, 120);
    if (!BASE_PRICES[n]) return [404, { error: 'Product niet gevonden.' }];
    const overrides = await getOverrides();
    const money = v => { const x = parseFloat(String(v).replace(',', '.')); return x > 0 ? Math.round(x * 100) / 100 : null; };
    const v = Array.isArray(b.v) ? b.v.slice(0, 3).map(money) : null;
    overrides[n] = { ...(v ? { v } : {}), ...(b.hidden ? { hidden: true } : {}) };
    if (!overrides[n].v && !overrides[n].hidden) delete overrides[n];
    await store.setJson('cms:product-overrides', overrides);
    return [200, { ok: true }];
  },
  async productSave(req, b) {
    const custom = await getCustom();
    const p = analyze({ ...b.product, id: (b.product && b.product.id) || newId(5) });
    if (!p.n) return [400, { error: 'Geef het parfum een naam.' }];
    if (!p.v.some(Boolean)) return [400, { error: 'Vul minstens één prijs in.' }];
    if (BASE_PRICES[p.n]) return [400, { error: 'Deze naam bestaat al in de catalogus.' }];
    const i = custom.findIndex(x => x.id === p.id);
    if (i >= 0) custom[i] = p; else custom.unshift(p);
    await store.setJson('cms:products', custom);
    return [200, { ok: true, product: p }];
  },
  async productDelete(req, b) {
    const custom = (await getCustom()).filter(x => x.id !== b.id);
    await store.setJson('cms:products', custom);
    return [200, { ok: true }];
  },

  /* ── site bewerken ── */
  async contentSave(req, b) {
    const page = String(b.page || '');
    if (!PAGES.includes(page)) return [400, { error: 'Onbekende pagina.' }];
    const key = 'cms:content:' + page;
    const c = await store.getJson(key, { texts: {}, images: {} });
    Object.entries(b.texts || {}).forEach(([k, v]) => {
      if (!/^t[a-z0-9]{1,12}$/.test(k)) return;
      if (v === null) delete c.texts[k]; else c.texts[k] = sanitizeHtml(v);
    });
    Object.entries(b.images || {}).forEach(([k, v]) => {
      if (!/^i[a-z0-9]{1,12}$/.test(k)) return;
      if (v === null) delete c.images[k];
      else if (/^\/api\/media\?id=[a-f0-9]+$/.test(v)) c.images[k] = v;
    });
    await store.setJson(key, c);
    return [200, { ok: true }];
  },
  async mediaUpload(req, b) {
    const data = String(b.dataUrl || '');
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) return [400, { error: 'Geen geldige afbeelding.' }];
    if (data.length > 950000) return [400, { error: 'Afbeelding is te groot.' }];
    const id = newId(8);
    await store.set('media:' + id, data);
    return [200, { url: '/api/media?id=' + id }];
  },
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const b = await readJson(req);
  const fn = actions[b.action];
  if (!fn) return send(res, 400, { error: 'Onbekende actie.' });
  if (b.action !== 'login' && !isAdmin(req)) return send(res, 401, { error: 'Log opnieuw in.' });
  try {
    const [status, body] = await fn(req, b);
    send(res, status, body);
  } catch (e) {
    console.error('admin', b.action, e.message);
    send(res, 500, { error: 'Er ging iets mis. Probeer het opnieuw.' });
  }
};
