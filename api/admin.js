/* ═══════════════════════════════════════════════════════════════
   POST /api/admin — alle acties van het beheerdashboard.
   Body: { action, ... }. Alles behalve 'login' vereist het token
   (Authorization: Bearer ...) dat 'login' teruggeeft.
   ═══════════════════════════════════════════════════════════════ */
const { send, readJson, clean, store, newId, makeToken, isAdmin, checkPassword, sanitizeHtml, loginGeblokkeerd, loginMislukt, loginGelukt } = require('./_lib');
const { getOrder, setOrderStatus, ORDER_STATUSSEN } = require('./_records');
const { getBedrijf, saveBedrijf, factuurPdf } = require('./_factuur');
const korting = require('./_korting');
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

/* klanten: afgeleid uit bestellingen en boekingen, geen aparte administratie */
function klanten(orders, bookings) {
  const map = {};
  const voeg = (email, naam, tel, bedrag, ts, soort) => {
    const k = String(email || '').toLowerCase().trim();
    if (!k) return;
    const c = map[k] || (map[k] = { email: k, naam: naam || '', tel: tel || '', bestellingen: 0, boekingen: 0, besteed: 0, laatst: 0 });
    if (naam) c.naam = naam; if (tel) c.tel = tel;
    c[soort] += 1; c.besteed += bedrag || 0; c.laatst = Math.max(c.laatst, ts || 0);
  };
  orders.filter(o => o.status !== 'wacht op betaling' && o.status !== 'geannuleerd').forEach(o => voeg(o.email, o.name, o.phone, o.total, o.created, 'bestellingen'));
  bookings.filter(b => b.status === 'geboekt').forEach(b => voeg(b.email, b.name, b.phone, b.paid || 0, b.created, 'boekingen'));
  return Object.values(map).sort((a, b) => b.laatst - a.laatst);
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
    if (await loginGeblokkeerd(req)) return [429, { error: 'Te veel pogingen. Probeer het over een kwartier opnieuw.' }];
    if (!checkPassword(req, b.password)) {
      const n = await loginMislukt(req);
      return [401, { error: n >= 7 ? `Onjuist wachtwoord. Nog ${10 - n} ${10 - n === 1 ? 'poging' : 'pogingen'}.` : 'Onjuist wachtwoord.' }];
    }
    await loginGelukt(req);
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
    const wachtlijst = (await list('idx:wachtlijst', 'wachtlijst:')).sort((a, b) => b.created - a.created);
    return [200, { bookings, orders, vouchers, wachtlijst, klanten: klanten(orders, bookings), statussen: ORDER_STATUSSEN, persistent: store.persistent, koppelingen: koppelingen() }];
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

  /* ── bestellingen: status, notitie, klanten ── */
  async orderStatus(req, b) {
    const o = await setOrderStatus(clean(b.id, 20), clean(b.status, 30), { trackTrace: b.trackTrace !== undefined ? clean(b.trackTrace, 200) : undefined });
    return o ? [200, { ok: true }] : [400, { error: 'Onbekende bestelling of status.' }];
  },
  async orderNote(req, b) {
    const o = await getOrder(clean(b.id, 20));
    if (!o) return [404, { error: 'Bestelling niet gevonden.' }];
    o.note = clean(b.note, 600);
    await require('./_records').saveOrder(o);
    return [200, { ok: true }];
  },

  /* ── kortingscodes ── */
  async kortingList() { return [200, { codes: await korting.getCodes() }]; },
  async kortingSave(req, b) {
    const codes = await korting.getCodes();
    const code = clean(b.code, 24).toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!code) return [400, { error: 'Vul een code in (letters en cijfers).' }];
    const soort = b.soort === 'bedrag' ? 'bedrag' : 'pct';
    const waarde = soort === 'pct' ? Math.max(1, Math.min(100, parseInt(b.waarde, 10) || 0)) : Math.round(parseFloat(String(b.waarde).replace(',', '.')) * 100);
    if (!waarde) return [400, { error: 'Vul een geldige korting in.' }];
    const min = b.min ? Math.round(parseFloat(String(b.min).replace(',', '.')) * 100) || 0 : 0;
    const tot = /^\d{4}-\d{2}-\d{2}$/.test(String(b.tot || '')) ? b.tot : '';
    const max = parseInt(b.max, 10) || 0;
    const bestaand = codes.find(c => c.code === code);
    const nieuw = { code, soort, waarde, min, tot, max, gebruikt: bestaand ? bestaand.gebruikt || 0 : 0, actief: b.actief !== false, created: bestaand ? bestaand.created : Date.now() };
    await korting.saveCodes([...codes.filter(c => c.code !== code), nieuw]);
    return [200, { ok: true }];
  },
  async kortingDelete(req, b) {
    const code = clean(b.code, 24).toUpperCase();
    await korting.saveCodes((await korting.getCodes()).filter(c => c.code !== code));
    return [200, { ok: true }];
  },

  /* ── bedrijfsgegevens (facturen, gratis verzending) ── */
  async bedrijfGet() { return [200, { bedrijf: await getBedrijf() }]; },
  async bedrijfSave(req, b) {
    const cur = await getBedrijf();
    const d = b.bedrijf || {};
    const txt = (k, n) => (d[k] !== undefined ? clean(d[k], n) : cur[k]);
    const out = {
      ...cur,
      naam: txt('naam', 80), straat: txt('straat', 80), postcode: txt('postcode', 12), plaats: txt('plaats', 60), land: txt('land', 40),
      tel: txt('tel', 30), email: txt('email', 120), kvk: txt('kvk', 20), btwNummer: txt('btwNummer', 24), iban: txt('iban', 34),
      btwPct: Math.max(0, Math.min(30, parseInt(d.btwPct, 10) || cur.btwPct)),
      factuurPrefix: clean(d.factuurPrefix !== undefined ? d.factuurPrefix : cur.factuurPrefix, 6).toUpperCase() || 'IN',
      factuurStart: Math.max(1, parseInt(d.factuurStart, 10) || cur.factuurStart),
      gratisVanaf: d.gratisVanaf !== undefined ? Math.max(0, Math.round(parseFloat(String(d.gratisVanaf).replace(',', '.')) * 100) || 0) : cur.gratisVanaf,
      olie: d.olie !== undefined ? Boolean(d.olie) && d.olie !== 'nee' : cur.olie,
      olie6: d.olie6 !== undefined ? Math.max(0, Math.round(parseFloat(String(d.olie6).replace(',', '.')) * 100) || 0) : cur.olie6,
      olie13: d.olie13 !== undefined ? Math.max(0, Math.round(parseFloat(String(d.olie13).replace(',', '.')) * 100) || 0) : cur.olie13,
    };
    await saveBedrijf(out);
    return [200, { ok: true }];
  },

  /* ── reviews per geur ── */
  async reviewSave(req, b) {
    const alle = await store.getJson('cms:reviews', {});
    const n = clean(b.product, 120);
    if (!n) return [400, { error: 'Kies een geur.' }];
    const r = { id: clean(b.id, 20) || newId(4), naam: clean(b.naam, 60) || 'Klant', tekst: clean(b.tekst, 500), sterren: Math.max(1, Math.min(5, parseInt(b.sterren, 10) || 5)), datum: Date.now() };
    if (!r.tekst) return [400, { error: 'Vul een tekst in.' }];
    alle[n] = [...(alle[n] || []).filter(x => x.id !== r.id), r].slice(-20);
    await store.setJson('cms:reviews', alle);
    return [200, { ok: true }];
  },
  async reviewDelete(req, b) {
    const alle = await store.getJson('cms:reviews', {});
    const n = clean(b.product, 120);
    alle[n] = (alle[n] || []).filter(x => x.id !== clean(b.id, 20));
    if (!alle[n].length) delete alle[n];
    await store.setJson('cms:reviews', alle);
    return [200, { ok: true }];
  },
  async reviewsList() { return [200, { reviews: await store.getJson('cms:reviews', {}) }]; },

  /* ── wachtlijst Experience ── */
  async wachtlijstDelete(req, b) {
    const id = clean(b.id, 20);
    await store.del('wachtlijst:' + id); await store.srem('idx:wachtlijst', id);
    return [200, { ok: true }];
  },

  /* ── producten ── */
  async productsList() {
    const [custom, overrides] = await Promise.all([getCustom(), getOverrides()]);
    const base = Object.entries(BASE_PRICES).map(([n, v]) => {
      const o = overrides[n] || {};
      return { n, v: o.v || v, hidden: Boolean(o.hidden), stock: o.stock || null, tags: o.tags || '' };
    });
    return [200, { base, custom }];
  },
  async productOverride(req, b) {
    const n = clean(b.n, 120);
    if (!BASE_PRICES[n]) return [404, { error: 'Product niet gevonden.' }];
    const overrides = await getOverrides();
    const money = v => { const x = parseFloat(String(v).replace(',', '.')); return x > 0 ? Math.round(x * 100) / 100 : null; };
    const v = Array.isArray(b.v) ? b.v.slice(0, 3).map(money) : null;
    /* voorraad per maat: leeg = onbeperkt, 0 = uitverkocht */
    /* plekken 0-2: 30/50/100 ml extrait, 3-4: parfumolie 6/13 ml */
    const stock = Array.isArray(b.stock) ? b.stock.slice(0, 5).map(x => (x === '' || x === null || x === undefined ? null : Math.max(0, parseInt(x, 10) || 0))) : null;
    const prev = overrides[n] || {};
    /* zoektermen: namen waar klanten op kunnen zoeken, bijvoorbeeld de geur waar deze op lijkt */
    const tags = b.tags !== undefined ? clean(b.tags, 300) : (prev.tags || '');
    overrides[n] = {
      ...(v ? { v } : prev.v ? { v: prev.v } : {}),
      ...(b.hidden ? { hidden: true } : {}),
      ...(stock ? (stock.some(x => x !== null) ? { stock } : {}) : prev.stock ? { stock: prev.stock } : {}),
      ...(tags ? { tags } : {}),
    };
    if (b.v === undefined && b.hidden === undefined && prev.hidden) overrides[n].hidden = true;
    if (!Object.keys(overrides[n]).length) delete overrides[n];
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

async function dagelijks() {
  /* herinnering bij een winkelmand die na een dag nog niet betaald is */
  const mail = require('./_mail');
  const orders = await list('idx:orders', 'order:');
  const nu = Date.now();
  let verstuurd = 0;
  for (const o of orders) {
    if (o.status !== 'wacht op betaling' || o.herinnerd || !o.email) continue;
    const uur = (nu - o.created) / 3600000;
    if (uur < 20 || uur > 72) continue;
    const ok = await mail.winkelmandHerinnering(o);
    o.herinnerd = nu; await require('./_records').saveOrder(o);
    if (ok) verstuurd++;
  }
  return { herinneringen: verstuurd };
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const u = new URL(req.url, 'http://x');
    /* dagelijkse taak (Vercel cron stuurt de CRON_SECRET mee) */
    if (u.searchParams.get('taak') === 'dagelijks') {
      const auth = req.headers.authorization || '';
      if (!process.env.CRON_SECRET || auth !== 'Bearer ' + process.env.CRON_SECRET) return send(res, 401, { error: 'Geen toegang.' });
      try { return send(res, 200, await dagelijks()); } catch (e) { console.error('dagelijks', e.message); return send(res, 500, { error: 'mislukt' }); }
    }
    /* factuur downloaden (ingelogd in het dashboard) */
    const factuur = u.searchParams.get('factuur');
    if (factuur) {
      req.headers.authorization = req.headers.authorization || ('Bearer ' + (u.searchParams.get('token') || ''));
      if (!isAdmin(req)) return send(res, 401, { error: 'Log opnieuw in.' });
      const o = await getOrder(clean(factuur, 20));
      if (!o || !o.factuur) return send(res, 404, { error: 'Geen factuur voor deze bestelling.' });
      const pdf = factuurPdf(o, await getBedrijf());
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="factuur-${o.factuur.nummer}.pdf"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.end(pdf);
    }
    return send(res, 405, { error: 'Method not allowed' });
  }
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
