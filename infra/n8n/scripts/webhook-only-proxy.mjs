import http from 'node:http';

const allowed = new Set([
  '/webhook/biz-wa-hub/platform',
  '/webhook/biz-wa-hub/evolution',
]);

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ok":true}');
    return;
  }

  if (request.method !== 'POST' || !allowed.has(url.pathname)) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end('{"ok":false,"error":"not_found"}');
    return;
  }

  const upstream = http.request({
    hostname: '127.0.0.1',
    port: 5678,
    method: request.method,
    path: url.pathname + url.search,
    headers: { ...request.headers, host: 'localhost:5678' },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });

  upstream.on('error', () => {
    if (!response.headersSent) {
      response.writeHead(502, { 'content-type': 'application/json' });
    }
    response.end('{"ok":false,"error":"upstream_unavailable"}');
  });

  request.pipe(upstream);
});

server.listen(5680, '0.0.0.0');
