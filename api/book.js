/* POST /api/book — boekt een Experience voor 1 tot maxPeople personen.

   Met een betaalde cadeaubon-code is er niets meer te betalen: de
   boeking staat direct vast. Anders wordt het moment vastgehouden en
   start de aanbetaling; webhook of terugkeer zet hem op 'geboekt'. */
const { send, readJson, clean, isEmail, isPhone, createPayment, newId, teVaak, vreemdeHerkomst } = require('./_lib');
const { HOLD_SECONDS, getSettings, peopleFrom, priceOf, slotsFor, label, amsKey, slotEnd } = require('./_slots');
const { saveBooking, setBookingStatus, holdSlots, getVoucher, saveVoucher } = require('./_records');
const agenda = require('./_agenda');

const dayLabel = slot => new Date(slot.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('nl-NL', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (vreemdeHerkomst(req)) return send(res, 403, { error: 'Geen toegang.' });
  if (await teVaak(req, 'book', 15, 600)) return send(res, 429, { error: 'Te veel pogingen achter elkaar. Probeer het over een paar minuten opnieuw.' });
  const b = await readJson(req);
  const cfg = await getSettings();

  /* wachtlijst: geen plek voor dit gezelschap, maar wel interesse */
  if (b.wachtlijst) {
    const w = {
      id: newId(5), people: peopleFrom(cfg, b.people), name: clean(b.name, 80), email: clean(b.email, 120), phone: clean(b.phone, 30),
      wens: clean(b.wens, 300), created: Date.now(),
    };
    if (!w.name) return send(res, 400, { error: 'Vul je naam in.' });
    if (!isEmail(w.email)) return send(res, 400, { error: 'Vul een geldig e-mailadres in.' });
    const { store } = require('./_lib');
    await store.setJson('wachtlijst:' + w.id, w);
    await store.sadd('idx:wachtlijst', w.id);
    await require('./_mail').melding(`Wachtlijst Experience: ${w.name} (${label(w.people).toLowerCase()})`, [
      `${w.name} &middot; ${w.phone || '-'} &middot; ${w.email}`, w.wens ? `Wens: ${w.wens}` : '',
    ].filter(Boolean));
    return send(res, 200, { ok: true });
  }

  const people = peopleFrom(cfg, b.people !== undefined ? b.people : b.variant);
  const slot = clean(b.slot, 16);
  const name = clean(b.name, 80);
  const email = clean(b.email, 120);
  const phone = clean(b.phone, 30);
  const note = clean(b.note, 600);
  const code = clean(b.voucher, 20).toUpperCase();
  const profile = Array.isArray(b.profile) ? b.profile.map(s => clean(s, 40)).slice(0, 10).join(', ') : '';
  const top5 = Array.isArray(b.top5) ? b.top5.map(s => clean(s, 80)).slice(0, 5).join(' · ') : '';

  const keys = slotsFor(cfg, slot, people);
  if (!keys) return send(res, 400, { error: `Dit moment is niet (meer) beschikbaar voor ${label(people).toLowerCase()}. Kies een ander moment.` });
  if (!name) return send(res, 400, { error: 'Vul je naam in.' });
  if (!isEmail(email)) return send(res, 400, { error: 'Vul een geldig e-mailadres in.' });
  if (!isPhone(phone)) return send(res, 400, { error: 'Vul een geldig telefoonnummer in.' });

  let voucher = null;
  if (code) {
    voucher = await getVoucher(code);
    if (!voucher || voucher.status === 'pending') return send(res, 400, { error: 'Deze cadeaubon is onbekend of nog niet betaald.' });
    if (voucher.status === 'used') return send(res, 400, { error: 'Deze cadeaubon is al gebruikt.' });
    const vp = peopleFrom(cfg, voucher.people !== undefined ? voucher.people : voucher.variant);
    if (vp !== people) return send(res, 400, { error: `Deze cadeaubon is voor ${label(vp).toLowerCase()}. Kies dat aantal, dan klopt het.` });
  }

  /* staat er in de agenda van Angelo al iets op dit moment, dan kan
     het niet. De site verbergt die tijden al, maar dit is de controle
     die telt op het moment van boeken. */
  if (agenda.enabled()) {
    const nu = new Date();
    const perioden = await agenda.bezet(nu, new Date(nu.getTime() + (cfg.horizonDays + 2) * 86400000), amsKey);
    const botst = perioden.some(p => keys.some(k => k < p.tot && slotEnd(k) > p.van));
    if (botst) return send(res, 409, { error: 'Dit moment is net vervallen. Kies een ander moment.' });
  }

  const { price, deposit, minutes } = priceOf(cfg, people);
  const id = newId(6);
  if (!(await holdSlots(keys, id, HOLD_SECONDS))) {
    return send(res, 409, { error: 'Net te laat: dit moment is zojuist geboekt. Kies een ander moment.' });
  }

  const booking = {
    id, people, minutes, slot, slots: keys, name, email, phone, note, profile, top5,
    price, deposit, paid: 0, status: 'wacht op betaling', source: 'website',
    voucher: code || '', created: Date.now(),
  };
  await saveBooking(booking);
  const success = `/bedankt?type=experience&slot=${encodeURIComponent(slot)}&people=${people}`;

  try {
    if (voucher) {
      voucher.status = 'used';
      voucher.bookingId = id;
      await saveVoucher(voucher);
      await setBookingStatus(id, 'geboekt', { paid: price });
      return send(res, 200, { url: success + '&cadeau=1' });
    }
    const pay = await createPayment({
      req,
      email,
      lines: [{
        name: `The Eliandi Experience ${label(people)} · ${dayLabel(slot)} om ${slot.slice(11)}`,
        description: `${minutes} minuten privé met Angelo voor ${label(people).toLowerCase()}, inclusief 50 ml extrait de parfum op maat per persoon. `
          + `Aanbetaling ${cfg.depositPct}%; het restant betaal je in de winkel.`,
        cents: deposit,
        qty: 1,
      }],
      metadata: {
        type: 'experience', bookingId: id, personen: people, slot, naam: name, telefoon: phone,
        opmerkingen: note, geurprofiel: profile, geurwijzer_top5: top5,
      },
      successPath: success,
      cancelPath: '/experience?geannuleerd=1',
    });
    if (pay.mock) await setBookingStatus(id, 'geboekt', { paid: deposit, sid: pay.id, mock: true });
    else { booking.sid = pay.id; await saveBooking(booking); }
    send(res, 200, { url: pay.url, mock: pay.mock });
  } catch (e) {
    console.error('book', e.message);
    await setBookingStatus(id, 'verlopen');
    send(res, 502, { error: 'De betaling kon niet worden gestart. Probeer het opnieuw.' });
  }
};
