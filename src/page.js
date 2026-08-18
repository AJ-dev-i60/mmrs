'use strict';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (x) => (x == null ? '—' : Number(x).toLocaleString('en-GB'));
const mb = (b) => (b == null ? '—' : (b / 1048576).toFixed(0) + ' MB');

const CSS = `
:root{--ground:#f6f8f9;--panel:#fff;--panel-2:#f0f3f5;--ink:#141b1e;--ink-2:#4a595f;--ink-3:#78888f;
--line:#dde4e7;--line-2:#c8d3d8;--accent:#0d7d8c;--accent-ink:#fff;--accent-soft:#e2f1f3;
--wait:#a35a06;--wait-soft:#fdf0dd;--fail:#a51f1f;--fail-soft:#fbe6e6;--done:#5d6f76;--done-soft:#e9eef0;
--shadow:0 1px 2px rgba(20,27,30,.06),0 4px 14px rgba(20,27,30,.05);--r:9px}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
--ground:#0d1215;--panel:#141b1f;--panel-2:#1a2429;--ink:#e6edef;--ink-2:#a3b3b9;--ink-3:#71838a;
--line:#243036;--line-2:#31424a;--accent:#3fb8c9;--accent-ink:#06212a;--accent-soft:#13323a;
--wait:#e8a54a;--wait-soft:#33260f;--fail:#e97070;--fail-soft:#331717;--done:#8598a0;--done-soft:#1c262b;
--shadow:0 1px 2px rgba(0,0,0,.4),0 4px 16px rgba(0,0,0,.3)}}
:root[data-theme="dark"]{--ground:#0d1215;--panel:#141b1f;--panel-2:#1a2429;--ink:#e6edef;--ink-2:#a3b3b9;
--ink-3:#71838a;--line:#243036;--line-2:#31424a;--accent:#3fb8c9;--accent-ink:#06212a;--accent-soft:#13323a;
--wait:#e8a54a;--wait-soft:#33260f;--fail:#e97070;--fail-soft:#331717;--done:#8598a0;--done-soft:#1c262b;
--shadow:0 1px 2px rgba(0,0,0,.4),0 4px 16px rgba(0,0,0,.3)}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
font:15px/1.55 "IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.num,td.n,.v,.conf{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
.app{display:grid;grid-template-columns:224px 1fr;min-height:100vh}
@media (max-width:860px){.app{grid-template-columns:1fr}.rail{position:static;height:auto}}
.rail{background:var(--panel);border-right:1px solid var(--line);padding:20px 0 28px;
display:flex;flex-direction:column;gap:24px;position:sticky;top:0;height:100vh;overflow-y:auto}
.brand{padding:0 20px;display:flex;align-items:baseline;gap:9px}
.brand b{font-size:17px;font-weight:700;letter-spacing:-.01em}
.brand span{font-size:11px;color:var(--ink-3);letter-spacing:.08em;text-transform:uppercase}
nav{display:flex;flex-direction:column;gap:1px;padding:0 10px}
nav a{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 11px;
border-radius:7px;font-size:14px;color:var(--ink-2);text-decoration:none}
nav a:hover{background:var(--panel-2);color:var(--ink)}
nav a[aria-current="page"]{background:var(--accent-soft);color:var(--accent);font-weight:600}
nav a:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.spine{padding:0 20px}
.spine h3{font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-3);margin:0 0 12px;font-weight:600}
.stage{display:grid;grid-template-columns:20px 1fr;gap:10px;position:relative;padding-bottom:14px}
.stage:last-child{padding-bottom:0}
.stage::before{content:"";position:absolute;left:9.5px;top:19px;bottom:0;width:1.5px;background:var(--line-2)}
.stage:last-child::before{display:none}
.dot{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-family:"IBM Plex Mono",monospace;
font-size:10px;font-weight:600;background:var(--panel-2);color:var(--ink-3);border:1.5px solid var(--line-2);z-index:1}
.stage.done .dot{background:var(--done-soft);border-color:var(--done);color:var(--done)}
.stage.active .dot{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.stage-l{font-size:13.5px;line-height:1.35;padding-top:1px}
.stage.done .stage-l{color:var(--ink-3)}
.stage.active .stage-l{color:var(--ink);font-weight:600}
.stage-s{display:block;font-size:11.5px;color:var(--ink-3);font-weight:400;margin-top:1px}
.stage.active .stage-s{color:var(--accent)}
main{padding:26px 32px 60px;max-width:1180px}
@media (max-width:700px){main{padding:20px 16px 48px}}
.topbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;padding-bottom:18px;
margin-bottom:22px;border-bottom:1px solid var(--line)}
h1{font-size:22px;letter-spacing:-.015em;margin:0;font-weight:600;text-wrap:balance}
.sub{color:var(--ink-2);font-size:13.5px;margin:3px 0 0}
.spacer{flex:1}
.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:20px;font-size:12px;font-weight:600}
.pill.ok{background:var(--accent-soft);color:var(--accent)}
.pill.hold{background:var(--wait-soft);color:var(--wait)}
.pill.bad{background:var(--fail-soft);color:var(--fail)}
.pill.idle{background:var(--done-soft);color:var(--done)}
.beacon{width:6px;height:6px;border-radius:50%;background:currentColor}
.pill.ok .beacon{animation:pulse 1.9s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){.pill.ok .beacon{animation:none}}
.grid{display:grid;gap:14px}
.g4{grid-template-columns:repeat(4,1fr)}.g3{grid-template-columns:repeat(3,1fr)}
.g2{grid-template-columns:1.3fr 1fr}
@media (max-width:900px){.g4{grid-template-columns:repeat(2,1fr)}.g3,.g2{grid-template-columns:1fr}}
@media (max-width:520px){.g4{grid-template-columns:1fr}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow)}
.card-h{padding:13px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;
justify-content:space-between;gap:10px}
.card-h h2{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);margin:0;font-weight:600}
.card-b{padding:16px}
.stat{padding:15px 16px 16px}
.stat .k{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);font-weight:600}
.stat .v{font-size:27px;font-weight:500;letter-spacing:-.02em;margin-top:5px;line-height:1}
.stat .d{font-size:12px;color:var(--ink-2);margin-top:6px}
.tw{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:13.5px;min-width:420px}
th{text-align:left;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);
font-weight:600;padding:0 12px 9px 0;border-bottom:1px solid var(--line)}
td{padding:9px 12px 9px 0;border-bottom:1px solid var(--line)}
tr:last-child td{border-bottom:0}
td.n,th.n{text-align:right;padding-right:0}
.drop{border:1.5px dashed var(--line-2);border-radius:var(--r);padding:44px 24px;text-align:center;background:var(--panel-2)}
.drop.over{border-color:var(--accent);background:var(--accent-soft)}
.drop b{display:block;font-size:16px;margin-bottom:6px}
.drop p{margin:0;color:var(--ink-2);font-size:13.5px}
.btn{display:inline-flex;align-items:center;gap:7px;padding:9px 17px;border-radius:7px;background:var(--accent);
color:var(--accent-ink);font-size:13.5px;font-weight:600;cursor:pointer;border:0;text-decoration:none;
font-family:inherit}
.btn:hover{filter:brightness(1.08)}
.btn:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.btn:disabled{opacity:.45;cursor:not-allowed;filter:none}
.btn.ghost{background:transparent;color:var(--ink-2);border:1px solid var(--line-2)}
.btn.ghost:hover{background:var(--panel-2);color:var(--ink)}
.btn.sm{padding:6px 13px;font-size:12.5px}
.note{border-left:2px solid var(--accent);padding:2px 0 2px 14px;margin:18px 0 0;color:var(--ink-2);
font-size:13px;line-height:1.55}
.note.warn{border-color:var(--wait)}
.note b{color:var(--ink)}
.hist{display:flex;align-items:flex-end;gap:2px;height:64px;margin-top:4px}
.hist i{flex:1;background:var(--accent);opacity:.6;border-radius:1.5px 1.5px 0 0;min-height:2px}
.hist i.hot{opacity:1}
.hist-x{display:flex;justify-content:space-between;font-size:10.5px;color:var(--ink-3);margin-top:6px;
font-family:"IBM Plex Mono",monospace}
.meter{height:5px;background:var(--panel-2);border-radius:3px;overflow:hidden}
.meter i{display:block;height:100%;background:var(--accent);border-radius:3px}
.bar{height:4px;background:var(--panel-2);border-radius:2px;overflow:hidden;margin-top:5px}
.bar i{display:block;height:100%;background:var(--accent);opacity:.75}
progress{width:100%;height:8px}
.err{background:var(--fail-soft);color:var(--fail);padding:11px 14px;border-radius:7px;font-size:13.5px;margin:0 0 16px}
a{color:var(--accent)}
code{font-family:"IBM Plex Mono",monospace;font-size:12.5px;background:var(--panel-2);padding:1.5px 5px;border-radius:4px}
`;

