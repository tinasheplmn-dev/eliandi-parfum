/* ═══════════════════════════════════════════════════════════════
   Registraties: boekingen, bestellingen en cadeaubonnen.
   Alles wat het dashboard toont, komt hier vandaan.

   booking:<id>  { id, people, minutes, slots[], slot, name, email, phone,
                   note, profile, top5, price, deposit, paid, status, sid,
                   voucher, source, created }   (oude records: variant solo|duo)
   order:<id>    { id, items[], total, shipping, delivery, address,
                   name, email, phone, status, sid, created }
   voucher:<CODE>{ code, people, minutes, price, buyer{}, recipient, message,
                   status: pending|paid|used, bookingId, created }
   ═══════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const { store } = require('./_lib');
const { slotStoreKey } = require('./_slots');
const agenda = require('./_agenda');
const mail = require('./_mail');

/* Eén keer, ook als twee berichten tegelijk binnenkomen.
   De webhook van de betaalprovider en de terugkeer van de klant
   arriveren vaak op hetzelfde moment, in twee aparte processen. Wie
   als eerste deze sleutel zet, mag de klus doen; de ander laat het.
   Zonder opslag (lokaal) is er maar één proces en dus geen race. */
async function eenmalig(sleutel, seconden = 7 * 24 * 3600) {
  return store.setNx('once:' + sleutel, String(Date.now()), seconden);
}

/* ── Boekingen ── */
async function saveBooking(b) {
  await store.setJson('booking:' + b.id, b);
  await store.sadd('idx:bookings', b.id);
}
const getBooking = id => store.getJson('booking:' + id);

async function setBookingStatus(id, status, extra = {}) {
  const b = await getBooking(id);
  if (!b) return null;
  Object.assign(b, extra, { status });

  /* de agenda van Angelo loopt mee: geboekt erin, afgezegd eruit */
  if (status === 'geboekt' && !b.eventId && agenda.enabled()) {
    if (await eenmalig('agenda:' + id)) {
      b.eventId = await agenda.zetErin(b);
      if (!b.eventId) await store.del('once:agenda:' + id); // mislukt, mag opnieuw
    }
  } else if ((status === 'geannuleerd' || status === 'verlopen') && b.eventId) {
    if (await agenda.haalEruit(b.eventId)) {
      b.eventId = null;
      await store.del('once:agenda:' + id);
    }
  }

  /* factuur voor de aanbetaling (niet bij een cadeaubon: die is al betaald
     toen de bon werd gekocht, en zonder aanbetaling is er niets te factureren) */
  let factuurBijlage = null;
  if (status === 'geboekt' && b.paid > 0 && !b.voucher) {
    try {
      const f = require('./_factuur');
      if (!b.factuur && await eenmalig('factuur-boeking:' + id)) {
        const doc = f.boekingAlsFactuur(b);
        b.factuur = (await f.maakFactuur(doc)).factuur;
        await saveBooking(b);
      }
      if (b.factuur) factuurBijlage = { filename: `factuur-${b.factuur.nummer}.pdf`, content: f.factuurPdf(f.boekingAlsFactuur(b), await f.getBedrijf()).toString('base64') };
    } catch (e) { console.error('factuur boeking', e.message); }
  }

  /* bevestiging naar de klant, één keer per boeking per gebeurtenis */
  if (status === 'geboekt' && await eenmalig('mail-geboekt:' + id)) {
    await mail.boekingBevestigd(b, factuurBijlage);
    await mail.melding(`Nieuwe boeking: ${b.name}, ${mail.datum(b.slot)} om ${b.slot.slice(11)}`, [
      `${b.name} &middot; ${b.phone} &middot; ${b.email}`,
      `${mail.gezelschap(b)} &middot; ${b.minutes || 30} minuten &middot; aanbetaald ${mail.euro(b.paid)} van ${mail.euro(b.price)}`,
      b.note ? `Opmerking: ${b.note}` : '',
      b.top5 && b.top5.length ? `Geurwijzer: ${Array.isArray(b.top5) ? b.top5.join(' · ') : b.top5}` : '',
    ].filter(Boolean));
  }
  if (status === 'geannuleerd' && await eenmalig('mail-weg:' + id)) {
    await mail.boekingGeannuleerd(b);
  }

  await saveBooking(b);
  for (const s of b.slots) {
    if (status === 'geboekt') {
      await store.setJson(slotStoreKey(s), { status: 'booked', bookingId: id });
    } else if (status === 'geannuleerd' || status === 'verlopen') {
      const cur = await store.getJson(slotStoreKey(s));
      if (cur && cur.bookingId === id) await store.del(slotStoreKey(s));
    }
  }
  return b;
}

