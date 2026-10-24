/* POST /api/order — rekent de winkelmand af.

   Prijzen komen uit de catalogus plus de dashboard-aanpassingen van
   Angelo, nooit uit de browser. Voorraad per maat, kortingscodes en
   gratis verzending vanaf een drempel worden hier beslist.
   Bezorgen of ophalen in de winkel.
   Env: SHIPPING_PRICE_CENTS (standaard 495 = €4,95). */
const { send, readJson, clean, isEmail, isPhone, createPayment, newId, teVaak } = require('./_lib');
const { priceTable, getOverrides } = require('./_catalog');
const { saveOrder } = require('./_records');
const { getBedrijf } = require('./_factuur');
const korting = require('./_korting');

const SIZES = { 30: 0, 50: 1, 100: 2 };
const DISCOVERY_FALLBACK_CENTS = 4995; // gelijk aan api/checkout.js

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (await teVaak(req, 'order', 15, 600)) return send(res, 429, { error: 'Te veel pogingen achter elkaar. Probeer het over een paar minuten opnieuw.' });
  const b = await readJson(req);

  const [PRICES, overrides, bedrijf] = await Promise.all([priceTable(), getOverrides(), getBedrijf()]);
  const items = Array.isArray(b.items) ? b.items.slice(0, 20) : [];
  const lines = [];
  const setPerfumes = [];
  for (const it of items) {
    const qty = Math.max(1, Math.min(10, parseInt(it.qty, 10) || 1));

    /* Discovery Set: vaste prijs uit de omgeving, met de vijf gekozen
       geuren erbij zodat Angelo weet wat erin moet */
    if (it.kind === 'discovery') {
      const perfumes = (Array.isArray(it.perfumes) ? it.perfumes : [])
        .map(s => clean(s, 120)).filter(Boolean).slice(0, 5);
      if (perfumes.length !== 5) return send(res, 400, { error: 'De Discovery Set hoort vijf geuren te bevatten.' });
      const cents = parseInt(process.env.DISCOVERY_PRICE_CENTS, 10) || DISCOVERY_FALLBACK_CENTS;
      lines.push({
        name: 'Discovery Set · 5 × 10 ml', kind: 'discovery', perfumes,
        description: 'Jouw selectie: ' + perfumes.join(' · ') + '. Persoonlijk samengesteld en daarom uitgesloten van herroeping.',
        cents, qty,
      });
      setPerfumes.push(...perfumes);
      continue;
    }

    const name = clean(it.n, 120);
    const ml = parseInt(it.ml, 10);
    const prices = PRICES[name];
    const price = prices && SIZES[ml] !== undefined ? prices[SIZES[ml]] : null;
    if (!price) return send(res, 400, { error: `${name || 'Een product'} is niet leverbaar in ${ml} ml.` });
    /* voorraad per maat: null of ontbrekend = onbeperkt */
    const voorraad = overrides[name] && Array.isArray(overrides[name].stock) ? overrides[name].stock[SIZES[ml]] : null;
    if (voorraad !== null && voorraad !== undefined) {
      if (voorraad <= 0) return send(res, 400, { error: `${name} in ${ml} ml is op dit moment uitverkocht.` });
      if (voorraad < qty) return send(res, 400, { error: `Van ${name} in ${ml} ml ${voorraad === 1 ? 'is er nog maar één' : 'zijn er nog maar ' + voorraad}.` });
    }
    lines.push({ name: `${name} · ${ml} ml`, n: name, ml, description: 'Extrait de parfum', cents: Math.round(price * 100), qty });
  }
  if (!lines.length) return send(res, 400, { error: 'Je winkelmand is leeg.' });

  const c = b.customer || {};
  const name = clean(c.name, 80);
  const email = clean(c.email, 120);
  const phone = clean(c.phone, 30);
  if (!name) return send(res, 400, { error: 'Vul je naam in.' });
  if (!isEmail(email)) return send(res, 400, { error: 'Vul een geldig e-mailadres in.' });
  if (!isPhone(phone)) return send(res, 400, { error: 'Vul een geldig telefoonnummer in.' });

  const ship = b.delivery === 'ship';
  let address = '';
  if (ship) {
    const a = b.address || {};
    const street = clean(a.street, 120), postcode = clean(a.postcode, 12), city = clean(a.city, 60);
    const country = a.country === 'BE' ? 'BE' : 'NL';
    if (!street || !postcode || !city) return send(res, 400, { error: 'Vul je volledige bezorgadres in.' });
    if (country === 'NL' && !/^\d{4}\s?[A-Za-z]{2}$/.test(postcode)) return send(res, 400, { error: 'Die postcode klopt nog niet.' });
    address = `${street}, ${postcode} ${city}, ${country}`;
  }

  const subtotaal = lines.reduce((t, l) => t + l.cents * l.qty, 0);

  /* kortingscode */
  let kort = null;
  if (b.code) {
    const k = await korting.bereken(b.code, subtotaal);
    if (k && k.fout) return send(res, 400, { error: k.fout });
    if (k) kort = { code: k.code, cents: k.cents, label: k.label };
  }
  const naKorting = subtotaal - (kort ? kort.cents : 0);

  /* verzendkosten, gratis vanaf de drempel uit het dashboard */
  const drempel = Number(bedrijf.gratisVanaf) || 0;
  const standaard = process.env.SHIPPING_PRICE_CENTS !== undefined ? (parseInt(process.env.SHIPPING_PRICE_CENTS, 10) || 0) : 495;
  const shippingCents = ship ? ((drempel && naKorting >= drempel) ? 0 : standaard) : 0;

  const summary = lines.map(l => `${l.qty}x ${l.name}`).join(' | ');
  const order = {
    id: newId(6),
    items: lines.map(l => ({ name: l.name, qty: l.qty, cents: l.cents, n: l.n, ml: l.ml, kind: l.kind })),
    perfumes: setPerfumes,
    korting: kort,
    total: naKorting + shippingCents, shipping: shippingCents,
    delivery: ship ? 'verzenden' : 'ophalen', address, name, email, phone,
    status: 'wacht op betaling', created: Date.now(),
  };
  await saveOrder(order);
  try {
    /* de korting als aparte regel naar de betaalprovider */
    const betaalregels = kort && kort.cents
      ? [...lines, { name: `Korting (${kort.code})`, cents: -kort.cents, qty: 1 }]
      : lines;
    const pay = await createPayment({
      req,
      email,
      lines: betaalregels,
      shippingCents,
      shippingLabel: 'Verzending (PostNL)',
      metadata: {
        type: 'order', orderId: order.id, naam: name, telefoon: phone,
        levering: ship ? 'verzenden' : 'ophalen in de winkel',
        adres: address, bestelling: summary,
        ...(kort ? { korting: kort.code } : {}),
        ...(setPerfumes.length ? { discovery_set: setPerfumes.join(' · ') } : {}),
      },
      successPath: '/bedankt?type=order',
      cancelPath: '/afrekenen?geannuleerd=1',
    });
    if (pay.mock) {
      order.status = 'betaald'; order.mock = true; await saveOrder(order);
      await require('./_records').onPaid({ id: pay.id, metadata: { type: 'order', orderId: order.id } });
    }
    send(res, 200, { url: pay.url, mock: pay.mock });
  } catch (e) {
    console.error('order', e.message);
    send(res, 502, { error: 'De betaling kon niet worden gestart. Probeer het opnieuw.' });
  }
};
