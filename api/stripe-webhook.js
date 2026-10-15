/* POST /api/stripe-webhook — Stripe meldt hier betaalde en verlopen sessies.

   Instellen in Stripe: Developers > Webhooks > endpoint
   https://<domein>/api/stripe-webhook met de events
   checkout.session.completed en checkout.session.expired.
   Zet het ondertekeningsgeheim als STRIPE_WEBHOOK_SECRET in Vercel. */
const crypto = require('crypto');
const { send, readRaw } = require('./_lib');
const { onPaid, onExpired } = require('./_records');

function verify(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=')));
  const t = parts.t, sig = parts.v1;
  if (!t || !sig || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig)); } catch (e) { return false; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  // ruwe body lezen; req.body niet aanraken, anders klopt de handtekening niet meer
  const raw = await readRaw(req);
  if (!verify(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) {
    return send(res, 400, { error: 'Ongeldige handtekening' });
  }
  const event = JSON.parse(raw);
  const s = event.data && event.data.object;
  try {
    if (event.type === 'checkout.session.completed' && s.payment_status === 'paid') await onPaid(s);
    if (event.type === 'checkout.session.expired') await onExpired(s);
    send(res, 200, { received: true });
  } catch (e) {
    console.error('webhook', e.message);
    send(res, 500, { error: 'verwerking mislukt' });
  }
};
