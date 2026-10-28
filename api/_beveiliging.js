/* ═══════════════════════════════════════════════════════════════
   Beveiliging van het beheerdashboard.

   - Sessies: ondertekend token (12 uur). "Overal uitloggen" verhoogt
     een versienummer, waardoor alle oude tokens ongeldig worden.
   - Wachtwoord: Angelo kan het zelf wijzigen; het nieuwe wachtwoord
     staat als scrypt-hash in de opslag. Zonder eigen wachtwoord geldt
     ADMIN_PASSWORD uit Vercel.
   - Tweestapsverificatie (TOTP, zoals Google Authenticator) met acht
     herstelcodes. Optioneel; Angelo zet het zelf aan.
   - Logboek van de laatste 300 handelingen.
   - Downloadlinks (factuur, pakbon, export, back-up) die vijf minuten
     geldig zijn, zodat het inlogtoken nooit in een URL staat.
   ═══════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const { store, clientIp } = require('./_lib');

function basisGeheim(req) {
  if (process.env.ADMIN_SECRET) return process.env.ADMIN_SECRET;
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const host = (req.headers.host || '');
  return /^(localhost|127\.)/.test(host) ? 'eliandi-lokaal' : null;
}
const hmac = (data, key) => crypto.createHmac('sha256', 'eliandi-beheer:' + key).update(data).digest('hex');
const gelijk = (a, b) => { try { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); } catch (e) { return false; } };
const versie = async () => Number(await store.get('admin:sessie')) || 0;

/* ── sessies ── */
async function maakToken(req) {
  const g = basisGeheim(req); if (!g) return null;
  const exp = String(Date.now() + 12 * 3600 * 1000);
  return exp + '.' + hmac(exp + ':' + await versie(), g);
}
async function ingelogd(req, token) {
  const g = basisGeheim(req);
  const h = req.headers.authorization || '';
  const t = token || (h.startsWith('Bearer ') ? h.slice(7) : '');
  const [exp, sig] = String(t).split('.');
  if (!g || !exp || !sig || Number(exp) < Date.now()) return false;
  return gelijk(hmac(exp + ':' + await versie(), g), sig);
}
async function overalUitloggen() { await store.incr('admin:sessie'); }

/* ── wachtwoord ── */
function scrypt(pw, salt) { return crypto.scryptSync(String(pw), salt, 32).toString('hex'); }
async function wachtwoordKlopt(req, gegeven) {
  if (typeof gegeven !== 'string' || !gegeven) return false;
  const eigen = await store.getJson('admin:wachtwoord', null);
  if (eigen && eigen.salt && eigen.hash) return gelijk(scrypt(gegeven, eigen.salt), eigen.hash);
  const pw = process.env.ADMIN_PASSWORD || (/^(localhost|127\.)/.test(req.headers.host || '') ? 'eliandi-lokaal' : null);
  if (!pw) return false;
  return gelijk(crypto.createHash('sha256').update(pw).digest('hex'), crypto.createHash('sha256').update(gegeven).digest('hex'));
}
async function wachtwoordWijzigen(nieuw) {
  const salt = crypto.randomBytes(16).toString('hex');
  await store.setJson('admin:wachtwoord', { salt, hash: scrypt(nieuw, salt), sinds: Date.now() });
  await overalUitloggen();
}
function wachtwoordSterk(pw) {
  pw = String(pw || '');
  if (pw.length < 12) return 'Kies minstens 12 tekens.';
  if (/^(.)\1+$/.test(pw) || /^(1234|abcd|wachtwoord|password|eliandi)/i.test(pw)) return 'Dat wachtwoord is te makkelijk te raden.';
  return '';
}

/* ── tweestapsverificatie (RFC 6238, 30 seconden, 6 cijfers) ── */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32encode(buf) { let bits = 0, val = 0, out = ''; for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(val << (5 - bits)) & 31]; return out; }
function b32decode(s) { let bits = 0, val = 0; const out = []; for (const c of String(s).replace(/=+$/, '').toUpperCase()) { const i = B32.indexOf(c); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function totp(secret, stap) {
  const buf = Buffer.alloc(8); buf.writeUInt32BE(Math.floor(stap / 0x100000000), 0); buf.writeUInt32BE(stap >>> 0, 4);
  const h = crypto.createHmac('sha1', b32decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, '0');
}
function totpKlopt(secret, code) {
  code = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  const nu = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some(d => gelijk(totp(secret, nu + d), code));
}
const hashCode = c => crypto.createHash('sha256').update(String(c).replace(/[\s-]/g, '').toUpperCase()).digest('hex');
async function tweestap() { return store.getJson('admin:totp', null); }
async function tweestapStart() {
  const secret = b32encode(crypto.randomBytes(20));
  await store.set('admin:totp-nieuw', secret, 15 * 60);
  return { secret, uri: `otpauth://totp/Eliandi%20Beheer?secret=${secret}&issuer=Eliandi%20Parfum&digits=6&period=30` };
}
async function tweestapBevestig(code) {
  const secret = await store.get('admin:totp-nieuw');
  if (!secret || !totpKlopt(secret, code)) return null;
  const codes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})(.{5})/, '$1-$2'));
  await store.setJson('admin:totp', { secret, herstel: codes.map(hashCode), sinds: Date.now() });
  await store.del('admin:totp-nieuw');
  return codes;
}
async function tweestapUit() { await store.del('admin:totp'); }
/* code uit de app, of een herstelcode (die is daarna verbruikt) */
async function tweestapKlopt(code) {
  const t = await tweestap(); if (!t) return true;
  if (totpKlopt(t.secret, code)) return true;
  const h = hashCode(code); const i = (t.herstel || []).indexOf(h);
  if (i >= 0) { t.herstel.splice(i, 1); await store.setJson('admin:totp', t); return 'herstel'; }
  return false;
}

/* ── logboek ── */
async function logboek(req, actie, info) {
  try {
    const lijst = await store.getJson('admin:logboek', []);
    const ip = clientIp(req).replace(/(\d+\.\d+)\.\d+\.\d+$/, '$1.x.x').replace(/:[\da-f:]+$/i, ':…');
    lijst.unshift({ t: Date.now(), actie, info: info ? String(info).slice(0, 160) : '', ip, apparaat: String(req.headers['user-agent'] || '').replace(/^.*\((.*?)\).*$/, '$1').slice(0, 60) });
    await store.setJson('admin:logboek', lijst.slice(0, 300));
  } catch (e) { /* logboek mag nooit iets blokkeren */ }
}

/* ── downloadlinks, vijf minuten geldig ── */
async function downloadLink(req, soort, id) {
  const exp = String(Date.now() + 5 * 60 * 1000);
  const sig = hmac(`dl:${soort}:${id}:${exp}:${await versie()}`, basisGeheim(req));
  return `/api/admin?dl=${encodeURIComponent(soort)}&id=${encodeURIComponent(id)}&exp=${exp}&sig=${sig}`;
}
async function downloadKlopt(req, soort, id, exp, sig) {
  const g = basisGeheim(req);
  if (!g || !exp || Number(exp) < Date.now()) return false;
  return gelijk(hmac(`dl:${soort}:${id}:${exp}:${await versie()}`, g), sig);
}

module.exports = {
  maakToken, ingelogd, overalUitloggen, wachtwoordKlopt, wachtwoordWijzigen, wachtwoordSterk,
  tweestap, tweestapStart, tweestapBevestig, tweestapUit, tweestapKlopt, totp, b32encode,
  logboek, downloadLink, downloadKlopt,
};
