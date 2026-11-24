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

/* Cadeaubon of kortingscode? Een kortingscode gaat van de totaalprijs af;
   de aanbetaling zakt naar verhouding mee. Flacontegoed telt hier niet. */
async function codeVoor(cfg, people, code) {
  if (!code) return {};
  const voucher = await getVoucher(code);
  if (voucher) {
    if (voucher.status === 'pending') return { fout: 'Deze cadeaubon is nog niet betaald.' };
    if (voucher.status === 'used') return { fout: 'Deze cadeaubon is al gebruikt.' };
    const vp = peopleFrom(cfg, voucher.people !== undefined ? voucher.people : voucher.variant);
    if (vp !== people) return { fout: `Deze cadeaubon is voor ${label(vp).toLowerCase()}. Kies dat aantal, dan klopt het.` };
    return { voucher };
  }
  const { price, deposit } = priceOf(cfg, people);
  const k = await require('./_korting').bereken(code, price, false);
  if (!k) return {};
  if (k.fout) return { fout: /flacon/i.test(k.fout) ? 'Flacontegoed geldt in de winkel en bij een flacon, niet bij The Experience.' : k.fout };
  const nieuw = Math.max(0, price - k.cents);
  return { korting: { code: k.code, cents: k.cents, label: k.label }, price: nieuw, deposit: Math.min(nieuw, Math.round(deposit * nieuw / price)) };
}

module.exports = async (req, res) => {
  /* GET /api/book?code=…&people=… — code controleren voor de samenvatting */
  if (req.method === 'GET') {
    const u = new URL(req.url, 'http://x');
    if (await teVaak(req, 'code', 20, 600)) return send(res, 429, { error: 'Te veel pogingen. Probeer het over tien minuten opnieuw.' });
    const cfg = await getSettings();
    const r = await codeVoor(cfg, peopleFrom(cfg, u.searchParams.get('people')), clean(u.searchParams.get('code'), 30).toUpperCase());
    if (r.fout) return send(res, 400, { error: r.fout });
    if (r.voucher) return send(res, 200, { soort: 'cadeaubon' });
    if (r.korting) return send(res, 200, { soort: 'korting', label: r.korting.label, price: r.price, deposit: r.deposit });
    return send(res, 400, { error: 'Deze code kennen we niet.' });
  }
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
  const code = clean(b.voucher, 30).toUpperCase();
  const profile = Array.isArray(b.profile) ? b.profile.map(s => clean(s, 40)).slice(0, 10).join(', ') : '';
  const top5 = Array.isArray(b.top5) ? b.top5.map(s => clean(s, 80)).slice(0, 5).join(' · ') : '';

  const keys = slotsFor(cfg, slot, people);
  if (!keys) return send(res, 400, { error: `Dit moment is niet (meer) beschikbaar voor ${label(people).toLowerCase()}. Kies een ander moment.` });
  if (!name) return send(res, 400, { error: 'Vul je naam in.' });
  if (!isEmail(email)) return send(res, 400, { error: 'Vul een geldig e-mailadres in.' });
  if (!isPhone(phone)) return send(res, 400, { error: 'Vul een geldig telefoonnummer in.' });

  const gekozen = await codeVoor(cfg, people, code);
  if (gekozen.fout) return send(res, 400, { error: gekozen.fout });
  if (code && !gekozen.voucher && !gekozen.korting) return send(res, 400, { error: 'Deze code kennen we niet.' });
  const voucher = gekozen.voucher || null;

  /* staat er in de agenda van Angelo al iets op dit moment, dan kan
     het niet. De site verbergt die tijden al, maar dit is de controle
     die telt op het moment van boeken. */
  if (agenda.enabled()) {
    const nu = new Date();
    const perioden = await agenda.bezet(nu, new Date(nu.getTime() + (cfg.horizonDays + 2) * 86400000), amsKey);
    const botst = perioden.some(p => keys.some(k => k < p.tot && slotEnd(k) > p.van));
    if (botst) return send(res, 409, { error: 'Dit moment is net vervallen. Kies een ander moment.' });
  }

  const standaard = priceOf(cfg, people);
  const { minutes } = standaard;
  const price = gekozen.korting ? gekozen.price : standaard.price;
  /* de klant kiest: aanbetalen of alles in één keer */
  const volledig = b.volledig === true;
  const deposit = volledig ? price : (gekozen.korting ? gekozen.deposit : standaard.deposit);
  const id = newId(6);
  if (!(await holdSlots(keys, id, HOLD_SECONDS))) {
    return send(res, 409, { error: 'Net te laat: dit moment is zojuist geboekt. Kies een ander moment.' });
  }

  const booking = {
    id, people, minutes, slot, slots: keys, name, email, phone, note, profile, top5,
    price, deposit, paid: 0, status: 'wacht op betaling', source: 'website',
    voucher: voucher ? code : '', ...(gekozen.korting ? { korting: gekozen.korting } : {}), created: Date.now(),
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
          + (gekozen.korting ? `Met ${gekozen.korting.label} (${gekozen.korting.code}). ` : '')
          + (volledig ? 'Volledig betaald.' : `Aanbetaling ${cfg.depositPct}%; het restant betaal je in de winkel.`),
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
