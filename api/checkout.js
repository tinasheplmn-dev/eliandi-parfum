/* ═══════════════════════════════════════════════════════════════
   ELIANDI — Stripe Checkout (Vercel serverless, geen dependencies)

   Maakt een Stripe Checkout-sessie aan voor de Discovery Set met
   de vijf parfums uit de geurwijzer als metadata, zodat Angelo in
   het Stripe-dashboard precies ziet welke samples erin moeten.

   Omgevingsvariabelen (Vercel > Settings > Environment Variables):
   - STRIPE_SECRET_KEY         sk_live_... of sk_test_...  (verplicht voor echt afrekenen)
   - DISCOVERY_PRICE_CENTS     eenmalige set in centen (standaard 4995 = €49,95)
   - SUBSCRIPTION_PRICE_CENTS  De Geurreis per kwartaal in centen (standaard 3995 = €39,95, incl. verzending)
   - SHIPPING_PRICE_CENTS      verzendkosten eenmalige set (standaard 495 = €4,95; 0 = gratis)
   - SITE_URL               bijv. https://eliandi-parfum.vercel.app (standaard: afgeleid van request)

   Zonder STRIPE_SECRET_KEY draait de functie in mockmodus: hij
   stuurt de bezoeker direct naar de bedankpagina met ?mock=1,
   zodat de hele flow te testen is voordat het Stripe-account er is.
   ═══════════════════════════════════════════════════════════════ */

