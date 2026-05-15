// @ts-no-check
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT       = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  const rawPath = (req.url || '/').split('?')[0].split('#')[0];
  const urlPath = rawPath === '/' ? '/index.html' : rawPath;
  const filePath = path.join(PUBLIC_DIR, urlPath);

  // Prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const ext         = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Test app server listening on http://localhost:${PORT}`);
  console.log('Pages:');
  console.log(`  http://localhost:${PORT}/                    → login`);
  console.log(`  http://localhost:${PORT}/inventory.html      → products`);
  console.log(`  http://localhost:${PORT}/cart.html           → cart`);
  console.log(`  http://localhost:${PORT}/checkout-step-one.html   → checkout info`);
  console.log(`  http://localhost:${PORT}/checkout-step-two.html   → checkout overview`);
  console.log(`  http://localhost:${PORT}/checkout-complete.html   → order complete`);
});