function shell(title, body, opts = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>${CSS}</style></head><body>${body}${opts.script ? `<script>${opts.script}</script>` : ''}</body></html>`;
}

function frame(active, current, body) {
  const st = current || {};
  const stage = (nu, label, sub, state) =>
    `<div class="stage ${state}"><div class="dot">${nu}</div><div class="stage-l">${label}<span class="stage-s">${esc(sub)}</span></div></div>`;
  return `<div class="app"><aside class="rail">
<div class="brand"><b>MMRS</b><span>console</span></div>
<nav>
  <a href="/" ${active === 'dash' ? 'aria-current="page"' : ''}>Dashboard</a>
  <a href="/import" ${active === 'import' ? 'aria-current="page"' : ''}>Import</a>
</nav>
<div class="spine"><h3>Pipeline</h3>
${stage(1, 'Import', st.import || 'no export yet', st.s1 || '')}
${stage(2, 'Scan', st.scan || 'waiting', st.s2 || '')}
${stage(3, 'Normalise', st.norm || 'waiting', st.s3 || '')}
${stage(4, 'Extract', st.extract || 'not built yet', st.s4 || '')}
${stage(5, 'Review', st.review || 'not built yet', st.s5 || '')}
</div></aside><main>${body}</main></div>`;
}

/* ---------------- screens ---------------- */

function signin(opts = {}) {
  const href = opts.returnTo ? `/auth/login?returnTo=${encodeURIComponent(opts.returnTo)}` : '/auth/login';
  return shell('MMRS — sign in', `<div style="max-width:520px;margin:0 auto;padding:64px 24px">
<h1>MMRS</h1><p class="sub">Sign in to continue.</p>
<div class="card" style="margin-top:22px"><div class="card-b">
<p style="margin:0 0 18px">This service uses your EdgeStudios identity.</p>
<a class="btn" href="${href}">Sign in with Pocket-ID</a>
${opts.error ? `<p class="err" style="margin-top:16px">${esc(opts.error)}</p>` : ''}
</div></div></div>`);
}

function unconfigured() {
  return shell('MMRS — not configured', `<div style="max-width:560px;margin:0 auto;padding:64px 24px">
<h1>MMRS</h1><p class="sub">Refusing to serve.</p>
<div class="card" style="margin-top:22px"><div class="card-b">
<p style="margin:0">No access control is configured, so this service would be publicly readable.
The <code>*.edgestudios.co.za</code> wildcard means this hostname resolves for anyone.</p>
<p class="note">Set the <code>OIDC_*</code> variables in Coolify and redeploy.</p>
</div></div></div>`);
}

function statPill(status) {
  const map = {
    uploaded: ['hold', 'Uploaded — not scanned'], scanning: ['ok', 'Scanning'],
    scanned: ['hold', 'Scanned — awaiting proceed'], normalising: ['ok', 'Normalising'],
    ready: ['ok', 'Ready'], failed: ['bad', 'Failed'],
  };
  const [cls, label] = map[status] || ['idle', status];
  return `<span class="pill ${cls}">${cls === 'ok' ? '<span class="beacon"></span>' : ''}${esc(label)}</span>`;
}

function dashboard({ imports, stats, user }) {
  const latest = imports[0] || null;
  const cur = latest ? {
    import: `${esc(latest.filename)} · ${mb(latest.bytes)}`, s1: 'done',
    scan: latest.scan_json ? `${JSON.parse(latest.scan_json).conversations} chats` : 'waiting',
    s2: latest.scan_json ? 'done' : (latest.status === 'scanning' ? 'active' : ''),
    norm: stats && stats.families ? `${n(stats.families)} families` : 'waiting',
    s3: stats && stats.families ? 'done' : (latest.status === 'normalising' ? 'active' : ''),
    extract: stats && stats.families ? `0 / ${n(stats.families)}` : 'not built yet',
  } : {};

  const body = `<div class="topbar">
<div><h1>MMRS</h1><p class="sub">${latest ? `Latest import ${esc(latest.id)} · uploaded ${esc(latest.uploaded_at)}` : 'No export imported yet'}</p></div>
<div class="spacer"></div>
${latest ? statPill(latest.status) : ''}
${user ? `<span class="conf" style="font-size:12px;color:var(--ink-3)">${esc(user.name)} · <a href="/auth/logout">sign out</a></span>` : ''}
</div>

${!imports.length ? `<div class="card"><div class="card-b" style="text-align:center;padding:44px 24px">
<p style="margin:0 0 6px;font-size:16px;font-weight:600">Nothing imported yet</p>
<p class="sub" style="margin:0 0 20px">Drop a ChatGPT export to begin. Scanning is free — you see everything before anything is spent.</p>
<a class="btn" href="/import">Import an export</a></div></div>` : ''}

${stats && stats.families ? `<div class="grid g4">
<div class="card stat"><div class="k">Families</div><div class="v">${n(stats.families)}</div><div class="d">deduplicated units of work</div></div>
<div class="card stat"><div class="k">Messages</div><div class="v">${n(stats.messages)}</div><div class="d">${esc(stats.first || '')} → ${esc(stats.last || '')}</div></div>
<div class="card stat"><div class="k">Corpus</div><div class="v">${(stats.tokens / 1e6).toFixed(2)}<span style="font-size:15px">M</span></div><div class="d">estimated tokens</div></div>
<div class="card stat"><div class="k">Queued</div><div class="v">${n((stats.queue.find((q) => q.status === 'pending') || {}).n || 0)}</div><div class="d">awaiting extraction</div></div>
</div>` : ''}

${imports.length ? `<div class="card" style="margin-top:14px"><div class="card-h"><h2>Imports</h2>
<a class="btn ghost sm" href="/import">Import another</a></div><div class="card-b"><div class="tw"><table>
<thead><tr><th>Uploaded</th><th>File</th><th>Corpus</th><th class="n">Size</th><th class="n">Chats</th><th>Status</th><th></th></tr></thead>
<tbody>${imports.map((i) => {
    const s = i.scan_json ? JSON.parse(i.scan_json) : null;
    return `<tr><td class="n">${esc(i.uploaded_at.slice(0, 10))}</td><td>${esc(i.filename)}</td>
<td>${esc(i.corpus)}</td><td class="n">${mb(i.bytes)}</td><td class="n">${s ? n(s.conversations) : '—'}</td>
<td>${statPill(i.status)}</td>
<td class="n"><a href="/scan/${esc(i.id)}">${i.status === 'scanned' ? 'Review scan' : 'View'}</a></td></tr>`;
  }).join('')}</tbody></table></div>
${imports.some((i) => i.error) ? `<p class="note warn"><b>Last error:</b> ${esc(imports.find((i) => i.error).error)}</p>` : ''}
</div></div>` : ''}

<p class="note">Stages 4 and 5 — extraction and review — are not built yet. Everything above them is free
and spends no Claude quota, which is why it comes first.</p>`;

  return shell('MMRS Console', frame('dash', cur, body));
}

function importPage({ error }) {
  const body = `<div class="topbar">
<div><h1>Import an export</h1><p class="sub">Drop the zip OpenAI emails you. Nothing is processed until you proceed.</p></div>
</div>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<div class="drop" id="drop">
  <b>Drop your ChatGPT export here</b>
  <p>or choose a file — up to 2 GB, <code>.zip</code></p>
  <input type="file" id="file" accept=".zip,application/zip" hidden>
  <button class="btn" id="pick" style="margin-top:18px">Choose file</button>
  <div id="prog" style="display:none;margin-top:20px;text-align:left">
    <div class="sub" id="progLabel" style="margin-bottom:6px">Uploading…</div>
    <div class="meter"><i id="bar" style="width:0%"></i></div>
  </div>
</div>

<div class="card" style="margin-top:20px"><div class="card-h"><h2>What happens after you drop it</h2></div>
<div class="card-b"><div class="tw"><table>
<thead><tr><th>Stage</th><th>What it does</th><th>Cost</th></tr></thead><tbody>
<tr><td><b>Unpack</b></td><td>Extracts the archive, including the nested ones OpenAI puts inside it</td><td>free</td></tr>
<tr><td><b>Scan</b></td><td>Counts chats, messages, date range, size, duplicates</td><td>free</td></tr>
<tr><td><b>Normalise</b></td><td>Rebuilds each chat, folds branch duplicates, builds the task list</td><td>free</td></tr>
<tr><td><b>Extract</b></td><td>Reads each conversation and drafts findings</td><td>quota</td></tr>
</tbody></table></div>
<p class="note">The first three are <b>free and fast</b> — about two seconds for an 86 MB export.
You see the whole picture and press Proceed before any Claude quota is spent.</p>
</div></div>`;

  const script = `
const drop=document.getElementById('drop'),file=document.getElementById('file'),pick=document.getElementById('pick');
const prog=document.getElementById('prog'),bar=document.getElementById('bar'),label=document.getElementById('progLabel');
pick.onclick=()=>file.click();
file.onchange=()=>file.files[0]&&send(file.files[0]);
['dragenter','dragover'].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',ev=>{const f=ev.dataTransfer.files[0];if(f)send(f)});
function send(f){
  if(!/\\.zip$/i.test(f.name)){alert('Expected a .zip file');return}
  pick.disabled=true;prog.style.display='block';label.textContent='Uploading '+f.name+'…';
  const xhr=new XMLHttpRequest();
  xhr.open('PUT','/api/import?filename='+encodeURIComponent(f.name));
  xhr.upload.onprogress=e=>{if(e.lengthComputable)bar.style.width=(e.loaded/e.total*100).toFixed(0)+'%'};
  xhr.onload=()=>{
    if(xhr.status>=200&&xhr.status<300){
      const r=JSON.parse(xhr.responseText);
      label.textContent='Unpacking and scanning…';bar.style.width='100%';
      fetch('/api/import/'+r.id+'/scan',{method:'POST'}).then(res=>res.json()).then(s=>{
        if(s.error){label.textContent='Failed: '+s.error;pick.disabled=false;return}
        location.href='/scan/'+r.id;
      }).catch(e=>{label.textContent='Scan failed: '+e.message;pick.disabled=false});
    } else {
      let m=xhr.responseText;try{m=JSON.parse(m).error||m}catch{}
      label.textContent='Upload failed: '+m;pick.disabled=false;
    }
  };
  xhr.onerror=()=>{label.textContent='Upload failed — network error';pick.disabled=false};
  xhr.send(f);
}`;
  return shell('MMRS — Import', frame('import', {}, body), { script });
}

function scanPage({ rec, scan, stats }) {
  const months = Object.entries(scan.months || {}).filter(([k]) => k !== 'unknown');
  const maxC = Math.max(1, ...months.map(([, v]) => v.convos));
  const bars = months.map(([k, v]) =>
    `<i class="${k >= '2025-05' ? 'hot' : ''}" style="height:${Math.max(2, v.convos / maxC * 100).toFixed(0)}%" title="${esc(k)}: ${v.convos} chats"></i>`).join('');

  const ready = rec.status === 'ready';
  const body = `<div class="topbar">
<div><h1>Scan result</h1><p class="sub">${esc(rec.filename)} · ${mb(rec.bytes)} · nothing charged</p></div>
<div class="spacer"></div>${statPill(rec.status)}
${!ready ? `<form method="POST" action="/api/import/${esc(rec.id)}/proceed" style="display:inline">
<button class="btn" type="submit">Proceed — build the corpus</button></form>` : `<a class="btn ghost sm" href="/">Dashboard</a>`}
</div>

<div class="grid g4">
<div class="card stat"><div class="k">Conversations</div><div class="v">${n(scan.conversations)}</div><div class="d">${esc(scan.firstDate)} → ${esc(scan.lastDate)}</div></div>
<div class="card stat"><div class="k">After dedup</div><div class="v">${n(scan.families)}</div><div class="d">${n(scan.conversations - scan.families)} branch copies folded in</div></div>
<div class="card stat"><div class="k">Messages</div><div class="v">${n(scan.distinctMessageIds)}</div><div class="d">${n(scan.nodesAll - scan.nodesMain)} dead branch nodes skipped</div></div>
<div class="card stat"><div class="k">Size</div><div class="v">${(scan.estTokens / 1e6).toFixed(2)}<span style="font-size:15px">M</span></div><div class="d">est. tokens · ${scan.redundantPct}% redundant</div></div>
</div>

<div class="grid g2" style="margin-top:14px">
<div class="card"><div class="card-h"><h2>When you used it</h2><span class="conf" style="font-size:11.5px;color:var(--ink-3)">by month</span></div>
<div class="card-b"><div class="hist">${bars}</div>
<div class="hist-x"><span>${esc(months[0] ? months[0][0] : '')}</span><span>${esc(months[months.length - 1] ? months[months.length - 1][0] : '')}</span></div>
<p class="note">Highlighted bars are from <b>${esc(require('./ingest').ERA_BOUNDARY)}</b> onward — the era treated as primary evidence.
Everything before it is sparse enough to read as background rather than signal.</p></div></div>

<div class="card"><div class="card-h"><h2>Composition</h2></div><div class="card-b"><div class="tw"><table>
<tbody>
<tr><td>User wrote</td><td class="n">${n(scan.userChars)} chars</td></tr>
<tr><td>Assistant wrote</td><td class="n">${n(scan.asstChars)} chars</td></tr>
<tr><td>Rich conversations (10k+)</td><td class="n">${n(scan.richCount)}</td></tr>
<tr><td>…holding</td><td class="n">${scan.richShare}% of text</td></tr>
<tr><td>Families with branches</td><td class="n">${n(scan.branchFamilies)}</td></tr>
<tr><td>Nested archives unpacked</td><td class="n">${n(scan.nestedArchives)}</td></tr>
<tr><td>Attachments found</td><td class="n">${n(scan.attachments ? scan.attachments.count : 0)} · ${mb(scan.attachments ? scan.attachments.bytes : 0)}</td></tr>
</tbody></table></div></div></div>
</div>

${ready && stats ? `<div class="card" style="margin-top:14px"><div class="card-h"><h2>Corpus built</h2>
<span class="conf" style="font-size:11.5px;color:var(--ink-3)">${n(stats.families)} families · ${n(stats.messages)} messages</span></div>
<div class="card-b"><div class="tw"><table><thead><tr><th>Priority</th><th class="n">Families</th><th class="n">Tokens</th></tr></thead>
<tbody>${(stats.queueByPriority || []).map((p) => `<tr><td>p${p.priority}</td><td class="n">${n(p.n)}</td><td class="n">${n(p.tokens)}</td></tr>`).join('')}</tbody></table></div>
<p class="note">The task list is built and every family is <code>pending</code>. Extraction is the next stage
and is not built yet — no quota has been spent.</p></div></div>` : ''}

<div class="card" style="margin-top:14px"><div class="card-h"><h2>Worth knowing</h2></div><div class="card-b"><div class="tw">
<table><thead><tr><th>Finding</th><th>Why it matters</th></tr></thead><tbody>
<tr><td><b>${n(scan.richCount)} conversations hold ${scan.richShare}% of the text</b></td><td>Value is concentrated; the long tail is cheap and rarely yields much.</td></tr>
<tr><td><b>${scan.redundantPct}% of text is duplicated</b></td><td>Branch copies, folded on message ID. Without this the same argument is read repeatedly.</td></tr>
<tr><td><b>${n(scan.attachments ? scan.attachments.count : 0)} attachments</b></td><td>Not read. Images referenced by messages that call them "this".</td></tr>
<tr><td><b>${n(scan.nodesAll - scan.nodesMain)} dead branch nodes</b></td><td>Abandoned regenerations, skipped by walking from <code>current_node</code>.</td></tr>
</tbody></table></div></div></div>`;

  return shell('MMRS — Scan result', frame('dash', {
    import: `${rec.filename} · ${mb(rec.bytes)}`, s1: 'done',
    scan: `${scan.conversations} chats`, s2: 'done',
    norm: ready ? `${n(stats && stats.families)} families` : 'awaiting proceed',
    s3: ready ? 'done' : 'active',
  }, body));
}

function notFound() {
  return shell('MMRS — not found', frame('dash', {}, `<div class="topbar"><div><h1>Nothing here</h1>
<p class="sub">That path does not exist.</p></div></div>
<div class="card"><div class="card-b"><a href="/">Back to the dashboard</a></div></div>`));
}

module.exports = { shell, esc, dashboard, importPage, scanPage, signin, unconfigured, notFound };
