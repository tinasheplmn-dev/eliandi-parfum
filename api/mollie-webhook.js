/* POST /api/mollie-webhook — Mollie meldt hier elke statuswijziging.

   Mollie stuurt alleen een kenmerk mee, geen bedrag en geen status.
   We halen de betaling daarom zelf op met onze eigen sleutel; dat is
   meteen de controle dat het bericht echt van Mollie komt.

   Altijd 200 teruggeven: bij iets anders blijft Mollie het opnieuw
   proberen, ook als het probleem bij ons ligt. */
const { send, readRaw } = require('./_lib');
const { getPayment, enabled } = require('./_mollie');
const { onPaid, onExpired } = require('./_records');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (!enabled()) return send(res, 200, { ok: true });

  try {
    const raw = typeof req.body === 'string' ? req.body : await readRaw(req);
    const id = new URLSearchParams(raw).get('id')
      || (req.body && typeof req.body === 'object' ? req.body.id : '');
    if (!id) return send(res, 200, { ok: true });

    const p = await getPayment(id);
    if (!p) return send(res, 200, { ok: true });

    if (p.status === 'paid') await onPaid(p);
    else if (['expired', 'canceled', 'failed'].includes(p.status)) await onExpired(p);
  } catch (e) {
    console.error('mollie-webhook', e.message);
  }
  send(res, 200, { ok: true });
};
