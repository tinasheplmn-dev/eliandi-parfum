/* ═══════════════════════════════════════════════════════════════
   ELIANDI — betalen via Mollie (geen dependencies)

   Aanzetten met MOLLIE_API_KEY (test_... of live_...). Staat hij er
   niet, dan valt createPayment() terug op Stripe en anders op de
   testmodus; de endpoints merken daar niets van.

   Mollie zet het betaalkenmerk niet in de terugkeerlink, dus we
   maken zelf een kenmerk aan en onthouden welke betaling erbij
   hoort ('pay:<kenmerk>'). Daarmee kan de bedankpagina de betaling
   opvragen, ook als de webhook nog niet binnen is.
   ═══════════════════════════════════════════════════════════════ */
const { store, newId } = require('./_lib');

const API = 'https://api.mollie.com/v2';
const key = () => process.env.MOLLIE_API_KEY || '';
const enabled = () => Boolean(key());
const euro = cents => (cents / 100).toFixed(2);

async function call(path, { method = 'GET', body } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + key(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('mollie ' + r.status + ': ' + (data.detail || data.title || 'onbekende fout'));
  return data;
}

/* Mollie houdt metadata op 1 kB; we sturen alleen korte waarden mee.
   De volledige bestelling staat toch in onze eigen registratie. */
function trim(metadata) {
  const out = {};
  Object.entries(metadata || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') out[k] = String(v).slice(0, 180);
  });
  return out;
}

async function createPayment({ base, lines, shippingCents = 0, shippingLabel = '',
                               metadata = {}, successPath, cancelPath }) {
  const cents = lines.reduce((t, l) => t + l.cents * (l.qty || 1), 0) + shippingCents;
  const omschrijving = [
    ...lines.map(l => ((l.qty || 1) > 1 ? `${l.qty}x ` : '') + l.name),
    shippingCents > 0 ? (shippingLabel || 'Verzending') : '',
  ].filter(Boolean).join(' + ').slice(0, 255);

  const ref = newId(10);
  const sep = successPath.includes('?') ? '&' : '?';
  const lokaal = /^https?:\/\/(localhost|127\.|\[::1\])/.test(base);

  const payment = await call('/payments', {
    method: 'POST',
    body: {
      amount: { currency: 'EUR', value: euro(cents) },
      description: omschrijving || 'Eliandi Parfum',
      redirectUrl: `${base}${successPath}${sep}sid=${ref}`,
      cancelUrl: `${base}${cancelPath}`,
      // Mollie accepteert geen webhook naar localhost; lokaal bevestigt
      // de bedankpagina zelf via /api/confirm
      ...(lokaal ? {} : { webhookUrl: `${base}/api/mollie-webhook` }),
      locale: 'nl_NL',
      metadata: trim({ ...metadata, ref }),
    },
  });

  // kenmerk -> betaling, 60 dagen houdbaar
  await store.set('pay:' + ref, payment.id, 60 * 24 * 3600);
  const url = payment._links && payment._links.checkout && payment._links.checkout.href;
  if (!url) throw new Error('mollie: geen betaallink ontvangen');
  return { url, id: ref, mock: false };
}

/* ── De Geurreis: elk kwartaal een nieuwe doos ──
   Mollie mag pas periodiek afschrijven als de klant één keer zelf
   betaald heeft. Daarom: klant aanmaken, een eerste betaling met
   sequenceType 'first', en zodra die binnen is het abonnement
   aanmaken dat over drie maanden begint. */
async function createSubscription({ base, cents, description, email, name,
                                    metadata = {}, successPath, cancelPath }) {
  const klant = await call('/customers', { method: 'POST', body: { name: name || email, email } });
  const ref = newId(10);
  const sep = successPath.includes('?') ? '&' : '?';
  const lokaal = /^https?:\/\/(localhost|127\.|\[::1\])/.test(base);

  const payment = await call('/payments', {
    method: 'POST',
    body: {
      amount: { currency: 'EUR', value: euro(cents) },
      description: description.slice(0, 255),
      redirectUrl: `${base}${successPath}${sep}sid=${ref}`,
      cancelUrl: `${base}${cancelPath}`,
      ...(lokaal ? {} : { webhookUrl: `${base}/api/mollie-webhook` }),
      locale: 'nl_NL',
      customerId: klant.id,
      sequenceType: 'first',
      metadata: trim({ ...metadata, ref, abonnement: '1', site: lokaal ? '' : base }),
    },
  });

  await store.set('pay:' + ref, payment.id, 60 * 24 * 3600);
  const url = payment._links && payment._links.checkout && payment._links.checkout.href;
  if (!url) throw new Error('mollie: geen betaallink ontvangen');
  return { url, id: ref, mock: false };
}

/* Het abonnement zelf, nadat de eerste betaling binnen is. */
async function startSubscription(payment, { cents, description }) {
  if (!payment.customerId) return null;
  const start = new Date();
  start.setMonth(start.getMonth() + 3);
  const sub = await call(`/customers/${encodeURIComponent(payment.customerId)}/subscriptions`, {
    method: 'POST',
    body: {
      amount: { currency: 'EUR', value: euro(cents) },
      interval: '3 months',
      startDate: start.toISOString().slice(0, 10),
      description: description.slice(0, 255),
      ...(payment.metadata && payment.metadata.site
        ? { webhookUrl: payment.metadata.site + '/api/mollie-webhook' } : {}),
      metadata: trim(payment.metadata),
    },
  });
  return sub.id || null;
}

/* Kan er überhaupt een abonnement afgesloten worden? Dat mag alleen met
   een methode die later nog eens mag afschrijven (creditcard of
   automatische incasso). Staat zoiets niet aan in het Mollie-account,
   dan bieden we De Geurreis niet aan in plaats van de klant op een
   foutmelding te laten lopen. Antwoord tien minuten bewaren. */
let abonnementCache = { tot: 0, kan: false };

async function abonnementMogelijk() {
  if (!enabled()) return true; // testmodus of Stripe: gewoon tonen
  if (abonnementCache.tot > Date.now()) return abonnementCache.kan;
  try {
    const d = await call('/methods?sequenceType=first');
    const kan = Boolean(d._embedded && d._embedded.methods && d._embedded.methods.length);
    abonnementCache = { tot: Date.now() + 600000, kan };
    return kan;
  } catch (e) {
    console.error('mollie methoden', e.message);
    return false;
  }
}

/* Geeft de betaling terug in dezelfde vorm als de Stripe-sessie, zodat
   de bedankpagina en de webhook maar één soort object kennen. */
function normalise(p) {
  return {
    id: p.id,
    payment_status: p.status === 'paid' ? 'paid' : 'unpaid',
    status: p.status,
    metadata: p.metadata || {},
    amount: p.amount,
    customerId: p.customerId || '',
    sequenceType: p.sequenceType || '',
  };
}

async function getPayment(idOrRef) {
  if (!enabled() || !idOrRef) return null;
  let id = idOrRef;
  if (!/^tr_/.test(id)) {
    id = await store.get('pay:' + idOrRef);
    if (!id) return null;
  }
  try {
    return normalise(await call('/payments/' + encodeURIComponent(id)));
  } catch (e) {
    console.error('mollie get', e.message);
    return null;
  }
}

module.exports = {
  enabled, createPayment, getPayment, normalise,
  createSubscription, startSubscription, abonnementMogelijk,
};
