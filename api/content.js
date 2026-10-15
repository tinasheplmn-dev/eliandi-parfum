/* GET /api/content?page=index — teksten en beelden die Angelo heeft aangepast.
   { texts: { <sleutel>: html }, images: { <sleutel>: '/api/media?id=...' } } */
const { send, store } = require('./_lib');

module.exports = async (req, res) => {
  const page = (new URL(req.url, 'http://x').searchParams.get('page') || 'index').replace(/[^a-z0-9-]/g, '');
  const c = await store.getJson('cms:content:' + page, { texts: {}, images: {} });
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=20, stale-while-revalidate=120');
  send(res, 200, c);
};
