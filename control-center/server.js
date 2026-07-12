import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CEOOperationsConsoleService } from './src/ceo-operations-console-service.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const service = new CEOOperationsConsoleService();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (url.pathname === '/api/dashboard') {
    const payload = service.getDashboardPayload();
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload, null, 2));
    return;
  }

  const filePath = resolveFilePath(url.pathname);

  try {
    const content = await readFile(filePath);
    response.writeHead(200, { 'content-type': MIME_TYPES[extname(filePath)] ?? 'text/plain; charset=utf-8' });
    response.end(content);
  } catch (_error) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

function resolveFilePath(pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  return join(ROOT, safePath);
}

const port = Number(process.env.PORT ?? 4173);
server.listen(port, () => {
  process.stdout.write(`CEO Operations Console listening on http://localhost:${port}\n`);
});
