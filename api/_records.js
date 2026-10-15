/* ═══════════════════════════════════════════════════════════════
   Registraties: boekingen, bestellingen en cadeaubonnen.
   Alles wat het dashboard toont, komt hier vandaan.

   booking:<id>  { id, variant, slots[], slot, name, email, phone, note,
                   profile, top5, price, deposit, paid, status, sid,
                   voucher, source, created }
   order:<id>    { id, items[], total, shipping, delivery, address,
                   name, email, phone, status, sid, created }
   voucher:<CODE>{ code, variant, price, buyer{}, recipient, message,
                   status: pending|paid|used, bookingId, created }
   ═══════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const { store } = require('./_lib');
const { slotStoreKey } = require('./_slots');

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
  }
  if (m.type === 'voucher' && m.code) {
    const v = await getVoucher(m.code);
    if (v && v.status === 'pending') { v.status = 'paid'; v.sid = session.id; await saveVoucher(v); }
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
  saveOrder, newVoucherCode, saveVoucher, getVoucher, onPaid, onExpired,
};
