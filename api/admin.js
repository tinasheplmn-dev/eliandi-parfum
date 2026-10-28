/* ═══════════════════════════════════════════════════════════════
   POST /api/admin — alle acties van het beheerdashboard.
   Body: { action, ... }. Alles behalve 'login' vereist het token
   (Authorization: Bearer ...) dat 'login' teruggeeft.
   ═══════════════════════════════════════════════════════════════ */
const { send, readJson, clean, store, newId, sanitizeHtml, isEmail, loginGeblokkeerd, loginMislukt, loginGelukt } = require('./_lib');
const bev = require('./_beveiliging');
const { maakXlsx } = require('./_xlsx');
const { getOrder, setOrderStatus, ORDER_STATUSSEN } = require('./_records');
const { getBedrijf, saveBedrijf, factuurPdf, pakbonPdf } = require('./_factuur');
const korting = require('./_korting');
const { DEFAULTS, getSettings, peopleFrom, priceOf, priceTable, slotsFor, slotStoreKey } = require('./_slots');
const { saveBooking, setBookingStatus, holdSlots, getBooking } = require('./_records');
const { analyze, getCustom, getOverrides, BASE_PRICES } = require('./_catalog');

const PAGES = ['index', 'experience', 'quiz'];
const TIME = /^([01]\d|2[0-3]):(00|30)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function list(idx, prefix) {
  const ids = await store.smembers(idx);
  if (!ids.length) return [];
  const items = await store.mgetJson(ids.map(id => prefix + id));
  return items.filter(Boolean);
}
/* kalenderdag in Nederlandse tijd, YYYY-MM-DD */
const dag = ts => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date(ts));
const BETAALD = o => o.status !== 'wacht op betaling' && o.status !== 'geannuleerd' && o.status !== 'verlopen';
const euroTxt = c => '€ ' + (c / 100).toFixed(2).replace('.', ',');
async function mgetGetallen(keys) {
  if (!keys.length) return [];
  const uit = [];
  for (let i = 0; i < keys.length; i += 400) uit.push(...(await store.mget(keys.slice(i, i + 400))).map(v => Number(v) || 0));
  return uit;
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
    if (!(await bev.wachtwoordKlopt(req, b.password))) {
      const n = await loginMislukt(req);
      await bev.logboek(req, 'inloggen mislukt', 'onjuist wachtwoord');
      return [401, { error: n >= 7 ? `Onjuist wachtwoord. Nog ${10 - n} ${10 - n === 1 ? 'poging' : 'pogingen'}.` : 'Onjuist wachtwoord.' }];
    }
    /* tweestapsverificatie aan: eerst de code uit de app */
    if (await bev.tweestap()) {
      if (!b.code) return [200, { tweestap: true }];
      const ok = await bev.tweestapKlopt(b.code);
      if (!ok) {
        await loginMislukt(req);
        await bev.logboek(req, 'inloggen mislukt', 'onjuiste code');
        return [401, { error: 'Die code klopt niet. Kijk of de tijd op je telefoon goed staat.', tweestap: true }];
      }
      if (ok === 'herstel') await bev.logboek(req, 'herstelcode gebruikt');
    }
    await loginGelukt(req);
    await bev.logboek(req, 'ingelogd');
    return [200, { token: await bev.maakToken(req), persistent: store.persistent }];
  },

  /* ── account en beveiliging ── */
  async beveiliging() {
    const t = await bev.tweestap();
    const eigen = await store.getJson('admin:wachtwoord', null);
    return [200, { tweestap: Boolean(t), herstelOver: t ? (t.herstel || []).length : 0, wachtwoordSinds: eigen ? eigen.sinds : null, logboek: (await store.getJson('admin:logboek', [])).slice(0, 80) }];
  },
  async wachtwoordWijzigen(req, b) {
    if (!(await bev.wachtwoordKlopt(req, b.huidig))) return [400, { error: 'Je huidige wachtwoord klopt niet.' }];
    const fout = bev.wachtwoordSterk(b.nieuw);
    if (fout) return [400, { error: fout }];
    await bev.wachtwoordWijzigen(b.nieuw);
    return [200, { ok: true, token: await bev.maakToken(req) }];
  },
  async overalUitloggen(req) {
    await bev.overalUitloggen();
    return [200, { ok: true, token: await bev.maakToken(req) }];
  },
  async tweestapStart() { return [200, await bev.tweestapStart()]; },
  async tweestapBevestig(req, b) {
    const codes = await bev.tweestapBevestig(b.code);
    if (!codes) return [400, { error: 'Die code klopt niet. Probeer de nieuwste code uit de app.' }];
    return [200, { codes }];
  },
  async tweestapUit(req, b) {
    if (!(await bev.wachtwoordKlopt(req, b.wachtwoord))) return [400, { error: 'Je wachtwoord klopt niet.' }];
    await bev.tweestapUit();
    return [200, { ok: true }];
  },
  async downloadLink(req, b) {
    const soort = clean(b.soort, 30), id = clean(b.id || '-', 40);
    if (!/^(factuur|pakbon|export-bestellingen|export-klanten|export-voorraad|backup)$/.test(soort)) return [400, { error: 'Onbekende download.' }];
    return [200, { url: await bev.downloadLink(req, soort, id) }];
  },

  /* ── klanten: privénotitie en privacyverzoek ── */
  async klantNotitie(req, b) {
    const email = clean(b.email, 120).toLowerCase();
    if (!email) return [400, { error: 'Geen klant.' }];
    const alle = await store.getJson('cms:klant-notities', {});
    const notitie = clean(String(b.notitie || '').replace(/\r?\n/g, ' ⏎ '), 2000).replace(/ ⏎ /g, '\n');
    if (notitie) alle[email] = { notitie, t: Date.now() }; else delete alle[email];
    await store.setJson('cms:klant-notities', alle);
    return [200, { ok: true }];
  },
  async klantWissen(req, b) {
    /* AVG: notitie en wachtlijst weg. Bestellingen en boekingen blijven,
       want die moeten voor de belasting zeven jaar bewaard blijven. */
    const email = clean(b.email, 120).toLowerCase();
    if (!email) return [400, { error: 'Geen klant.' }];
    const alle = await store.getJson('cms:klant-notities', {});
    delete alle[email]; await store.setJson('cms:klant-notities', alle);
    const wl = await list('idx:wachtlijst', 'wachtlijst:');
    let n = 0;
    for (const w of wl) if (String(w.email).toLowerCase() === email) { await store.del('wachtlijst:' + w.id); await store.srem('idx:wachtlijst', w.id); n++; }
    return [200, { ok: true, gewist: n }];
  },

  /* ── inzichten ── */
  async inzichten(req, b) { return [200, await inzichten(Number(b.dagen) || 30)]; },

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
    const [notities, overrides] = await Promise.all([store.getJson('cms:klant-notities', {}), getOverrides()]);
    /* voorraad die bijna op is: 2 of minder (0 = uitverkocht) */
    const MATEN = ['30 ml', '50 ml', '100 ml', 'olie 6 ml', 'olie 13 ml'];
    const voorraadLaag = [];
    Object.entries(overrides).forEach(([n, o]) => (o.stock || []).forEach((x, i) => { if (x !== null && x !== undefined && x <= 2) voorraadLaag.push({ n, maat: MATEN[i], over: x }); }));
    voorraadLaag.sort((a, b) => a.over - b.over);
    return [200, { bookings, orders, vouchers, wachtlijst, klanten: klanten(orders, bookings), notities, voorraadLaag, tweestap: Boolean(await bev.tweestap()), statussen: ORDER_STATUSSEN, persistent: store.persistent, koppelingen: koppelingen() }];
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

