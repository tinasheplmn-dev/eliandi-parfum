/* ═══════════════════════════════════════════════════════════════
   ELIANDI — gedeelde serverlogica (geen dependencies)

   Bestanden met een _ in api/ worden door Vercel niet als endpoint
   gepubliceerd; dit is alleen een bibliotheek voor de endpoints.

   Opslag (boekingen): Upstash Redis via REST. Zet in Vercel
     UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
   (of de KV_REST_API_URL / KV_REST_API_TOKEN van de Vercel-
   integratie). Zonder die variabelen valt hij terug op geheugen in
   het proces: prima lokaal, NIET geschikt voor productie.

   Betalen: Stripe Checkout zodra STRIPE_SECRET_KEY bestaat, anders
   testmodus (er wordt niets afgerekend). Een andere provider komt
   in createPayment() te zitten; de endpoints hoeven niet te wijzigen.
   ═══════════════════════════════════════════════════════════════ */

const crypto = require('crypto');

/* ── HTTP-hulpjes ── */
function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1.2e6) reject(new Error('too large')); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(await readRaw(req)); } catch (e) { return {}; }
}

function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto']
    || (/^(localhost|127\.|\[::1\])/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const isPhone = v => v.replace(/\D/g, '').length >= 10;

/* ── Opslag ── */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const memory = new Map(); // key -> { value, expires }

async function redis(cmd) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await r.json();
  if (data.error) throw new Error('redis: ' + data.error);
  return data.result;
}

function memGet(key) {
  const e = memory.get(key);
  if (!e) return null;
  if (e.expires && e.expires < Date.now()) { memory.delete(key); return null; }
  return e.value;
}

const store = {
  persistent: Boolean(REDIS_URL && REDIS_TOKEN),
  async get(key) {
    if (this.persistent) return redis(['GET', key]);
    return memGet(key);
  },
  async mget(keys) {
    if (!keys.length) return [];
    if (this.persistent) return redis(['MGET', ...keys]);
    return keys.map(memGet);
  },
  /* zet alleen als de sleutel nog vrij is; geeft true bij succes */
  async setNx(key, value, ttlSeconds) {
    if (this.persistent) {
      const cmd = ['SET', key, value, 'NX'];
      if (ttlSeconds) cmd.push('EX', String(ttlSeconds));
      return (await redis(cmd)) === 'OK';
    }
    if (memGet(key) !== null) return false;
    memory.set(key, { value, expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 });
    return true;
  },
  async set(key, value, ttlSeconds) {
    if (this.persistent) {
      const cmd = ['SET', key, value];
      if (ttlSeconds) cmd.push('EX', String(ttlSeconds));
      return redis(cmd);
    }
    memory.set(key, { value, expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 });
  },
  async del(key) {
    if (this.persistent) return redis(['DEL', key]);
    memory.delete(key);
  },
  /* teller, bijvoorbeeld voor factuurnummers: altijd oplopend, nooit dubbel */
  async incr(key) {
    if (this.persistent) return Number(await redis(['INCR', key]));
    const n = (Number(memGet(key)) || 0) + 1;
    memory.set(key, { value: String(n), expires: 0 });
    return n;
  },
  async expire(key, seconds) {
    if (this.persistent) return redis(['EXPIRE', key, String(seconds)]);
    const e = memory.get(key); if (e) e.expires = Date.now() + seconds * 1000;
  },
  /* sets: indexen van boekingen, bestellingen en bonnen */
  async sadd(key, member) {
    if (this.persistent) return redis(['SADD', key, member]);
    const s = memGet(key) || new Set();
    s.add(member);
    memory.set(key, { value: s, expires: 0 });
  },
  async srem(key, member) {
    if (this.persistent) return redis(['SREM', key, member]);
    const s = memGet(key);
    if (s) { s.delete(member); memory.set(key, { value: s, expires: 0 }); }
  },
  async smembers(key) {
    if (this.persistent) return (await redis(['SMEMBERS', key])) || [];
    return [...(memGet(key) || [])];
  },
  async getJson(key, fallback = null) {
    const v = await this.get(key);
    if (v == null) return fallback;
    try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return fallback; }
  },
  async setJson(key, obj) { return this.set(key, JSON.stringify(obj)); },
  async mgetJson(keys) {
    return (await this.mget(keys)).map(v => { try { return v ? JSON.parse(v) : null; } catch (e) { return null; } });
  },
};

const newId = (n = 8) => crypto.randomBytes(n).toString('hex');

/* ── Beheer: inloggen met ADMIN_PASSWORD, ondertekend token (12 uur) ──
   Lokaal zonder ADMIN_PASSWORD werkt het wachtwoord 'eliandi-lokaal'. */
function adminPassword(req) {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const host = (req.headers.host || '');
  return /^(localhost|127\.)/.test(host) ? 'eliandi-lokaal' : null;
}
const sign = (data, secret) => crypto.createHmac('sha256', 'eliandi-beheer:' + secret).update(data).digest('hex');