/* Slots vasthouden voor een boeking; alles of niets. */
async function holdSlots(keys, bookingId, ttl) {
  const done = [];
  for (const k of keys) {
    const ok = await store.setNx(slotStoreKey(k), JSON.stringify({ status: 'held', bookingId }), ttl);
    if (!ok) { for (const d of done) await store.del(slotStoreKey(d)); return false; }
    done.push(k);
  }
  return true;
}

/* ── Bestellingen ── */
async function saveOrder(o) {
  await store.setJson('order:' + o.id, o);
  await store.sadd('idx:orders', o.id);
}
const getOrder = id => store.getJson('order:' + id);

/* Voorraad per maat omlaag zodra er betaald is (alleen waar Angelo een voorraad heeft ingevuld). */
async function voorraadAfboeken(o) {
  const { getOverrides } = require('./_catalog');
  const overrides = await getOverrides();
  const { SIZES, OLIE } = require('./_catalog');
  let gewijzigd = false;
  (o.items || []).forEach(i => {
    const plek = i.kind === 'olie' ? OLIE[i.ml] : SIZES[i.ml];
    if (!i.n || plek === undefined) return;
    const ov = overrides[i.n];
    if (!ov || !Array.isArray(ov.stock) || ov.stock[plek] == null) return;
    ov.stock[plek] = Math.max(0, ov.stock[plek] - i.qty);
    gewijzigd = true;
  });
  if (gewijzigd) await store.setJson('cms:product-overrides', overrides);
}

/* Statussen die Angelo in het dashboard zet. De klant krijgt bericht
   bij de stappen die er voor hem toe doen. */
const ORDER_STATUSSEN = ['betaald', 'wordt voorbereid', 'verzonden', 'klaar om op te halen', 'afgeleverd', 'geannuleerd'];
async function setOrderStatus(id, status, extra = {}) {
  if (!ORDER_STATUSSEN.includes(status)) return null;
  const o = await getOrder(id);
  if (!o) return null;
  o.status = status;
  if (extra.trackTrace !== undefined) o.trackTrace = String(extra.trackTrace).slice(0, 200);
  o.log = [...(o.log || []), { status, ts: Date.now() }].slice(-20);
  await saveOrder(o);
  if (['verzonden', 'klaar om op te halen', 'geannuleerd'].includes(status) && await eenmalig(`mail-status:${id}:${status}:${o.log.length}`, 600)) {
    await mail.bestellingStatus(o, status);
  }
  return o;
}

/* ── Cadeaubonnen ── */
function newVoucherCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // geen 0/O/1/I
  const pick = () => abc[crypto.randomInt(abc.length)];
  return 'ELI-' + Array.from({ length: 4 }, pick).join('') + '-' + Array.from({ length: 4 }, pick).join('');
}
async function saveVoucher(v) {
  await store.setJson('voucher:' + v.code, v);
  await store.sadd('idx:vouchers', v.code);
}
const getVoucher = code => store.getJson('voucher:' + String(code || '').toUpperCase().trim());

