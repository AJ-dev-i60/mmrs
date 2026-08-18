'use strict';
const http = require('http');
const gate = require('./gate');
const oidcMod = require('./oidc');
const page = require('./page');

const PORT = Number(process.env.PORT) || 3000;
const VERSION = process.env.MMRS_VERSION || '0.2.0';
const COMMIT = (process.env.SOURCE_COMMIT || 'unknown').slice(0, 8);
const STARTED = new Date();

// Pocket-ID when configured, passcode only as a transitional fallback.
// Once OIDC is set the passcode is ignored entirely - "instead of", not
// "as well as", so there is no weaker second door left standing.
const oidc = oidcMod.fromEnv();
const MODE = oidc ? 'oidc' : (gate.secret() ? 'passcode' : 'none');

function uptime() {
  const s = Math.floor(process.uptime());
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600);
  const m = Math.floor(s % 3600 / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function send(res, code, body, type = 'text/html; charset=utf-8', extra = {}) {
  res.writeHead(code, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  });
  res.end(body);
}

function redirect(res, location, extra = {}) {
  res.writeHead(303, { Location: location, ...extra });
  res.end();
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

// Only same-origin relative paths, so ?returnTo= cannot become an open redirect.
function safeReturnTo(v) {
  return (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//')) ? v : '/';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  // Open: Coolify probes this before any session exists, and it discloses
  // nothing beyond version and uptime.
  if (path === '/healthz') {
    return send(res, 200, JSON.stringify({
      ok: true, version: VERSION, commit: COMMIT, auth: MODE,
      started: STARTED.toISOString(), uptime_s: Math.floor(process.uptime()),
    }), 'application/json; charset=utf-8');
  }

  // Fail closed. This hostname resolves publicly via the wildcard.
  if (MODE === 'none') return send(res, 503, page.unconfigured());

  // --- Pocket-ID ------------------------------------------------------------
  if (MODE === 'oidc') {
    if (path === '/auth/login') {
      try {
        return redirect(res, await oidc.authorizeUrl(safeReturnTo(url.searchParams.get('returnTo'))));
      } catch (e) {
        return send(res, 502, page.signin({ error: `Could not reach Pocket-ID: ${e.message}` }));
      }
    }

    if (path === '/auth/callback') {
      try {
        const { cookie, returnTo } = await oidc.callback(url);
        return redirect(res, returnTo, { 'Set-Cookie': oidc.cookieHeader(cookie) });
      } catch (e) {
        return send(res, 401, page.signin({ error: e.message }),
          'text/html; charset=utf-8', { 'Set-Cookie': oidc.clearCookieHeader() });
      }
    }

    if (path === '/auth/logout') {
      const end = await oidc.endSessionUrl();
      return redirect(res, end || '/', { 'Set-Cookie': oidc.clearCookieHeader() });
    }

    const session = oidc.sessionFrom(req);
    if (!session) {
      return send(res, 401, page.signin({ returnTo: path === '/' ? null : path }));
    }
    if (path === '/') {
      return send(res, 200, page.landing({
        version: VERSION, commit: COMMIT, auth: 'Pocket-ID',
        started: STARTED.toISOString().replace('T', ' ').slice(0, 19) + 'Z',
        uptime: uptime(), user: session,
      }));
    }
    return send(res, 404, page.notFound(session));
  }

  // --- transitional passcode ------------------------------------------------
  if (path === '/gate' && req.method === 'POST') {
    const supplied = new URLSearchParams(await readBody(req)).get('passcode');
    if (gate.check(supplied)) {
      gate.setCookie(res);
      return redirect(res, '/');
    }
    return send(res, 401, page.locked('Incorrect passcode.'));
  }
  if (!gate.authed(req)) return send(res, 401, page.locked(null));
  if (path === '/') {
    return send(res, 200, page.landing({
      version: VERSION, commit: COMMIT, auth: 'passcode (transitional)',
      started: STARTED.toISOString().replace('T', ' ').slice(0, 19) + 'Z',
      uptime: uptime(), user: null,
    }));
  }
  return send(res, 404, page.locked(null));
});

server.listen(PORT, '0.0.0.0', () => {
  const note = {
    oidc: `Pocket-ID (${process.env.OIDC_ISSUER})`,
    passcode: 'passcode - transitional, set OIDC_* to replace it',
    none: 'NONE - serving 503 until MMRS_PASSCODE or OIDC_* is set',
  }[MODE];
  console.log(`[mmrs] v${VERSION} (${COMMIT}) listening on ${PORT} | auth: ${note}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
