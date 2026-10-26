// Reduced Montage Lab local server: static, read-only, loopback only. No dependencies.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'};
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  try {
    const port = server.address().port;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) { res.writeHead(403).end('Local access only'); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end('Read-only'); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const url = new URL(req.url, `http://${req.headers.host}`);
    const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
    if (name !== 'index.html' && !/^src\/[a-zA-Z0-9_-]+\.(js|css|svg)$/.test(name)) { res.writeHead(404).end('Not found'); return; }
    const body = await readFile(path.join(root, name));
    res.writeHead(200, {'Content-Type': `${types[path.extname(name)] || 'text/plain'}; charset=utf-8`}).end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(Number(process.env.RML_PORT || 8440), '127.0.0.1', () => console.log(`Reduced Montage Lab → http://127.0.0.1:${server.address().port}`));
