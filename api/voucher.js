/* /api/voucher — The Eliandi Experience als cadeau.

   POST: koopt een cadeaubon voor 1 tot maxPeople personen (volledige
         prijs) en start de betaling. De code wordt actief zodra er
         betaald is.
   GET ?code=: openbare gegevens voor de printbare bon en het boeken. */
const { send, readJson, clean, isEmail, isPhone, createPayment } = require('./_lib');
const { getSettings, peopleFrom, priceOf, label } = require('./_slots');
const { newVoucherCode, saveVoucher, getVoucher } = require('./_records');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const code = new URL(req.url, 'http://x').searchParams.get('code') || '';
    const v = await getVoucher(code);
    if (!v) return send(res, 404, { error: 'Onbekende code.' });
    const cfg = await getSettings();
    const people = peopleFrom(cfg, v.people !== undefined ? v.people : v.variant);
    return send(res, 200, {
      code: v.code, people, minutes: v.minutes || priceOf(cfg, people).minutes, label: label(people),
      recipient: v.recipient, message: v.message, from: v.buyer.name,
      status: v.status,
    });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  const b = await readJson(req);
  const cfg = await getSettings();
  const people = peopleFrom(cfg, b.people !== undefined ? b.people : b.variant);
  const buyer = { name: clean(b.name, 80), email: clean(b.email, 120), phone: clean(b.phone, 30) };
  const recipient = clean(b.recipient, 80);
  const message = clean(b.message, 300);
  if (!buyer.name) return send(res, 400, { error: 'Vul je naam in.' });
  if (!isEmail(buyer.email)) return send(res, 400, { error: 'Vul een geldig e-mailadres in.' });
  if (!isPhone(buyer.phone)) return send(res, 400, { error: 'Vul een geldig telefoonnummer in.' });

  const { price, minutes } = priceOf(cfg, people);
  const code = newVoucherCode();
  const voucher = { code, people, minutes, price, buyer, recipient, message, status: 'pending', created: Date.now() };
  await saveVoucher(voucher);

  try {
    const pay = await createPayment({
      req,
      email: buyer.email,
      lines: [{
        name: `Cadeaubon The Eliandi Experience · ${label(people)}`,
        description: `${minutes} minuten privé met Angelo voor ${label(people).toLowerCase()}, inclusief 50 ml extrait de parfum op maat per persoon. Volledig betaald.`,
        cents: price,
        qty: 1,
      }],
      metadata: { type: 'voucher', code, personen: people, koper: buyer.name, telefoon: buyer.phone, voor: recipient },
      successPath: `/bedankt?type=voucher&code=${code}`,
      cancelPath: '/experience?geannuleerd=1#cadeau',
    });
    if (pay.mock) { voucher.status = 'paid'; voucher.mock = true; await saveVoucher(voucher); }
    send(res, 200, { url: pay.url, code, mock: pay.mock });
  } catch (e) {
    console.error('voucher', e.message);
    send(res, 502, { error: 'De betaling kon niet worden gestart. Probeer het opnieuw.' });
  }
};