/* ── inzichten: bezoek, conversie, omzet, bestsellers, zoekgedrag ── */
const EVENTS = ['bezoek', 'product', 'winkelmand', 'afrekenen', 'zoek', 'geurwijzer', 'geurwijzer-klaar'];
async function inzichten(dagen) {
  dagen = [7, 30, 90, 365].includes(dagen) ? dagen : 30;
  const nu = Date.now();
  const datums = Array.from({ length: dagen }, (_, i) => dag(nu - (dagen - 1 - i) * 86400000));
  const vorigeDatums = Array.from({ length: dagen }, (_, i) => dag(nu - (2 * dagen - 1 - i) * 86400000));
  const sleutels = [...datums, ...vorigeDatums].flatMap(d => EVENTS.map(e => `stat:${d}:${e}`));
  const waarden = await mgetGetallen(sleutels);
  const tel = {}; sleutels.forEach((k, i) => { tel[k] = waarden[i]; });
  const som = (ds, e) => ds.reduce((t, d) => t + (tel[`stat:${d}:${e}`] || 0), 0);

  const [orders, bookings] = await Promise.all([list('idx:orders', 'order:'), list('idx:bookings', 'booking:')]);
  const inPeriode = ts => datums.includes(dag(ts));
  const inVorige = ts => vorigeDatums.includes(dag(ts));
  const betaald = orders.filter(o => BETAALD(o) && inPeriode(o.created));
  const betaaldVorig = orders.filter(o => BETAALD(o) && inVorige(o.created));
  const afgebroken = orders.filter(o => o.status === 'wacht op betaling' && nu - o.created > 3600000 && inPeriode(o.created));
  const boekingen = bookings.filter(b => b.status === 'geboekt' && inPeriode(b.created));

  const perDag = datums.map(d => ({
    d, bezoek: tel[`stat:${d}:bezoek`] || 0,
    omzet: betaald.filter(o => dag(o.created) === d).reduce((t, o) => t + o.total, 0) + boekingen.filter(b => dag(b.created) === d).reduce((t, b) => t + (b.paid || 0), 0),
    bestellingen: betaald.filter(o => dag(o.created) === d).length,
  }));
  const omzetWinkel = betaald.reduce((t, o) => t + o.total, 0);
  const omzetExperience = boekingen.reduce((t, b) => t + (b.paid || 0), 0);

  /* bestsellers en verdeling per soort */
  const prod = {}, soort = { '30 ml': 0, '50 ml': 0, '100 ml': 0, 'olie 6 ml': 0, 'olie 13 ml': 0, 'Discovery Set': 0 };
  betaald.forEach(o => (o.items || []).forEach(i => {
    const naam = i.kind === 'discovery' ? 'Discovery Set' : (i.n || i.name);
    const p = prod[naam] || (prod[naam] = { n: naam, stuks: 0, omzet: 0 });
    p.stuks += i.qty; p.omzet += i.cents * i.qty;
    const s = i.kind === 'discovery' ? 'Discovery Set' : i.kind === 'olie' ? `olie ${i.ml} ml` : `${i.ml} ml`;
    if (soort[s] !== undefined) soort[s] += i.qty;
  }));
  const kortingen = {};
  betaald.filter(o => o.korting).forEach(o => { const k = kortingen[o.korting.code] || (kortingen[o.korting.code] = { code: o.korting.code, keer: 0, korting: 0 }); k.keer++; k.korting += o.korting.cents; });

  /* nieuwe en terugkerende klanten */
  const eerste = {};
  orders.filter(BETAALD).forEach(o => { const e = String(o.email || '').toLowerCase(); if (e && (!eerste[e] || o.created < eerste[e])) eerste[e] = o.created; });
  const kopers = [...new Set(betaald.map(o => String(o.email || '').toLowerCase()).filter(Boolean))];
  const nieuw = kopers.filter(e => inPeriode(eerste[e])).length;

  /* zoeken en bekeken producten, per maand bijgehouden */
  const maanden = [...new Set(datums.map(d => d.slice(0, 7)))];
  async function topLijst(setPrefix, telPrefix, max) {
    const tot = {};
    for (const m of maanden) {
      const leden = await store.smembers(`${setPrefix}:${m}`);
      if (!leden.length) continue;
      const w = await mgetGetallen(leden.map(x => `${telPrefix}:${m}:${x}`));
      leden.forEach((x, i) => { tot[x] = (tot[x] || 0) + w[i]; });
    }
    return Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, max).map(([q, n]) => ({ q, n }));
  }
  const [zoekTop, zoekLeeg, bekeken] = await Promise.all([topLijst('zoeken', 'zoek', 15), topLijst('zoekenleeg', 'zoekleeg', 15), topLijst('pviews', 'pview', 10)]);

  const bezoek = som(datums, 'bezoek'), bezoekVorig = som(vorigeDatums, 'bezoek');
  const winkelmand = som(datums, 'winkelmand'), afrekenen = som(datums, 'afrekenen');
  return {
    dagen, perDag, meetSinds: await store.get('stat:sinds'),
    totaal: {
      bezoek, bezoekVorig, omzet: omzetWinkel + omzetExperience, omzetVorig: betaaldVorig.reduce((t, o) => t + o.total, 0),
      omzetWinkel, omzetExperience, bestellingen: betaald.length, bestellingenVorig: betaaldVorig.length,
      gemiddeld: betaald.length ? Math.round(omzetWinkel / betaald.length) : 0,
      conversie: bezoek ? (betaald.length + boekingen.length) / bezoek : null,
      boekingen: boekingen.length, personen: boekingen.reduce((t, b) => t + (b.people || 1), 0),
      afgebroken: afgebroken.length, afgebrokenWaarde: afgebroken.reduce((t, o) => t + o.total, 0),
      verlaten: Math.max(0, winkelmand - afrekenen), nieuweKlanten: nieuw, terugkerend: kopers.length - nieuw,
      geurwijzer: som(datums, 'geurwijzer'), geurwijzerKlaar: som(datums, 'geurwijzer-klaar'),
    },
    trechter: [
      { stap: 'Bezoeken', n: bezoek }, { stap: 'Product bekeken', n: som(datums, 'product') }, { stap: 'In winkelmand', n: winkelmand },
      { stap: 'Naar afrekenen', n: afrekenen }, { stap: 'Betaald', n: betaald.length },
    ],
    bestsellers: Object.values(prod).sort((a, b) => b.stuks - a.stuks || b.omzet - a.omzet).slice(0, 10),
    soort, kortingen: Object.values(kortingen).sort((a, b) => b.keer - a.keer),
    zoekTop, zoekLeeg, bekeken,
  };
}

