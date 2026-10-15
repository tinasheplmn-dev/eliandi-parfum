/* POST /api/order — rekent de winkelmand af.

   Prijzen komen uit api/_prices.json (gegenereerd uit de catalogus),
   nooit uit de browser. Bezorgen of ophalen in de winkel.
   Env: SHIPPING_PRICE_CENTS (standaard 495 = €4,95). */
const { send, readJson, clean, isEmail, isPhone, createPayment, newId } = require('./_lib');
const { priceTable } = require('./_catalog');
const { saveOrder } = require('./_records');

const SIZES = { 30: 0, 50: 1, 100: 2 };
const DISCOVERY_FALLBACK_CENTS = 4995; // gelijk aan api/checkout.js

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const b = await readJson(req);

  const PRICES = await priceTable();
  const items = Array.isArray(b.items) ? b.items.slice(0, 20) : [];
  const lines = [];
  const setPerfumes = [];
  for (const it of items) {
    const qtyRaw = Math.max(1, Math.min(10, parseInt(it.qty, 10) || 1));

    /* Discovery Set uit de geurwijzer: vaste prijs uit de omgeving,
       met de vijf gekozen geuren erbij zodat Angelo weet wat erin moet */
    if (it.kind === 'discovery') {
      const perfumes = (Array.isArray(it.perfumes) ? it.perfumes : [])
        .map(s => clean(s, 120)).filter(Boolean).slice(0, 5);
      if (perfumes.length !== 5) return send(res, 400, { error: 'De Discovery Set hoort vijf geuren te bevatten. Doe de geurwijzer opnieuw.' });
      const cents = parseInt(process.env.DISCOVERY_PRICE_CENTS, 10) || DISCOVERY_FALLBACK_CENTS;
      lines.push({
        name: 'Discovery Set · 5 × 10 ml',
        description: 'Jouw selectie: ' + perfumes.join(' · ') + '. Persoonlijk samengesteld en daarom uitgesloten van herroeping.',
        cents, qty: qtyRaw,
      });
      setPerfumes.push(...perfumes);
      continue;
    }

    const name = clean(it.n, 120);
    const ml = parseInt(it.ml, 10);
    const qty = Math.max(1, Math.min(10, parseInt(it.qty, 10) || 1));
    const prices = PRICES[name];
    const price = prices && SIZES[ml] !== undefined ? prices[SIZES[ml]] : null;
    if (!price) return send(res, 400, { error: `${name || 'Een product'} is niet leverbaar in ${ml} ml.` });
    lines.push({ name: `${name} · ${ml} ml`, description: 'Extrait de parfum', cents: Math.round(price * 100), qty });
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
  const shippingCents = ship
    ? (process.env.SHIPPING_PRICE_CENTS !== undefined ? (parseInt(process.env.SHIPPING_PRICE_CENTS, 10) || 0) : 495)
    : 0;

  const summary = lines.map(l => `${l.qty}x ${l.name}`).join(' | ');
  const order = {
    id: newId(6), items: lines.map(l => ({ name: l.name, qty: l.qty, cents: l.cents })),
    perfumes: setPerfumes,
    total: lines.reduce((t, l) => t + l.cents * l.qty, 0) + shippingCents, shipping: shippingCents,
    delivery: ship ? 'verzenden' : 'ophalen', address, name, email, phone,
    status: 'wacht op betaling', created: Date.now(),
  };
  await saveOrder(order);
  try {
    const pay = await createPayment({
      req,
      email,
      lines,
      shippingCents,
      shippingLabel: 'Verzending (PostNL)',
      metadata: {
        type: 'order', orderId: order.id, naam: name, telefoon: phone,
        levering: ship ? 'verzenden' : 'ophalen in de winkel',
        adres: address, bestelling: summary,
        ...(setPerfumes.length ? { discovery_set: setPerfumes.join(' · ') } : {}),
      },
      successPath: '/bedankt?type=order',
      cancelPath: '/afrekenen?geannuleerd=1',
    });
    if (pay.mock) { order.status = 'betaald'; order.mock = true; await saveOrder(order); }
    send(res, 200, { url: pay.url, mock: pay.mock });
  } catch (e) {
    console.error('order', e.message);
    send(res, 502, { error: 'De betaling kon niet worden gestart. Probeer het opnieuw.' });
  }
};