const PRICE_FALLBACK_CENTS = 4995;     // €49,95 eenmalig — pas aan via DISCOVERY_PRICE_CENTS
const SUB_PRICE_FALLBACK_CENTS = 3995; // €39,95 per kwartaal — pas aan via SUBSCRIPTION_PRICE_CENTS

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  const { vreemdeHerkomst, teVaak } = require('./_lib');
  if (vreemdeHerkomst(req) || await teVaak(req, 'checkout', 15, 600)) {
    res.statusCode = 429;
    res.end(JSON.stringify({ error: 'Te veel pogingen achter elkaar. Probeer het over een paar minuten opnieuw.' }));
    return;
  }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(await readBody(req)); } catch (e) { body = {}; }
  }

  const perfumes = Array.isArray(body.perfumes)
    ? body.perfumes.map(s => String(s).slice(0, 120)).slice(0, 5)
    : [];
  const name = String(body.name || '').slice(0, 80);
  const phone = String(body.phone || '').slice(0, 30);
  const email = String(body.email || '').slice(0, 120);
  const profile = Array.isArray(body.profile)
    ? body.profile.map(s => String(s).slice(0, 40)).slice(0, 10).join(', ')
    : '';

  if (perfumes.length !== 5) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Vijf parfums verwacht.' }));
    return;
  }

  const siteUrl = require('./_lib').siteUrl(req);
  const key = process.env.STRIPE_SECRET_KEY;

  /* Bezorgadres: de doos moet ergens heen. Zonder adres geen bestelling. */
  const { clean } = require('./_lib');
  const a = body.address || {};
  const straat = clean(a.street, 120), postcode = clean(a.postcode, 12), plaats = clean(a.city, 60);
  const land = a.country === 'BE' ? 'BE' : 'NL';
  if (!straat || !postcode || !plaats) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Vul je volledige bezorgadres in.' }));
    return;
  }
  if (land === 'NL' && !/^\d{4}\s?[A-Za-z]{2}$/.test(postcode)) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Die postcode klopt nog niet.' }));
    return;
  }
  const adres = `${straat}, ${postcode} ${plaats}, ${land}`;

  const isSub = body.plan === 'sub';
  const cents = isSub
    ? (parseInt(process.env.SUBSCRIPTION_PRICE_CENTS, 10) || SUB_PRICE_FALLBACK_CENTS)
    : (parseInt(process.env.DISCOVERY_PRICE_CENTS, 10) || PRICE_FALLBACK_CENTS);
  /* bij De Geurreis zit de verzending in de prijs, bij de losse set niet */
  const verzendCents = isSub ? 0
    : (process.env.SHIPPING_PRICE_CENTS !== undefined ? (parseInt(process.env.SHIPPING_PRICE_CENTS, 10) || 0) : 495);

  /* registratie voor het dashboard */
  const { newId } = require('./_lib');
  const { saveOrder } = require('./_records');
  const order = {
    id: newId(6),
    items: [{ name: isSub ? 'De Geurreis (abonnement, per kwartaal)' : 'Discovery Set 5 x 10 ml', qty: 1, cents }],
    perfumes, total: cents + verzendCents, shipping: verzendCents, delivery: 'verzenden', address: adres,
    name, email, phone, status: 'wacht op betaling', created: Date.now(),
  };
  await saveOrder(order);

  /* ── Mollie: de provider van Eliandi zelf ── */
  const mollie = require('./_mollie');
  if (mollie.enabled()) {
    if (isSub && !(await mollie.abonnementMogelijk())) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'De Geurreis kun je nu nog niet online afsluiten. Bestel de set eenmalig, of bel Angelo op 06 87 08 02 56.' }));
      return;
    }
    const omschrijving = isSub
      ? 'Eliandi De Geurreis · elk kwartaal 5 × 10 ml uit jouw geurprofiel'
      : 'Eliandi Discovery Set · 5 × 10 ml extrait de parfum';
    const metadata = { type: 'order', orderId: order.id, naam: name, telefoon: phone,
      formule: isSub ? 'geurreis-kwartaal' : 'eenmalig', adres: adres };
    try {
      const pay = isSub
        ? await mollie.createSubscription({
          base: siteUrl, cents, description: omschrijving, email, name, metadata,
          successPath: '/bedankt?type=order', cancelPath: '/quiz?canceled=1',
        })
        : await require('./_lib').createPayment({
          req, email, lines: [{ name: omschrijving, cents, qty: 1 }], metadata,
          shippingCents: verzendCents, shippingLabel: 'Verzending (PostNL)',
          successPath: '/bedankt?type=order', cancelPath: '/quiz?canceled=1',
        });
      res.statusCode = 200;
      res.end(JSON.stringify({ url: pay.url }));
    } catch (e) {
      console.error('mollie checkout', e.message);
      res.statusCode = 502;
      res.end(JSON.stringify({ error: 'Betaling kon niet worden gestart. Probeer het opnieuw.' }));
    }
    return;
  }

  /* ── Mockmodus: geen sleutel, wel een testbare flow ── */
  if (!key) {
    order.status = 'betaald'; order.mock = true; await saveOrder(order);
    res.statusCode = 200;
    res.end(JSON.stringify({ url: `${siteUrl}/bedankt?mock=1`, mock: true }));
    return;
  }

  /* ── Stripe Checkout-sessie via REST (form-encoded) ── */
  const params = new URLSearchParams();
  params.append('mode', isSub ? 'subscription' : 'payment');
  params.append('locale', 'nl');
  params.append('payment_method_types[0]', 'ideal');
  params.append('payment_method_types[1]', 'card');
  params.append('line_items[0][quantity]', '1');
  params.append('line_items[0][price_data][currency]', 'eur');
  params.append('line_items[0][price_data][unit_amount]', String(cents));
  if (isSub) {
    // De Geurreis: elk kwartaal een nieuwe doos, verzending inbegrepen.
    params.append('line_items[0][price_data][recurring][interval]', 'month');
    params.append('line_items[0][price_data][recurring][interval_count]', '3');
    params.append('line_items[0][price_data][product_data][name]',
      'Eliandi De Geurreis · elk kwartaal 5 × 10 ml uit jouw geurprofiel');
    params.append('line_items[0][price_data][product_data][description]',
      'Eerste doos: ' + perfumes.join(' · ') + '. Inclusief verzending. Na de eerste doos opzegbaar. Persoonlijk samengesteld en daarom uitgesloten van herroeping.');
  } else {
    params.append('line_items[0][price_data][product_data][name]',
      'Eliandi Discovery Set · 5 × 10 ml extrait de parfum');
    params.append('line_items[0][price_data][product_data][description]',
      'Jouw persoonlijke selectie: ' + perfumes.join(' · ') + '. Persoonlijk samengesteld en daarom uitgesloten van herroeping.');
  }
  params.append('shipping_address_collection[allowed_countries][0]', 'NL');
  params.append('shipping_address_collection[allowed_countries][1]', 'BE');
  if (!isSub) {
    const shipCents = process.env.SHIPPING_PRICE_CENTS !== undefined
      ? (parseInt(process.env.SHIPPING_PRICE_CENTS, 10) || 0)
      : 495;
    params.append('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
    params.append('shipping_options[0][shipping_rate_data][display_name]',
      shipCents === 0 ? 'Gratis verzending' : 'Verzending (PostNL)');
    params.append('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(shipCents));
    params.append('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'eur');
  }
  params.append('success_url', `${siteUrl}/bedankt?sid={CHECKOUT_SESSION_ID}`);
  params.append('cancel_url', `${siteUrl}/quiz?canceled=1`);
  if (email) params.append('customer_email', email);
  perfumes.forEach((p, i) => params.append(`metadata[parfum_${i + 1}]`, p));
  if (name) params.append('metadata[voornaam]', name);
  if (phone) params.append('metadata[telefoon]', phone);
  if (profile) params.append('metadata[geurprofiel]', profile);
  params.append('metadata[formule]', isSub ? 'geurreis-kwartaal' : 'eenmalig');
  params.append('metadata[bron]', 'eliandi-geurwijzer');
  params.append('metadata[type]', 'order');
  params.append('metadata[orderId]', order.id);
  if (isSub) {
    // zelfde gegevens op het abonnement zelf, zodat Angelo ze bij elke
    // verlenging in het Stripe-dashboard terugziet
    perfumes.forEach((p, i) => params.append(`subscription_data[metadata][parfum_${i + 1}]`, p));
    if (name) params.append('subscription_data[metadata][voornaam]', name);
    if (phone) params.append('subscription_data[metadata][telefoon]', phone);
    if (profile) params.append('subscription_data[metadata][geurprofiel]', profile);
    params.append('subscription_data[metadata][bron]', 'eliandi-geurwijzer');
  }

  try {
    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await resp.json();
    if (!resp.ok || !data.url) {
      console.error('stripe error', data.error && data.error.message);
      res.statusCode = 502;
      res.end(JSON.stringify({ error: 'Betaling kon niet worden gestart. Probeer het opnieuw.' }));
      return;
    }
    res.statusCode = 200;
    res.end(JSON.stringify({ url: data.url }));
  } catch (e) {
    console.error('checkout failure', e.message);
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'Betaling kon niet worden gestart. Probeer het opnieuw.' }));
  }
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e5) reject(new Error('too large')); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
