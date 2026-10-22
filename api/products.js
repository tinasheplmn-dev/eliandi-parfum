/* GET /api/products — wat de geurwijzer bovenop de vaste catalogus moet weten:
   zelf toegevoegde parfums en aanpassingen (prijs, verborgen). */
const { send } = require('./_lib');
const { getCustom, getOverrides } = require('./_catalog');

module.exports = async (req, res) => {
  const [custom, overrides, abonnement] = await Promise.all([
    getCustom(), getOverrides(), require('./_mollie').abonnementMogelijk(),
  ]);
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=20, stale-while-revalidate=120');
  send(res, 200, { custom, overrides, abonnement });
};