function makeToken(req) {
  const exp = String(Date.now() + 12 * 3600 * 1000);
  return exp + '.' + sign(exp, adminPassword(req));
}
function isAdmin(req) {
  const pw = adminPassword(req);
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [exp, sig] = t.split('.');
  if (!pw || !exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp, pw);
  try { return crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig)); } catch (e) { return false; }
}
/* Rem op raden: na tien foute pogingen per adres is het een kwartier dicht. */
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || '?').split(',')[0].trim();
}
/* Eenvoudige limiet per IP-adres, bijvoorbeeld tegen het raden van
   kortingscodes of cadeaubonnen en het volspammen van formulieren.
   Geeft true als dit verzoek boven de limiet zit. */
async function teVaak(req, soort, max, seconden) {
  try {
    const key = 'limiet:' + soort + ':' + clientIp(req);
    const n = await store.incr(key);
    if (n === 1) await store.expire(key, seconden);
    return n > max;
  } catch (e) { return false; }
}
async function loginGeblokkeerd(req) {
  const n = Number(await store.get('login-fout:' + clientIp(req))) || 0;
  return n >= 10;
}
async function loginMislukt(req) {
  const key = 'login-fout:' + clientIp(req);
  const n = await store.incr(key);
  if (n === 1) await store.expire(key, 15 * 60);
  return n;
}
async function loginGelukt(req) { await store.del('login-fout:' + clientIp(req)); }

function checkPassword(req, given) {
  const pw = adminPassword(req);
  if (!pw || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(pw).digest();
  const b = crypto.createHash('sha256').update(given).digest();
  return crypto.timingSafeEqual(a, b);
}

/* Teksten uit de bewerkmodus: alleen opmaak, nooit scripts of attributen. */
function sanitizeHtml(html) {
  return String(html || '')
    .slice(0, 4000)
    .replace(/<(script|style|iframe|object)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(\/?)(em|i|b|strong|br)\b[^>]*>/gi, '\u0001$1$2\u0002')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/\u0001/g, '<').replace(/\u0002/g, '>')
    .trim();
}

/* ── Betalen ──
   lines: [{ name, description, cents, qty }]
   Geeft { url, id, mock } terug. */
async function createPayment({ req, lines, shippingCents = 0, shippingLabel = '', email = '',
                               metadata = {}, successPath, cancelPath }) {
  const base = siteUrl(req);
  const key = process.env.STRIPE_SECRET_KEY;

  /* Mollie gaat voor, dat is de provider van Eliandi zelf */
  const mollie = require('./_mollie');
  if (mollie.enabled()) {
    return mollie.createPayment({ base, lines, shippingCents, shippingLabel, metadata, successPath, cancelPath });
  }

  if (!key) {
    const id = 'mock_' + crypto.randomBytes(6).toString('hex');
    const sep = successPath.includes('?') ? '&' : '?';
    return { url: `${base}${successPath}${sep}mock=1&sid=${id}`, id, mock: true };
  }

  const p = new URLSearchParams();
  p.append('mode', 'payment');
  p.append('locale', 'nl');
  p.append('payment_method_types[0]', 'ideal');
  p.append('payment_method_types[1]', 'card');
  lines.forEach((l, i) => {
    p.append(`line_items[${i}][quantity]`, String(l.qty || 1));
    p.append(`line_items[${i}][price_data][currency]`, 'eur');
    p.append(`line_items[${i}][price_data][unit_amount]`, String(l.cents));
    p.append(`line_items[${i}][price_data][product_data][name]`, l.name.slice(0, 250));
    if (l.description) p.append(`line_items[${i}][price_data][product_data][description]`, l.description.slice(0, 500));
  });
  if (shippingCents > 0) {
    const i = lines.length;
    p.append(`line_items[${i}][quantity]`, '1');
    p.append(`line_items[${i}][price_data][currency]`, 'eur');
    p.append(`line_items[${i}][price_data][unit_amount]`, String(shippingCents));
    p.append(`line_items[${i}][price_data][product_data][name]`, shippingLabel || 'Verzending');
  }
  const sep = successPath.includes('?') ? '&' : '?';
  p.append('success_url', `${base}${successPath}${sep}sid={CHECKOUT_SESSION_ID}`);
  p.append('cancel_url', `${base}${cancelPath}`);
  p.append('expires_at', String(Math.floor(Date.now() / 1000) + 31 * 60));
  if (email) p.append('customer_email', email);
  Object.entries(metadata).forEach(([k, v]) => {
    if (v !== undefined && v !== '') p.append(`metadata[${k}]`, String(v).slice(0, 500));
  });

  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p.toString(),
  });
  const data = await r.json();
  if (!r.ok || !data.url) throw new Error('stripe: ' + (data.error && data.error.message));
  return { url: data.url, id: data.id, mock: false };
}

/* Haalt de betaling op (voor bevestigen na terugkeer). */
async function getPayment(id) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!id || id.startsWith('mock_')) return null;
  const mollie = require('./_mollie');
  if (mollie.enabled()) return mollie.getPayment(id);
  if (!key) return null;
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(id), {
    headers: { Authorization: `Bearer ${key}` },
  });
  return r.ok ? r.json() : null;
}

module.exports = {
  send, readRaw, readJson, siteUrl, clean, isEmail, isPhone, store, createPayment, getPayment,
  newId, makeToken, isAdmin, checkPassword, sanitizeHtml,
  loginGeblokkeerd, loginMislukt, loginGelukt, clientIp, teVaak,
};
