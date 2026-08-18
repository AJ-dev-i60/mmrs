'use strict';
const http = require('http');
const gate = require('./gate');
const page = require('./page');

const PORT = Number(process.env.PORT) || 3000;
const VERSION = process.env.MMRS_VERSION || '0.1.0';
const COMMIT = (process.env.SOURCE_COMMIT || 'unknown').slice(0, 8);
const STARTED = new Date();

function uptime() {
  const s = Math.floor(process.uptime());
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600);
  const m = Math.floor(s % 3600 / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function send(res, code, body, type = 'text/html; charset=utf-8') {
  res.writeHead(code, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(body);
}

function readBody(req, limit = 4096) {
  return new Promise((resolve) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) { req.destroy(); return resolve(''); }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  // Healthcheck stays open — Coolify probes it before any session exists.
  if (path === '/healthz') {
    return send(res, 200, JSON.stringify({
      ok: true, version: VERSION, commit: COMMIT,
      started: STARTED.toISOString(), uptime_s: Math.floor(process.uptime()),
    }), 'application/json; charset=utf-8');
  }

  // Fail closed. An ungated service on this wildcard is readable by anyone.
  if (!gate.secret()) return send(res, 503, page.unconfigured());

  if (path === '/gate' && req.method === 'POST') {
    const body = await readBody(req);
    const supplied = new URLSearchParams(body).get('passcode');
    if (gate.check(supplied)) {
      gate.setCookie(res);
      res.writeHead(303, { Location: '/' });
      return res.end();
    }
    return send(res, 401, page.locked('Incorrect passcode.'));
  }

  if (!gate.authed(req)) return send(res, 401, page.locked(null));

  if (path === '/') {
    return send(res, 200, page.landing({
      version: VERSION, commit: COMMIT,
      started: STARTED.toISOString().replace('T', ' ').slice(0, 19) + 'Z',
      uptime: uptime(),
    }));
  }

  return send(res, 404, page.locked(null));
});

server.listen(PORT, '0.0.0.0', () => {
  if (!gate.secret()) {
    console.warn('[mmrs] MMRS_PASSCODE is not set - serving 503 until it is.');
  }
  console.log(`[mmrs] v${VERSION} (${COMMIT}) listening on ${PORT}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
