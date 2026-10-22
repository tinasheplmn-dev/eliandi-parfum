/* ═══════════════════════════════════════════════════════════════
   ELIANDI — Google Agenda van Angelo (geen dependencies)

   Twee kanten:
   1. Lezen: staat er al iets in zijn agenda, dan verdwijnt dat
      tijdstip van de site. Hij hoeft niets dubbel bij te houden.
   2. Schrijven: elke boeking komt in zijn agenda te staan, met naam,
      telefoon en wat er betaald is. Annuleert hij in het dashboard,
      dan verdwijnt de afspraak ook uit de agenda.

   Aanzetten met twee variabelen:
     GOOGLE_CALENDAR_ID          het e-mailadres van zijn agenda
     GOOGLE_SERVICE_ACCOUNT_JSON de sleutel van het serviceaccount
                                 (de JSON zelf, of base64)
   Angelo deelt zijn agenda eenmalig met het e-mailadres van dat
   serviceaccount, met recht om afspraken te wijzigen.

   Staat een van beide er niet, dan doet alles hier niets en werkt de
   site precies zoals hiervoor.
   ═══════════════════════════════════════════════════════════════ */
const crypto = require('crypto');

const TZ = 'Europe/Amsterdam';
const SCOPE = 'https://www.googleapis.com/auth/calendar';
const CAL = () => process.env.GOOGLE_CALENDAR_ID || '';

function account() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const a = JSON.parse(json);
    return a.client_email && a.private_key ? a : null;
  } catch (e) {
    console.error('agenda: de sleutel van het serviceaccount is niet te lezen');
    return null;
  }
}

const enabled = () => Boolean(CAL() && account());

/* ── Toegangsbewijs (ruim een uur geldig, we hergebruiken het) ── */
let token = { value: '', expires: 0 };

async function accessToken() {
  if (token.value && token.expires > Date.now() + 60000) return token.value;
  const a = account();
  if (!a) return null;

  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({
    iss: a.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(a.private_key, 'base64url');

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${body}.${sig}`,
    }).toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) throw new Error('agenda: inloggen mislukt (' + (data.error_description || r.status) + ')');
  token = { value: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 };
  return token.value;
}

async function api(path, { method = 'GET', body } = {}) {
  const t = await accessToken();
  if (!t) return null;
  const r = await fetch('https://www.googleapis.com/calendar/v3' + path, {
    method,
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return {};
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('agenda ' + r.status + ': ' + ((data.error && data.error.message) || 'onbekende fout'));
  return data;
}

/* ── Lezen: wanneer kan Angelo niet? ──
   Geeft bezette perioden terug als { van, tot } in Nederlandse tijd,
   in dezelfde vorm als een slot ('2026-10-22T10:00'). */
let cache = { tot: 0, perioden: [] };

async function bezet(vanDate, totDate, amsKey) {
  if (!enabled()) return [];
  if (cache.tot > Date.now()) return cache.perioden;
  try {
    const d = await api('/freeBusy', {
      method: 'POST',
      body: {
        timeMin: vanDate.toISOString(),
        timeMax: totDate.toISOString(),
        timeZone: TZ,
        items: [{ id: CAL() }],
      },
    });
    const cal = d && d.calendars && d.calendars[CAL()];
    if (!cal) return [];
    if (cal.errors && cal.errors.length) {
      console.error('agenda: geen toegang tot', CAL(), cal.errors[0].reason);
      return [];
    }
    const perioden = (cal.busy || []).map(b => ({
      van: amsKey(new Date(b.start)),
      tot: amsKey(new Date(b.end)),
    }));
    cache = { tot: Date.now() + 120000, perioden }; // twee minuten
    return perioden;
  } catch (e) {
    console.error('agenda lezen', e.message);
    return [];
  }
}

/* ── Schrijven: de boeking in zijn agenda ── */
function omschrijving(b) {
  const euro = c => '€' + (c / 100).toFixed(2).replace('.', ',');
  const regels = [
    `${b.name} · ${b.phone} · ${b.email}`,
    `Formule: ${b.variant === 'duo' ? 'Duo, twee personen' : 'Solo'}`,
    b.voucher ? `Cadeaubon ${b.voucher}` : `Aanbetaald: ${euro(b.paid || 0)} van ${euro(b.price || 0)}, nog te voldoen in de winkel: ${euro((b.price || 0) - (b.paid || 0))}`,
    b.note ? `Opmerking van de klant: ${b.note}` : '',
    b.top5 && b.top5.length ? `Geurwijzer: ${b.top5.join(' · ')}` : '',
    b.profile && b.profile.length ? `Profiel: ${b.profile.join(', ')}` : '',
    `Geboekt via ${b.source === 'handmatig' ? 'het dashboard' : 'de website'}.`,
  ];
  return regels.filter(Boolean).join('\n');
}

async function zetErin(b) {
  if (!enabled() || !b || !b.slots || !b.slots.length) return null;
  try {
    const start = b.slots[0];
    const laatste = b.slots[b.slots.length - 1];
    const [h, m] = laatste.slice(11).split(':').map(Number);
    const eind = `${laatste.slice(0, 10)}T${String(Math.floor((h * 60 + m + 30) / 60)).padStart(2, '0')}:${String((h * 60 + m + 30) % 60).padStart(2, '0')}`;
    const ev = await api(`/calendars/${encodeURIComponent(CAL())}/events`, {
      method: 'POST',
      body: {
        summary: `Eliandi Experience · ${b.name}`,
        description: omschrijving(b),
        location: 'Eliandi Parfum, Vughterstraat 70, \'s-Hertogenbosch',
        start: { dateTime: start + ':00', timeZone: TZ },
        end: { dateTime: eind + ':00', timeZone: TZ },
      },
    });
    return ev && ev.id ? ev.id : null;
  } catch (e) {
    console.error('agenda schrijven', e.message);
    return null;
  }
}

async function haalEruit(eventId) {
  if (!enabled() || !eventId) return false;
  try {
    await api(`/calendars/${encodeURIComponent(CAL())}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
    return true;
  } catch (e) {
    if (/ 404| 410/.test(e.message)) return true; // stond er al niet meer
    console.error('agenda verwijderen', e.message);
    return false;
  }
}

module.exports = { enabled, bezet, zetErin, haalEruit };
