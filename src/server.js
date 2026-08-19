'use strict';
const http = require('http');
const gate = require('./gate');
const oidcMod = require('./oidc');
const page = require('./page');
const db = require('./db');
const imports = require('./import');
const worker = require('./worker');

const PORT = Number(process.env.PORT) || 3000;
const VERSION = process.env.MMRS_VERSION || '0.6.0';
const COMMIT = (process.env.SOURCE_COMMIT || 'unknown').slice(0, 8);
const STARTED = new Date();

// Pocket-ID when configured; the passcode remains only as a bootstrap for a
// future service copying this pattern. Once OIDC is set it is ignored entirely.
const oidc = oidcMod.fromEnv();
const MODE = oidc ? 'oidc' : (gate.secret() ? 'passcode' : 'none');

const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

function send(res, code, body, type = 'text/html; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), ...SEC, ...extra });
  res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8');
function redirect(res, location, extra = {}) { res.writeHead(303, { Location: location, ...extra }); res.end(); }

const safeReturnTo = (v) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//')) ? v : '/';

function statsFor(importId) {
  const s = db.corpusStats(importId);
  if (!s || !s.families) return null;
  return {
    ...s,
    queueByPriority: db.queueSummary(importId),
    era: db.eraSplit(importId),
    top: db.allFamilies(importId).slice(0, 8),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (p === '/healthz') {
    let corpus = null;
    try {
      const latest = db.listImports()[0];
      if (latest) corpus = { import: latest.id, status: latest.status };
    } catch (e) { corpus = { error: e.message }; }
    return json(res, 200, {
      ok: true, version: VERSION, commit: COMMIT, auth: MODE,
      extractor_ready: Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY),
      started: STARTED.toISOString(), uptime_s: Math.floor(process.uptime()), corpus,
    });
  }

  if (MODE === 'none') return send(res, 503, page.unconfigured());

  /* ---------- auth ---------- */
  let user = null;
  if (MODE === 'oidc') {
    if (p === '/auth/login') {
      try { return redirect(res, await oidc.authorizeUrl(safeReturnTo(url.searchParams.get('returnTo')))); }
      catch (e) { return send(res, 502, page.signin({ error: `Could not reach Pocket-ID: ${e.message}` })); }
    }
    if (p === '/auth/callback') {
      try {
        const { cookie, returnTo } = await oidc.callback(url);
        return redirect(res, returnTo, { 'Set-Cookie': oidc.cookieHeader(cookie) });
      } catch (e) {
        return send(res, 401, page.signin({ error: e.message }), 'text/html; charset=utf-8',
          { 'Set-Cookie': oidc.clearCookieHeader() });
      }
    }
    if (p === '/auth/logout') {
      const end = await oidc.endSessionUrl();
      return redirect(res, end || '/', { 'Set-Cookie': oidc.clearCookieHeader() });
    }
    user = oidc.sessionFrom(req);
    if (!user) return send(res, 401, page.signin({ returnTo: p === '/' ? null : p }));
  } else {
    if (p === '/gate' && req.method === 'POST') {
      const body = await new Promise((r) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => r(b)); });
      if (gate.check(new URLSearchParams(body).get('passcode'))) { gate.setCookie(res); return redirect(res, '/'); }
      return send(res, 401, page.signin({ error: 'Incorrect passcode.' }));
    }
    if (!gate.authed(req)) return send(res, 401, page.signin({}));
  }

  /* ---------- API ---------- */
  try {
    if (p === '/api/import' && req.method === 'PUT') {
      const rec = await imports.receive(req, url.searchParams.get('filename'), url.searchParams.get('corpus'));
      return json(res, 201, { id: rec.id, bytes: rec.bytes, sha256: rec.sha256 });
    }

    let m;
    if ((m = p.match(/^\/api\/import\/([\w-]+)\/scan$/)) && req.method === 'POST') {
      const scan = await imports.scan(m[1]);
      const wantsJson = (req.headers.accept || '').includes('application/json');
      return wantsJson ? json(res, 200, { id: m[1], scan }) : redirect(res, `/scan/${m[1]}`);
    }

    if ((m = p.match(/^\/api\/import\/([\w-]+)\/proceed$/)) && req.method === 'POST') {
      const result = imports.proceed(m[1]);
      const wantsJson = (req.headers.accept || '').includes('application/json');
      return wantsJson ? json(res, 200, { id: m[1], result }) : redirect(res, `/scan/${m[1]}`);
    }

    if ((m = p.match(/^\/api\/import\/([\w-]+)$/))) {
      if (req.method === 'DELETE') { imports.remove(m[1]); return json(res, 200, { deleted: m[1] }); }
      const rec = db.getImport(m[1]);
      if (!rec) return json(res, 404, { error: 'Unknown import' });
      return json(res, 200, { ...rec, scan_json: undefined, scan: rec.scan_json ? JSON.parse(rec.scan_json) : null });
    }

    if (p === '/api/run' && req.method === 'GET') {
      const latest = db.listImports().find((i) => i.status === 'ready');
      if (!latest) return json(res, 404, { error: 'no ready import' });
      return json(res, 200, {
        worker: worker.status(),
        progress: db.extractionProgress(latest.id),
        totals: db.totals(latest.id),
        recent: db.recentExtractions(latest.id, 8),
      });
    }
    if ((m = p.match(/^\/api\/run\/(start|stop)$/)) && req.method === 'POST') {
      const latest = db.listImports().find((i) => i.status === 'ready');
      if (!latest) return json(res, 400, { error: 'no ready import' });
      const limit = Number(url.searchParams.get('limit')) || null;
      const r = m[1] === 'start' ? worker.start(latest.id, limit) : worker.stop(latest.id);
      const wantsJson = (req.headers.accept || '').includes('application/json');
      // A limited run is a test — send the operator straight to the log.
      return wantsJson ? json(res, r.ok ? 200 : 409, r)
        : redirect(res, m[1] === 'start' && limit ? '/logs' : '/');
    }

    if (p === '/api/events' && req.method === 'GET') {
      const latest = db.listImports().find((i) => i.status === 'ready');
      return json(res, 200, {
        worker: worker.status(),
        events: db.listEvents({ importId: latest && latest.id,
          level: url.searchParams.get('level') || 'all',
          limit: Number(url.searchParams.get('limit')) || 100,
          sinceId: Number(url.searchParams.get('since')) || 0 }),
      });
    }

    /* ---------- pages ---------- */
    if (p === '/') {
      const list = db.listImports();
      const latest = list[0];
      const ready = list.find((i) => i.status === 'ready');
      return send(res, 200, page.dashboard({
        imports: list, stats: latest ? statsFor(latest.id) : null, user,
        run: ready ? {
          extractorReady: Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY),
          worker: worker.status(), progress: db.extractionProgress(ready.id),
          totals: db.totals(ready.id), recent: db.recentExtractions(ready.id, 6),
          findingTypes: db.findingsSummary(ready.id),
        } : null,
      }));
    }

    if (p === '/import') return send(res, 200, page.importPage({ error: url.searchParams.get('error') }));

    if (p === '/findings') {
      const latest = db.listImports().find((i) => i.status === 'ready');
      if (!latest) return send(res, 404, page.notFound());
      const type = url.searchParams.get('type') || 'all';
      return send(res, 200, page.findingsPage({
        type,
        findings: db.allFindings(latest.id, { type }),
        counts: db.findingsSummary(latest.id),
        verdicts: db.verdictCounts(latest.id),
        totals: db.totals(latest.id),
      }));
    }

    if (p === '/logs') {
      const latest = db.listImports().find((i) => i.status === 'ready');
      const level = url.searchParams.get('level') || 'all';
      return send(res, 200, page.logsPage({
        importId: latest && latest.id, level,
        events: db.listEvents({ importId: latest && latest.id, level, limit: 300 }),
        counts: latest ? db.eventCounts(latest.id) : [],
        worker: worker.status(),
      }));
    }

    if (p === '/families') {
      const latest = db.listImports().find((i) => i.status === 'ready');
      if (!latest) return send(res, 404, page.notFound());
      return send(res, 200, page.familiesPage({
        importId: latest.id, families: db.allFamilies(latest.id), stats: db.corpusStats(latest.id),
      }));
    }

    if ((m = p.match(/^\/family\/(.+)$/))) {
      const latest = db.listImports().find((i) => i.status === 'ready');
      if (!latest) return send(res, 404, page.notFound());
      const family = decodeURIComponent(m[1]);
      const detail = db.familyDetail(latest.id, family);
      if (!detail) return send(res, 404, page.notFound());
      return send(res, 200, page.familyPage({
        family, detail,
        conversations: db.familyConversations(latest.id, family),
        messages: db.familyMessages(latest.id, family),
        extraction: db.familyExtraction(latest.id, family),
        findings: db.familyFindings(latest.id, family),
        markers: db.familyMarkers(latest.id, family),
      }));
    }

    if ((m = p.match(/^\/scan\/([\w-]+)$/))) {
      const rec = db.getImport(m[1]);
      if (!rec || !rec.scan_json) return send(res, 404, page.notFound());
      return send(res, 200, page.scanPage({ rec, scan: JSON.parse(rec.scan_json), stats: statsFor(rec.id) }));
    }

    return send(res, 404, page.notFound());
  } catch (e) {
    console.error('[mmrs]', req.method, p, '-', e.message);
    if (p.startsWith('/api/')) return json(res, 500, { error: e.message });
    return send(res, 500, page.shell('MMRS — error',
      `<div style="max-width:640px;margin:0 auto;padding:64px 24px"><h1>Something broke</h1>
       <p class="err" style="margin-top:16px">${page.esc(e.message)}</p>
       <p><a href="/">Back to the dashboard</a></p></div>`));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  try { db.open(); } catch (e) { console.error('[mmrs] DB open failed:', e.message); }
  // HOME lives on the volume so the Claude CLI's state survives redeploys, but
  // the volume is empty on first boot and the CLI will not create it.
  try { require('fs').mkdirSync(process.env.HOME || '/data/home', { recursive: true }); } catch {}
  const hasToken = Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
  if (!hasToken) console.warn('[mmrs] no CLAUDE_CODE_OAUTH_TOKEN — extraction will fail until it is set');
  if (process.env.MMRS_WORKER !== '0') setTimeout(() => worker.resumeIfInterrupted(), 1500);
  const note = { oidc: `Pocket-ID (${process.env.OIDC_ISSUER})`, passcode: 'passcode (transitional)',
    none: 'NONE — serving 503' }[MODE];
  console.log(`[mmrs] v${VERSION} (${COMMIT}) on ${PORT} | auth: ${note} | data: ${db.DATA_DIR}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
