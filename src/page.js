'use strict';

const CSS = `
:root{--bg:#fbfaf8;--fg:#1a1917;--mut:#6b6764;--line:#e5e1db;--card:#fff;--accent:#15803d}
@media (prefers-color-scheme:dark){:root{--bg:#14130f;--fg:#eceae5;--mut:#9a948c;--line:#2b2822;--card:#1c1a16}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;
 -webkit-font-smoothing:antialiased}
.wrap{max-width:820px;margin:0 auto;padding:56px 24px 80px}
h1{font-size:26px;letter-spacing:-.02em;margin:0 0 4px;font-weight:650}
.sub{color:var(--mut);margin:0 0 40px;font-size:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:22px 24px;margin:0 0 16px}
.card h2{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:var(--mut);margin:0 0 14px;font-weight:600}
dl{display:grid;grid-template-columns:auto 1fr;gap:9px 22px;margin:0;font-variant-numeric:tabular-nums}
dt{color:var(--mut)}dd{margin:0}
.pill{display:inline-block;padding:2px 9px;border-radius:99px;font-size:12px;font-weight:600;
 background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
.note{border-left:2px solid var(--accent);padding-left:16px;margin:26px 0 0;color:var(--mut);font-size:14px}
code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:color-mix(in srgb,var(--fg) 7%,transparent);
 padding:1.5px 5px;border-radius:4px}
form{display:flex;gap:9px;margin:22px 0 0}
input{flex:1;padding:10px 13px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);font:inherit}
button{padding:10px 20px;border:0;border-radius:8px;background:var(--fg);color:var(--bg);font:inherit;font-weight:600;cursor:pointer}
.err{color:#b91c1c;font-size:14px;margin:14px 0 0}
a{color:var(--accent)}
.btn{display:inline-block;padding:11px 22px;border-radius:8px;background:var(--fg);color:var(--bg);
 text-decoration:none;font-weight:600}
@media (prefers-color-scheme:dark){.err{color:#f87171}}
`;

function shell(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${title}</title><style>${CSS}</style>
</head><body><div class="wrap">${body}</div></body></html>`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function landing(info) {
  const u = info.user;
  return shell('MMRS', `
<h1>MMRS</h1>
<p class="sub">mmrs.edgestudios.co.za — <span class="pill">scaffold</span></p>

${u ? `<div class="card">
  <h2>Signed in</h2>
  <dl>
    <dt>Name</dt><dd>${esc(u.name)}</dd>
    ${u.email ? `<dt>Email</dt><dd>${esc(u.email)}</dd>` : ''}
    ${u.groups && u.groups.length ? `<dt>Groups</dt><dd>${esc(u.groups.join(', '))}</dd>` : ''}
  </dl>
  <p style="margin:16px 0 0"><a href="/auth/logout">Sign out</a></p>
</div>` : ''}

<div class="card">
  <h2>Service</h2>
  <dl>
    <dt>Status</dt><dd>running</dd>
    <dt>Auth</dt><dd>${esc(info.auth)}</dd>
    <dt>Version</dt><dd><code>${esc(info.version)}</code></dd>
    <dt>Commit</dt><dd><code>${esc(info.commit)}</code></dd>
    <dt>Started</dt><dd>${esc(info.started)}</dd>
    <dt>Uptime</dt><dd>${esc(info.uptime)}</dd>
    <dt>Node</dt><dd>${process.version}</dd>
  </dl>
</div>

<div class="card">
  <h2>What this is</h2>
  <p style="margin:0">A deployment scaffold, stood up to prove the path end to end:
  DNS through the <code>*.edgestudios.co.za</code> wildcard, certificate issue, Coolify build
  and deploy, healthcheck, and the access gate. Nothing else is wired yet.</p>
  <p class="note">The application this becomes has not been specified. It is deliberately
  gated rather than open, because what it is expected to hold is the most sensitive
  material on this platform.</p>
</div>`);
}

function locked(err) {
  return shell('MMRS', `
<h1>MMRS</h1>
<p class="sub">This service is gated.</p>
<div class="card">
  <form method="POST" action="/gate">
    <input type="password" name="passcode" placeholder="Passcode" autofocus
           autocomplete="current-password" aria-label="Passcode">
    <button type="submit">Enter</button>
  </form>
  ${err ? `<p class="err">${err}</p>` : ''}
</div>`);
}

function unconfigured() {
  return shell('MMRS — not configured', `
<h1>MMRS</h1>
<p class="sub">Refusing to serve.</p>
<div class="card">
  <h2>No access control configured</h2>
  <p style="margin:0">Neither <code>MMRS_PASSCODE</code> nor an OIDC client is set, so this
  service would be publicly readable. The <code>*.edgestudios.co.za</code> wildcard means this
  hostname resolves for anyone.</p>
  <p class="note">Set <code>MMRS_PASSCODE</code> in Coolify and redeploy.</p>
</div>`);
}

function signin(opts = {}) {
  const href = opts.returnTo
    ? `/auth/login?returnTo=${encodeURIComponent(opts.returnTo)}`
    : '/auth/login';
  return shell('MMRS — sign in', `
<h1>MMRS</h1>
<p class="sub">Sign in to continue.</p>
<div class="card">
  <p style="margin:0 0 18px">This service uses your EdgeStudios identity.</p>
  <p style="margin:0"><a class="btn" href="${href}">Sign in with Pocket-ID</a></p>
  ${opts.error ? `<p class="err">${esc(opts.error)}</p>` : ''}
</div>`);
}

function notFound(user) {
  return shell('MMRS — not found', `
<h1>MMRS</h1>
<p class="sub">Nothing here.</p>
<div class="card">
  <p style="margin:0">That path does not exist.
  <a href="/">Back to the landing page</a>.</p>
</div>`);
}

module.exports = { landing, locked, unconfigured, signin, notFound };
