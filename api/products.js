/* GET /api/products — wat de geurwijzer bovenop de vaste catalogus moet weten:
   zelf toegevoegde parfums en aanpassingen (prijs, verborgen). */
const { send } = require('./_lib');
const { getCustom, getOverrides } = require('./_catalog');

/* POST /api/products — anonieme meting voor de inzichten in het dashboard.
   Geen cookies, geen IP-adressen, geen persoonsgegevens: alleen tellers per
   dag (bezoek, product bekeken, winkelmand, afrekenen, geurwijzer) en per
   maand de zoekwoorden en bekeken geuren. */
const MEET = new Set(['bezoek', 'product', 'winkelmand', 'afrekenen', 'zoek', 'geurwijzer', 'geurwijzer-klaar']);
async function meten(req, res) {
  const { store, readJson, teVaak, vreemdeHerkomst } = require('./_lib');
  if (vreemdeHerkomst(req)) return send(res, 200, {});
  if (/bot|crawl|spider|slurp|preview|headless|lighthouse|monitor/i.test(req.headers['user-agent'] || '')) return send(res, 200, {});
  if (await teVaak(req, 'meet', 300, 600)) return send(res, 200, {});
  const b = await readJson(req).catch(() => ({}));
  const e = String(b.e || '');
  if (!MEET.has(e)) return send(res, 200, {});
  const d = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date());
  const m = d.slice(0, 7), JAAR = 400 * 86400;
  const tel = async k => { const n = await store.incr(k); if (n === 1) await store.expire(k, JAAR); };
  await tel(`stat:${d}:${e}`);
  if (!(await store.get('stat:sinds'))) await store.set('stat:sinds', d);
  if (e === 'zoek') {
    const q = String(b.q || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
    /* alleen gewone zoekwoorden, nooit e-mailadressen of telefoonnummers */
    if (q.length >= 2 && !/@|\d{5,}/.test(q) && /^[\p{L}\p{N} '&.\-]+$/u.test(q)) {
      await tel(`zoek:${m}:${q}`); await store.sadd(`zoeken:${m}`, q);
      if (b.leeg) { await tel(`zoekleeg:${m}:${q}`); await store.sadd(`zoekenleeg:${m}`, q); }
    }
  }
  if (e === 'product' && b.n) {
    const slug = String(b.n).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
    if (slug) { await tel(`pview:${m}:${slug}`); await store.sadd(`pviews:${m}`, slug); }
  }
  return send(res, 200, {});
}

/* POST /api/products?geurwijzer=1 — iemand vult na de geurwijzer naam en
   e-mail in: profiel, antwoorden en de vijf geuren komen in het dashboard.
   Bewaard tot twee jaar, of korter als de klant om wissen vraagt. */
const TWEE_JAAR = 2 * 365 * 86400;
async function geurwijzer(req, res) {
  const { store, readJson, clean, isEmail, newId, teVaak, vreemdeHerkomst } = require('./_lib');
  if (vreemdeHerkomst(req)) return send(res, 403, { error: 'Geen toegang.' });
  if (await teVaak(req, 'geurwijzer', 10, 600)) return send(res, 429, { error: 'Te veel pogingen.' });
  const b = await readJson(req).catch(() => ({}));
  const lijst = (v, n, len) => (Array.isArray(v) ? v : []).slice(0, n).map(x => clean(x, len)).filter(Boolean);
  const g = {
    id: newId(6), created: Date.now(),
    name: clean(b.name, 80), email: clean(b.email, 120).toLowerCase(), phone: clean(b.phone, 30),
    nieuws: b.consent === true,
    top5: lijst(b.top5, 5, 80),
    profiel: lijst(b.profile, 8, 60),
    zin: clean(b.zin, 400),
    antwoorden: (Array.isArray(b.answers) ? b.answers : []).slice(0, 15)
      .map(a => ({ q: clean(a && a.q, 160), a: lijst(a && a.a, 8, 120) })).filter(a => a.q),
    taal: ['nl', 'en', 'ar'].includes(b.lang) ? b.lang : 'nl',
  };
  if (!g.name || !isEmail(g.email) || !g.top5.length) return send(res, 400, { error: 'Onvolledig.' });
  await store.setJson('geurwijzer:' + g.id, g);
  await store.expire('geurwijzer:' + g.id, TWEE_JAAR);
  await store.sadd('idx:geurwijzer', g.id);
  return send(res, 200, { ok: true });
}

module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'POST') return u.searchParams.get('geurwijzer') ? geurwijzer(req, res) : meten(req, res);
  if (u.searchParams.get('code')) {
    if (await require('./_lib').teVaak(req, 'code', 20, 600)) return send(res, 429, { error: 'Te veel pogingen. Probeer het over tien minuten opnieuw.' });
    const k = await require('./_korting').bereken(u.searchParams.get('code'), parseInt(u.searchParams.get('sub'), 10) || 0);
    res.setHeader('Cache-Control', 'no-store');
    if (!k || k.fout) return send(res, 400, { error: (k && k.fout) || 'Onbekende code.' });
    const codes = await require('./_korting').getCodes();
    const def = codes.find(c => c.code === k.code) || {};
    return send(res, 200, { korting: { code: k.code, label: k.label, pct: def.soort === 'pct' ? Number(def.waarde) : 0, bedrag: def.soort === 'bedrag' ? Number(def.waarde) / 100 : 0 } });
  }
  const [custom, overrides, abonnement, bedrijf, reviews] = await Promise.all([
    getCustom(), getOverrides(), require('./_mollie').abonnementMogelijk(),
    require('./_factuur').getBedrijf(), require('./_lib').store.getJson('cms:reviews', {}),
  ]);
  /* browsers vragen altijd opnieuw; alleen Vercel bewaart het antwoord heel even */
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('Vercel-CDN-Cache-Control', 'max-age=15, stale-while-revalidate=45');
  const { oliePrijs } = require('./_catalog');
  send(res, 200, {
    custom, overrides, abonnement, gratisVanaf: Number(bedrijf.gratisVanaf) || 0, reviews,
    olie: { 6: oliePrijs(bedrijf, 6) / 100, 13: oliePrijs(bedrijf, 13) / 100 },
    fotos: require('./_fotos.json'),
  });
};
