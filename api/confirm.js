/* GET /api/confirm?sid=... — vangnet na terugkeer van de betaalpagina.
   Doet hetzelfde als de webhook; dubbel verwerken kan geen kwaad. */
const { send, getPayment } = require('./_lib');
const { onPaid } = require('./_records');

module.exports = async (req, res) => {
  const sid = new URL(req.url, 'http://x').searchParams.get('sid') || '';
  if (sid.startsWith('mock_')) return send(res, 200, { paid: true, mock: true });
  try {
    const s = await getPayment(sid);
    if (!s) return send(res, 404, { paid: false });
    const paid = s.payment_status === 'paid';
    if (paid) await onPaid(s);
    send(res, 200, { paid, type: (s.metadata || {}).type || '' });
  } catch (e) {
    console.error('confirm', e.message);
    send(res, 500, { paid: false });
  }
};
