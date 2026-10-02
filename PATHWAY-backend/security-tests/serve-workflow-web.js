const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = process.env.PATHWAY_WORKFLOW_WEB_DIR && path.resolve(process.env.PATHWAY_WORKFLOW_WEB_DIR);
const host = process.env.PATHWAY_WORKFLOW_WEB_HOST;
const port = Number(process.env.PATHWAY_WORKFLOW_WEB_PORT);

if (!root || host !== '127.0.0.1' || !Number.isInteger(port) || port < 1024 || port > 65535
  || !fs.existsSync(path.join(root, 'index.html'))) {
  throw new Error('Refusing to serve: expected an exported workflow app and the pinned loopback host/port.');
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD', 'X-Content-Type-Options': 'nosniff' });
    response.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  } catch (_) {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }

  const requestedPath = path.resolve(root, `.${pathname}`);
  if (requestedPath !== root && !requestedPath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  let filePath = requestedPath;
  try {
    if (!fs.statSync(filePath).isFile()) filePath = path.join(filePath, 'index.html');
  } catch (_) {
    if (path.extname(pathname)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    filePath = path.join(root, 'index.html');
  }

  const contentType = contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`PATHWAY local web app listening on http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