/* ── Na betaling (webhook én terugkeer) ── */
async function onPaid(session) {
  const m = session.metadata || {};
  if (m.type === 'experience' && m.bookingId) {
    const b = await getBooking(m.bookingId);
    if (b && b.status !== 'geboekt') await setBookingStatus(b.id, 'geboekt', { paid: b.deposit, sid: session.id });
  }
  if (m.type === 'order' && m.orderId) {
    const o = await store.getJson('order:' + m.orderId);
    if (o && o.status !== 'betaald') { o.status = 'betaald'; o.sid = session.id; await saveOrder(o); }

    /* factuur, voorraad en kortingscode: één keer per bestelling */
    if (o && await eenmalig('afhandeling:' + m.orderId)) {
      try {
        const { maakFactuur } = require('./_factuur');
        const f = await maakFactuur(o);
        o.factuur = f.factuur;
        await saveOrder(o);
      } catch (e) { console.error('factuur', e.message); }
      try { await voorraadAfboeken(o); } catch (e) { console.error('voorraad', e.message); }
      if (o.korting && o.korting.code) { try { await require('./_korting').gebruikt(o.korting.code); } catch (e) { /* niet erg */ } }
    }

    if (o && await eenmalig('mail-bestelling:' + m.orderId)) {
      let bijlage = null;
      try {
        const { factuurPdf, getBedrijf } = require('./_factuur');
        if (o.factuur) bijlage = { filename: `factuur-${o.factuur.nummer}.pdf`, content: factuurPdf(o, await getBedrijf()).toString('base64') };
      } catch (e) { console.error('factuurbijlage', e.message); }
      await mail.bestellingBetaald(o, bijlage);
      await mail.melding(`Nieuwe bestelling van ${o.name} (${mail.euro(o.total)})`, [
        `${o.name} &middot; ${o.phone} &middot; ${o.email}`,
        (o.items || []).map(i => `${i.qty}x ${i.name}`).join('<br>'),
        o.delivery === 'ophalen' ? 'Haalt af in de winkel' : `Verzenden naar ${o.address}`,
      ]);
    }

    /* De Geurreis: de eerste betaling is binnen, dus mag het
       kwartaalabonnement aan. Eén keer, nooit dubbel. */
    if (o && m.abonnement === '1' && !o.subscriptionId && session.sequenceType === 'first') {
      const mollie = require('./_mollie');
      if (mollie.enabled() && await eenmalig('abonnement:' + m.orderId)) {
        try {
          o.subscriptionId = await mollie.startSubscription(session, {
            cents: o.total,
            description: 'Eliandi De Geurreis · elk kwartaal 5 × 10 ml',
          });
          await saveOrder(o);
        } catch (e) {
          console.error('abonnement starten', e.message);
          await store.del('once:abonnement:' + m.orderId); // mislukt, mag opnieuw
        }
      }
    }
  }
  if (m.type === 'voucher' && m.code) {
    const v = await getVoucher(m.code);
    if (v && v.status === 'pending') { v.status = 'paid'; v.sid = session.id; await saveVoucher(v); }
    if (v && await eenmalig('mail-bon:' + m.code)) {
      await mail.bonBetaald(v, process.env.SITE_URL);
      await mail.melding(`Cadeaubon verkocht: ${v.code}`, [
        `${v.buyer && v.buyer.name} &middot; ${v.buyer && v.buyer.email}`,
        `${mail.gezelschap(v)} &middot; ${mail.euro(v.price)}${v.recipient ? ' &middot; voor ' + v.recipient : ''}`,
      ]);
    }
  }
}

async function onExpired(session) {
  const m = session.metadata || {};
  if (m.type === 'experience' && m.bookingId) {
    const b = await getBooking(m.bookingId);
    if (b && b.status === 'wacht op betaling') await setBookingStatus(b.id, 'verlopen');
  }
}

module.exports = {
  saveBooking, getBooking, setBookingStatus, holdSlots,
  saveOrder, getOrder, setOrderStatus, ORDER_STATUSSEN, newVoucherCode, saveVoucher, getVoucher, onPaid, onExpired,
};