/* ── exports naar Excel ── */
async function exportBestand(soort) {
  const nu = new Date();
  if (soort === 'export-bestellingen') {
    const orders = (await list('idx:orders', 'order:')).sort((a, b) => b.created - a.created);
    return { naam: `eliandi-bestellingen-${dag(nu)}.xlsx`, data: maakXlsx([{
      naam: 'Bestellingen', geld: [9, 10, 11],
      kolommen: ['Datum', 'Bestelling', 'Factuur', 'Status', 'Klant', 'E-mail', 'Telefoon', 'Levering', 'Adres', 'Korting', 'Verzendkosten', 'Totaal', 'Kortingscode', 'Producten', 'Track & trace', 'Privénotitie'],
      rijen: orders.map(o => [new Date(o.created), o.id.toUpperCase(), o.factuur ? o.factuur.nummer : '', o.status, o.name, o.email, o.phone, o.delivery, o.address || '',
        o.korting ? o.korting.cents / 100 : 0, (o.shipping || 0) / 100, o.total / 100, o.korting ? o.korting.code : '',
        (o.items || []).map(i => `${i.qty}x ${i.name}`).join('; ') + (o.perfumes && o.perfumes.length ? ` (set: ${o.perfumes.join(', ')})` : ''), o.trackTrace || '', o.note || '']),
    }, {
      naam: 'Regels', geld: [4, 5],
      kolommen: ['Datum', 'Bestelling', 'Status', 'Product', 'Stukprijs', 'Regeltotaal', 'Aantal', 'Soort'],
      rijen: orders.flatMap(o => (o.items || []).map(i => [new Date(o.created), o.id.toUpperCase(), o.status, i.name, i.cents / 100, i.cents * i.qty / 100, i.qty, i.kind === 'olie' ? 'parfumolie' : i.kind === 'discovery' ? 'Discovery Set' : 'extrait'])),
    }]) };
  }
  if (soort === 'export-klanten') {
    const [orders, bookings, notities] = await Promise.all([list('idx:orders', 'order:'), list('idx:bookings', 'booking:'), store.getJson('cms:klant-notities', {})]);
    return { naam: `eliandi-klanten-${dag(nu)}.xlsx`, data: maakXlsx([{
      naam: 'Klanten', geld: [5],
      kolommen: ['Naam', 'E-mail', 'Telefoon', 'Bestellingen', 'Experiences', 'Totaal besteed', 'Laatste aankoop', 'Privénotitie'],
      rijen: klanten(orders, bookings).map(k => [k.naam, k.email, k.tel, k.bestellingen, k.boekingen, k.besteed / 100, k.laatst ? new Date(k.laatst) : '', (notities[k.email] || {}).notitie || '']),
    }]) };
  }
  if (soort === 'export-voorraad') {
    const [overrides, custom] = await Promise.all([getOverrides(), getCustom()]);
    const v = (o, i) => (o && o.stock && o.stock[i] != null ? o.stock[i] : 'onbeperkt');
    const rijen = Object.entries(BASE_PRICES).map(([n, prijs]) => { const o = overrides[n] || {}; const p = o.v || prijs; return [n, o.hidden ? 'verborgen' : 'zichtbaar', p[0] || '', p[1] || '', p[2] || '', v(o, 0), v(o, 1), v(o, 2), v(o, 3), v(o, 4), o.tags || '']; })
      .concat(custom.map(p => { const o = overrides[p.n] || {}; return [p.n + ' (eigen)', 'zichtbaar', p.v[0] || '', p.v[1] || '', p.v[2] || '', v(o, 0), v(o, 1), v(o, 2), v(o, 3), v(o, 4), p.tags || '']; }));
    return { naam: `eliandi-voorraad-${dag(nu)}.xlsx`, data: maakXlsx([{
      naam: 'Voorraad', geld: [2, 3, 4],
      kolommen: ['Geur', 'Zichtbaar', 'Prijs 30 ml', 'Prijs 50 ml', 'Prijs 100 ml', 'Voorraad 30', 'Voorraad 50', 'Voorraad 100', 'Voorraad olie 6', 'Voorraad olie 13', 'Zoektermen'],
      rijen,
    }]) };
  }
  return null;
}

