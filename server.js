/* Simpele statische server voor lokale preview. Productie heeft dit niet nodig:
   de site is volledig statisch en kan op elke host. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 8048;

/* Sleutels voor lokaal testen uit .env.local (staat in .gitignore,
   gaat dus nooit mee naar GitHub). Eén regel per sleutel:
     MOLLIE_API_KEY=test_...
   Regels met een # ervoor worden overgeslagen. Op Vercel komen de
   sleutels uit de omgevingsvariabelen en wordt dit bestand genegeerd. */
try {
  const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  env.split(/\r?\n/).forEach(regel => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(regel);
    if (!m || regel.trim().startsWith('#')) return;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    }
  });
  console.log('Sleutels uit .env.local geladen.');
} catch (e) { /* geen .env.local, prima */ }

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);

  // API: draai de echte functies uit api/ (zelfde code als op Vercel).
  // Zonder STRIPE_SECRET_KEY rekenen ze in testmodus af.
  // productpagina's: /geur/<slug> -> api/geur.js (op Vercel via een rewrite)
  const geur = reqPath.match(/^\/geur\/([a-z0-9-]+)$/);
  if (geur) req.url = '/api/geur?slug=' + geur[1] + (/[?&]lang=(en|ar)\b/.test(req.url) ? '&lang=' + req.url.match(/[?&]lang=(en|ar)\b/)[1] : '');
  const xml = { '/sitemap.xml': 'sitemap', '/robots.txt': 'robots', '/feed.xml': 'feed' }[reqPath];
  if (xml) req.url = '/api/geur?' + xml + '=1';
  const api = (geur || xml ? '/api/geur' : reqPath).match(/^\/api\/([a-z0-9-]+)$/);
  if (api) {
    const file = path.join(ROOT, 'api', api[1] + '.js');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Niet gevonden'); }
    Promise.resolve(require(file)(req, res)).catch(e => {
      console.error(e);
      if (!res.headersSent) { res.writeHead(500); res.end('Serverfout'); }
    });
    return;
  }

  // cleanUrls zoals op Vercel: /quiz en /bedankt werken zonder .html
  if (!path.extname(reqPath) && reqPath !== '/' && !reqPath.endsWith('/')) {
    if (fs.existsSync(path.join(ROOT, reqPath + '.html'))) reqPath += '.html';
  }
  if (reqPath.endsWith('/')) reqPath += 'index.html';
  const file = path.normalize(path.join(ROOT, reqPath));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Verboden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Niet gevonden: ' + reqPath);
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log('Eliandi Parfum preview op http://localhost:' + PORT));
