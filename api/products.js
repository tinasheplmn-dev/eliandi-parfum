/* GET /api/products — wat de geurwijzer bovenop de vaste catalogus moet weten:
   zelf toegevoegde parfums en aanpassingen (prijs, verborgen). */
const { send } = require('./_lib');
const { getCustom, getOverrides } = require('./_catalog');

module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x');
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
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=20, stale-while-revalidate=120');
  const { oliePrijs } = require('./_catalog');
  send(res, 200, {
    custom, overrides, abonnement, gratisVanaf: Number(bedrijf.gratisVanaf) || 0, reviews,
    olie: { 6: oliePrijs(bedrijf, 6) / 100, 13: oliePrijs(bedrijf, 13) / 100 },
    fotos: require('./_fotos.json'),
  });
};