/* ── back-up: alles wat niet in de code staat ── */
async function backup() {
  const sleutels = ['cms:bedrijf', 'cms:kortingen', 'cms:product-overrides', 'cms:products', 'cms:reviews', 'cms:klant-notities', 'cms:settings', 'cms:content-index', 'cms:content-experience', 'cms:content-quiz'];
  const waarden = await store.mgetJson(sleutels);
  const [orders, bookings, vouchers, wachtlijst] = await Promise.all([list('idx:orders', 'order:'), list('idx:bookings', 'booking:'), list('idx:vouchers', 'voucher:'), list('idx:wachtlijst', 'wachtlijst:')]);
  const cms = {}; sleutels.forEach((k, i) => { if (waarden[i] != null) cms[k] = waarden[i]; });
  return { gemaakt: new Date().toISOString(), orders, bookings, vouchers, wachtlijst, cms };
}

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
  /* dagelijkse back-up, 14 dagen bewaard */
  try { await store.set('backup:' + dag(nu), JSON.stringify(await backup()), 14 * 86400); } catch (e) { console.error('backup', e.message); }
  return { herinneringen: verstuurd };
}

const LEZEN = new Set(['overview', 'agenda', 'settingsGet', 'kortingList', 'bedrijfGet', 'reviewsList', 'productsList', 'inzichten', 'beveiliging', 'downloadLink', 'tweestapStart']);
const ACTIE_NAAM = {
  orderStatus: 'status bestelling', orderNote: 'notitie bestelling', klantNotitie: 'notitie klant', klantWissen: 'klantgegevens gewist',
  productOverride: 'product aangepast', productSave: 'product opgeslagen', productDelete: 'product verwijderd',
  kortingSave: 'kortingscode opgeslagen', kortingDelete: 'kortingscode verwijderd', bedrijfSave: 'bedrijfsgegevens opgeslagen',
  reviewSave: 'review toegevoegd', reviewDelete: 'review verwijderd', settingsSave: 'agenda en prijzen opgeslagen',
  bookingCancel: 'boeking geannuleerd', bookingAdd: 'boeking toegevoegd', bookingDone: 'boeking afgerond', recordDelete: 'verwijderd',
  slotToggle: 'agenda aangepast', contentSave: 'tekst op de site aangepast', mediaUpload: 'afbeelding geüpload', wachtlijstDelete: 'wachtlijst afgehandeld',
  wachtwoordWijzigen: 'wachtwoord gewijzigd', overalUitloggen: 'overal uitgelogd', tweestapBevestig: 'tweestapsverificatie aangezet', tweestapUit: 'tweestapsverificatie uitgezet',
};

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const u = new URL(req.url, 'http://x');
    /* dagelijkse taak (Vercel cron stuurt de CRON_SECRET mee) */
    if (u.searchParams.get('taak') === 'dagelijks') {
      const auth = req.headers.authorization || '';
      if (!process.env.CRON_SECRET || auth !== 'Bearer ' + process.env.CRON_SECRET) return send(res, 401, { error: 'Geen toegang.' });
      try { return send(res, 200, await dagelijks()); } catch (e) { console.error('dagelijks', e.message); return send(res, 500, { error: 'mislukt' }); }
    }
    /* downloads via een link die vijf minuten geldig is (zie downloadLink) */
    const soort = u.searchParams.get('dl');
    if (soort) {
      const id = u.searchParams.get('id') || '-';
      if (!(await bev.downloadKlopt(req, soort, id, u.searchParams.get('exp'), u.searchParams.get('sig')))) {
        res.statusCode = 403; res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end('<p style="font-family:sans-serif">Deze downloadlink is verlopen. Klik in het dashboard opnieuw op de knop.</p>');
      }
      const lever = (type, naam, data) => {
        res.statusCode = 200; res.setHeader('Content-Type', type); res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Disposition', `${type === 'application/pdf' ? 'inline' : 'attachment'}; filename="${naam}"`);
        return res.end(data);
      };
      try {
        if (soort === 'factuur' || soort === 'pakbon') {
          const o = await getOrder(clean(id, 20));
          if (!o || (soort === 'factuur' && !o.factuur)) return send(res, 404, { error: 'Niet gevonden.' });
          const bedrijf = await getBedrijf();
          return soort === 'factuur' ? lever('application/pdf', `factuur-${o.factuur.nummer}.pdf`, factuurPdf(o, bedrijf))
            : lever('application/pdf', `pakbon-${o.id.toUpperCase()}.pdf`, pakbonPdf(o, bedrijf));
        }
        if (soort === 'backup') {
          await bev.logboek(req, 'back-up gedownload');
          return lever('application/json', `eliandi-backup-${dag(Date.now())}.json`, JSON.stringify(await backup(), null, 1));
        }
        const x = await exportBestand(soort);
        if (!x) return send(res, 404, { error: 'Niet gevonden.' });
        await bev.logboek(req, 'export gedownload', soort.replace('export-', ''));
        return lever('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', x.naam, x.data);
      } catch (e) { console.error('download', soort, e.message); return send(res, 500, { error: 'mislukt' }); }
    }
    return send(res, 405, { error: 'Method not allowed' });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const b = await readJson(req);
  const fn = actions[b.action];
  if (!fn) return send(res, 400, { error: 'Onbekende actie.' });
  if (b.action !== 'login' && !(await bev.ingelogd(req))) return send(res, 401, { error: 'Log opnieuw in.' });
  try {
    const [status, body] = await fn(req, b);
    /* alles wat iets verandert komt in het logboek */
    if (status < 400 && !LEZEN.has(b.action) && b.action !== 'login') {
      const geheim = /^(tweestap|wachtwoord|overal)/.test(b.action);
      const info = geheim ? '' : (b.id || b.n || b.code || b.email || (b.product && b.product.n) || b.status || '');
      await bev.logboek(req, ACTIE_NAAM[b.action] || b.action, typeof info === 'string' ? info : '');
    }
    send(res, status, body);
  } catch (e) {
    console.error('admin', b.action, e.message);
    send(res, 500, { error: 'Er ging iets mis. Probeer het opnieuw.' });
  }
};
