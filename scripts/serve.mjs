// Development server: serves the app to this computer and to phones on
// the same Wi-Fi. Run with `npm start`, then open one of the printed URLs.
// Files are sent with caching off, so a reload always shows the latest.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { hostname, networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT ?? 8000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = normalize(join(root, path.endsWith('/') ? `${path}index.html` : path));
  if (!file.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

// The Mac's .local name keeps working when the router hands out a new
// address, so it comes first. The numeric addresses are a fallback, minus
// the self-assigned 169.254 ones, which a phone can't reach.
server.listen(port, () => {
  const name = hostname().replace(/(\.local)?$/, '.local');
  console.log(`On this computer: http://localhost:${port}/`);
  console.log(`On your phone:    http://${name}:${port}/`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const { family, internal, address } of addresses) {
      if (family === 'IPv4' && !internal && !address.startsWith('169.254.')) {
        console.log(`             or:  http://${address}:${port}/`);
      }
    }
  }
});
