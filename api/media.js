/* GET /api/media?id=... — een door Angelo geüploade afbeelding.
   Wordt in de browser al verkleind tot max 1600 px JPEG voordat hij
   wordt opgeslagen; hier alleen terugsturen met lange cache. */
const { store } = require('./_lib');

module.exports = async (req, res) => {
  const id = (new URL(req.url, 'http://x').searchParams.get('id') || '').replace(/[^a-f0-9]/g, '');
  const data = id ? await store.get('media:' + id) : null;
  const m = data && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(data);
  if (!m) { res.statusCode = 404; return res.end('Niet gevonden'); }
  res.statusCode = 200;
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.end(Buffer.from(m[2], 'base64'));
};
