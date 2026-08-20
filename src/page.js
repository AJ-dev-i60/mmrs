'use strict';

const md = require('./md');
const esc = md.esc;
const n = (x) => (x == null ? '—' : Number(x).toLocaleString('en-GB'));
const mb = (b) => (b == null ? '—' : (b / 1048576).toFixed(0) + ' MB');
// Scannable magnitudes. 349k reads faster down a column than 349,214, and the
// exact figure stays available on hover.
const compact = (x) => {
  if (x == null) return '—';
  if (x >= 1e6) return (x / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (x >= 1e3) return Math.round(x / 1e3) + 'k';
  return String(x);
};

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
.btn.danger{background:transparent;color:var(--fail);border:1px solid color-mix(in srgb,var(--fail) 40%,transparent)}
.btn.danger:hover{background:var(--fail-soft);filter:none}
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
input[type=search]{width:100%;padding:9px 13px;border:1px solid var(--line-2);border-radius:7px;
background:var(--panel);color:var(--ink);font:inherit;font-size:14px}
input[type=search]:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:var(--accent)}
th.sortable{cursor:pointer;user-select:none}
th.sortable:hover{color:var(--ink)}
th.sortable::after{content:"";opacity:.4;margin-left:5px}
th.sortable[data-dir="asc"]::after{content:"↑";opacity:1}
th.sortable[data-dir="desc"]::after{content:"↓";opacity:1}
tr.fam:hover{background:var(--panel-2)}
.famtable{table-layout:fixed;min-width:640px}
.famtable th,.famtable td{padding-right:20px}
.famtable th:last-child,.famtable td:last-child{padding-right:0;text-align:right}
.famtable th:first-child,.famtable td:first-child{padding-left:2px}
.c-name{width:auto}
.c-msgs{width:84px}
.c-size{width:92px}
.c-date{width:108px}
td.c-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
td.c-date{color:var(--ink-3);font-size:12.5px}
td.c-msgs{color:var(--ink-2)}
.chip{display:inline-block;font-size:10.5px;font-weight:600;letter-spacing:.03em;padding:1px 6px;
border-radius:4px;background:var(--accent-soft);color:var(--accent);vertical-align:1px;margin-left:5px}
.chip.early{background:var(--done-soft);color:var(--done)}
.tabs{display:flex;gap:4px}
.tab{padding:6px 12px;border-radius:7px;font-size:13px;color:var(--ink-2);text-decoration:none}
.tab:hover{background:var(--panel-2);color:var(--ink)}
.tab.on{background:var(--accent-soft);color:var(--accent);font-weight:600}
.logtable{font-size:13px;table-layout:fixed;min-width:900px}
.logtable td{vertical-align:top;padding-right:14px}
.evts{width:150px;color:var(--ink-3);font-size:12px}
.evname{width:96px;color:var(--ink-2)}
.evfam{width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.evdetail{font-family:"IBM Plex Mono",monospace;font-size:12px;line-height:1.5;word-break:break-word}
.lvl{font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:2px 6px;
border-radius:4px;background:var(--done-soft);color:var(--done)}
.lvl.warn{background:var(--wait-soft);color:var(--wait)}
.lvl.error{background:var(--fail-soft);color:var(--fail)}
tr.ev.err td{background:color-mix(in srgb,var(--fail) 6%,transparent)}
tr.ev.warn td{background:color-mix(in srgb,var(--wait) 6%,transparent)}
label.count{display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.tabn{font-family:"IBM Plex Mono",monospace;font-size:11px;opacity:.65}
.finding{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);
box-shadow:var(--shadow);padding:16px 18px;margin:0 0 12px}
.finding-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px}
.ftitle{font-size:15px;font-weight:600;flex:1;min-width:200px;text-wrap:balance}
.ftype{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;
border-radius:4px;background:var(--accent-soft);color:var(--accent)}
.ftype.project{background:var(--wait-soft);color:var(--wait)}
.ftype.decision{background:color-mix(in srgb,var(--accent) 10%,transparent)}
.ftype.study,.ftype.research{background:var(--done-soft);color:var(--done)}
.ffam{font-size:12px;color:var(--ink-3);margin:0 0 10px}
.fbody{font-family:"IBM Plex Serif",Georgia,serif;font-size:14.5px;line-height:1.65;
color:var(--ink-2);max-width:76ch;margin-top:10px}
.fbody p{margin:0 0 10px}.fbody p:last-child{margin-bottom:0}
.fbody .mdh{font-family:"IBM Plex Sans",sans-serif;font-size:12.5px;font-weight:600;color:var(--ink);margin:14px 0 6px}
.fbody ul,.fbody ol{margin:0 0 10px;padding-left:20px}
.fbody code{font-family:"IBM Plex Mono",monospace;font-size:12.5px;background:var(--panel-2);padding:1.5px 5px;border-radius:4px}
.fbody pre{background:var(--panel-2);border:1px solid var(--line);border-radius:6px;padding:11px 13px;overflow-x:auto;margin:0 0 10px}
.fbody pre code{background:none;padding:0;white-space:pre}
.fbody .mdtw{overflow-x:auto;margin:0 0 10px}
.fbody table{font-family:"IBM Plex Sans",sans-serif;font-size:13px}
.fcite{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--ink-3);margin-top:12px;
padding-top:9px;border-top:1px solid var(--line)}
.oq{margin-top:16px;padding-top:14px;border-top:1px solid var(--line);font-size:13.5px;color:var(--ink-2)}
.oq b{color:var(--ink);font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.oq ul{margin:8px 0 0;padding-left:20px}.oq li{margin-bottom:5px}
/* Finding-type breakdown. Previously a run-on line of bold numbers and words
   with nothing separating them; now chips that share the colour coding used on
   the findings page, so the dashboard and that page read as one system. */
.typerow{margin-top:18px;padding-top:15px;border-top:1px solid var(--line)}
.typerow-l{display:block;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;
color:var(--ink-3);font-weight:600;margin-bottom:10px}
.typechips{display:flex;flex-wrap:wrap;gap:8px}
.typechip{display:inline-flex;align-items:baseline;gap:6px;padding:5px 11px;border-radius:7px;
background:var(--panel-2);border:1px solid var(--line);text-decoration:none;line-height:1.2}
.typechip:hover{border-color:var(--line-2);background:var(--panel)}
.typechip b{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;
font-size:14px;font-weight:600;color:var(--ink)}
.typechip span{font-size:12.5px;color:var(--ink-2)}
.typechip.method    b{color:var(--accent)}
.typechip.reference b{color:var(--accent)}
.typechip.project   b{color:var(--wait)}
.typechip.decision  b{color:var(--wait)}
.typechip.study     b{color:var(--done)}
.typechip.research  b{color:var(--done)}
.typechip.howto     b{color:var(--done)}

/* Domain colours. Deliberately muted — the split matters, not the hue. */
.d-technology{background:#3b82f6}.d-making{background:#b45309}.d-science{background:#0d9488}
.d-body{background:#c2410c}.d-work{background:#7c3aed}.d-people{background:#db2777}
.d-meaning{background:#65a30d}.d-living{background:#0891b2}
.dom{margin:10px 0 4px}
.dombar{display:flex;height:5px;border-radius:3px;overflow:hidden;background:var(--panel-2)}
.dombar i{display:block;height:100%}
.domlabels{display:flex;flex-wrap:wrap;gap:12px;margin-top:7px}
.domlabels a{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2);text-decoration:none}
.domlabels a:hover{color:var(--ink)}
.domlabels b{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--ink-3);font-weight:500}
.dot{width:8px;height:8px;border-radius:2px;display:inline-block;flex:none}
.ftags{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.tag{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;padding:3px 9px;border-radius:20px;
background:var(--panel-2);border:1px solid var(--line);color:var(--ink-2);text-decoration:none}
.tag:hover{border-color:var(--line-2);color:var(--ink)}
.tag.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent);font-weight:600}
.tag b{font-family:"IBM Plex Mono",monospace;font-size:10px;opacity:.6;font-weight:500}
.filterrow{display:flex;gap:12px;align-items:baseline;margin:0 0 14px;flex-wrap:wrap}
.filterlabel{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);
font-weight:600;width:60px;flex:none}
.tagcloud{display:flex;flex-wrap:wrap;gap:6px;flex:1}
.typechip.dm.on{border-color:var(--accent);background:var(--accent-soft)}
.typechip.diagnosis b,.typechip.comparison b{color:var(--wait)}
.ftype.diagnosis{background:var(--fail-soft);color:var(--fail)}
.ftype.comparison{background:var(--wait-soft);color:var(--wait)}

.marker{padding:11px 0;border-bottom:1px solid var(--line)}
.marker:last-of-type{border-bottom:0}
.mnote{font-size:13px;color:var(--ink);display:flex;gap:10px;align-items:baseline}
.mturn{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--ink-3);margin-left:auto;white-space:nowrap}
.mquote{font-family:"IBM Plex Serif",Georgia,serif;font-size:14px;line-height:1.55;color:var(--ink-2);
margin-top:5px;padding-left:12px;border-left:2px solid var(--line-2);max-width:74ch}
tr.fam td:first-child a{text-decoration:none;font-weight:500;color:var(--ink)}
tr.fam td:first-child a:hover{color:var(--accent)}
.era{font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:2px 7px;
border-radius:5px;background:var(--done-soft);color:var(--done)}
.era.primary{background:var(--accent-soft);color:var(--accent)}
.turn{border-top:1px solid var(--line);padding:18px 0 4px;margin-top:14px}
.turn:first-of-type{border-top:0;margin-top:0}
.turn-h{display:flex;align-items:baseline;gap:10px;margin-bottom:9px}
.who{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
.who.user{color:var(--accent)}
.who.assistant{color:var(--ink-3)}
.turn-m{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--ink-3)}
.msg{font-family:"IBM Plex Serif",Georgia,serif;font-size:15px;line-height:1.68;
overflow-wrap:break-word;max-width:74ch}
.msg.user{color:var(--ink)}
.msg.assistant{color:var(--ink-2)}
.msg p{margin:0 0 12px}
.msg p:last-child{margin-bottom:0}
.msg .mdh{font-family:"IBM Plex Sans",sans-serif;font-size:13px;font-weight:600;letter-spacing:.01em;
color:var(--ink);margin:20px 0 8px;text-wrap:balance}
.msg .mdh:first-child{margin-top:0}
.msg ul,.msg ol{margin:0 0 12px;padding-left:22px}
.msg li{margin:0 0 5px}
.msg li:last-child{margin-bottom:0}
.msg blockquote{margin:0 0 12px;padding:2px 0 2px 14px;border-left:2px solid var(--line-2);color:var(--ink-3)}
.msg hr{border:0;border-top:1px solid var(--line);margin:18px 0}
.msg code{font-family:"IBM Plex Mono",monospace;font-size:12.5px;background:var(--panel-2);
padding:1.5px 5px;border-radius:4px}
.msg pre{background:var(--panel-2);border:1px solid var(--line);border-radius:7px;padding:12px 14px;
overflow-x:auto;margin:0 0 12px;max-width:100%}
.msg pre code{background:none;padding:0;font-size:12.5px;line-height:1.5;white-space:pre}
.msg .mdtw{overflow-x:auto;margin:0 0 12px;max-width:100%}
.msg .mdt{font-family:"IBM Plex Sans",sans-serif;font-size:13px;min-width:0;width:auto}
.msg .mdt th{font-size:10.5px;padding:0 16px 7px 0}
.msg .mdt td{padding:7px 16px 7px 0}
.msg a{color:var(--accent)}
.msg strong{font-weight:600;color:var(--ink)}
.branchmark{background:var(--wait-soft);color:var(--wait);padding:9px 14px;border-radius:7px;
font-size:12.5px;font-weight:600;margin:26px 0 6px}
.toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px}
.toolbar .grow{flex:1;min-width:220px}
.count{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--ink-3);white-space:nowrap}
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
  <a href="/families" ${active === 'browse' ? 'aria-current="page"' : ''}>Archive</a>
  <a href="/findings" ${active === 'findings' ? 'aria-current="page"' : ''}>Findings</a>
  <a href="/logs" ${active === 'logs' ? 'aria-current="page"' : ''}>Worker log</a>
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

function runPanel(run) {
  if (!run) return '';
  const w = run.worker || {};
  const byStatus = Object.fromEntries((run.progress || []).map((r) => [r.status, r]));
  const total = (run.progress || []).reduce((a, r) => a + r.n, 0) || 1;
  const doneN = (byStatus.done || {}).n || 0;
  const runN = (byStatus.running || {}).n || 0;
  const failN = (byStatus.failed || {}).n || 0;
  const pct = (x) => (100 * x / total).toFixed(1);

  if (!run.extractorReady) {
    return `<div class="card" style="margin-top:14px"><div class="card-h"><h2>Extraction</h2>
<span class="pill hold">Not configured</span></div><div class="card-b">
<p style="margin:0">The worker has no credential, so it cannot call Claude. Run
<code>claude setup-token</code> on the workstation and set the result as
<code>CLAUDE_CODE_OAUTH_TOKEN</code> in Coolify.</p>
<p class="note">Everything else works without it — the corpus is built and readable.
Extraction is the only stage that needs a Claude credential.</p></div></div>`;
  }
  const st = w.running
    ? (w.pausedUntil ? `<span class="pill hold">Paused — quota</span>` : `<span class="pill ok"><span class="beacon"></span>Extracting</span>`)
    : `<span class="pill idle">Idle</span>`;

  return `<div class="card" style="margin-top:14px" id="runcard">
<div class="card-h"><h2>Extraction</h2><div style="display:flex;gap:9px;align-items:center">${st}
${w.running
  ? `<form method="POST" action="/api/run/stop" style="display:inline">
     <button class="btn ghost sm" type="submit">${w.current ? `Stop after &ldquo;${esc(w.current.slice(0, 28))}${w.current.length > 28 ? '…' : ''}&rdquo;` : 'Stop'}</button></form>`
  : `<form method="POST" action="/api/run/start?limit=5" style="display:inline">
     <button class="btn ghost sm" type="submit">Test 5</button></form>
     <form method="POST" action="/api/run/start" style="display:inline">
     <button class="btn sm" type="submit">Start full run</button></form>`}
<a class="btn ghost sm" href="/logs">Log</a>
</div></div><div class="card-b">
<div class="bigbar">
<i class="s-done" style="width:${pct(doneN)}%"></i>
<i class="s-prop" style="width:${pct(runN)}%"></i>
<i class="s-wait" style="width:${pct(failN)}%"></i>
</div>
<div class="legend">
<span><i class="swatch" style="background:var(--done)"></i>${n(doneN)} done</span>
<span><i class="swatch" style="background:var(--accent)"></i>${n(runN)} running</span>
${failN ? `<span><i class="swatch" style="background:var(--wait)"></i>${n(failN)} failed</span>` : ''}
<span><i class="swatch" style="background:var(--panel-2);border:1px solid var(--line-2)"></i>${n((byStatus.pending || {}).n || 0)} queued</span>
</div>

<div class="grid g3" style="margin-top:16px">
<div><div class="k" style="font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);font-weight:600">Findings</div>
<div class="v" style="font-size:22px;margin-top:4px">${n((run.totals || {}).findings || 0)}</div></div>
<div><div class="k" style="font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);font-weight:600">Markers</div>
<div class="v" style="font-size:22px;margin-top:4px">${n((run.totals || {}).markers || 0)}</div></div>
<div><div class="k" style="font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);font-weight:600">Families read</div>
<div class="v" style="font-size:22px;margin-top:4px">${n((run.totals || {}).extracted || 0)}</div></div>
</div>

${w.current ? `<p class="note"><b>Now reading:</b> ${esc(w.current)}${w.currentFor_s != null ? ` — ${w.currentFor_s}s` : ''}</p>` : ''}
${w.lastError ? `<p class="note warn"><b>Last issue:</b> ${esc(w.lastError)}</p>` : ''}

${(run.recent || []).length ? `<div class="tw" style="margin-top:16px"><table>
<thead><tr><th>Recently read</th><th>Verdict</th><th class="n">Findings</th><th class="n">Markers</th><th class="n">Took</th></tr></thead>
<tbody>${run.recent.map((r) => `<tr><td><a href="/family/${encodeURIComponent(r.family)}" style="color:var(--ink);text-decoration:none">${esc(r.family)}</a></td>
<td>${esc(r.verdict || '')}</td><td class="n">${n(r.n_findings)}</td><td class="n">${n(r.n_markers)}</td>
<td class="n">${r.elapsed_ms ? Math.round(r.elapsed_ms / 1000) + 's' : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}

${(run.findingTypes || []).length ? `<div class="typerow">
<span class="typerow-l">Findings by type</span>
<div class="typechips">${run.findingTypes.map((t) =>
  `<a class="typechip ${esc(t.type)}" href="/findings?type=${encodeURIComponent(t.type)}">
     <b>${n(t.n)}</b><span>${esc(t.type)}</span></a>`).join('')}</div></div>` : ''}

<p class="note">This runs on the server. <b>You can close this window</b> — it keeps going, pauses itself
when the Claude quota window fills, and picks up where it left off. Nothing is written to Outline.</p>
</div></div>`;
}

function dashboard({ imports, stats, user, run }) {
  const latest = imports[0] || null;
  const runningNow = Boolean(run && run.worker && run.worker.running);
  const extracted = (run && run.totals && run.totals.extracted) || 0;
  const cur = latest ? {
    import: `${esc(latest.filename)} · ${mb(latest.bytes)}`, s1: 'done',
    scan: latest.scan_json ? `${JSON.parse(latest.scan_json).conversations} chats` : 'waiting',
    s2: latest.scan_json ? 'done' : (latest.status === 'scanning' ? 'active' : ''),
    norm: stats && stats.families ? `${n(stats.families)} families` : 'waiting',
    s3: stats && stats.families ? 'done' : (latest.status === 'normalising' ? 'active' : ''),
    extract: stats && stats.families
      ? `${n(extracted)} / ${n(stats.families)}`
      : 'waiting',
    s4: !stats || !stats.families ? ''
      : runningNow ? 'active' : (extracted >= stats.families ? 'done' : ''),
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

${runPanel(run)}

${stats && stats.families ? `<div class="grid g2" style="margin-top:14px">
<div class="card"><div class="card-h"><h2>Biggest threads</h2>
<a class="btn ghost sm" href="/families">Browse all ${n(stats.families)}</a></div><div class="card-b">
<div class="tw"><table><tbody>
${(stats.top || []).map((f) => `<tr><td><a href="/family/${encodeURIComponent(f.family)}" style="text-decoration:none;color:var(--ink);font-weight:500">${esc(f.family)}</a>
<div style="font-size:11.5px;color:var(--ink-3);margin-top:2px">${esc(f.first_seen)} → ${esc(f.last_seen)}${f.n_convos > 1 ? ` · ${f.n_convos} chats folded` : ''}</div></td>
<td class="n">${n(f.chars)}</td></tr>`).join('')}
</tbody></table></div>
<p class="note">These are the threads worth reading first — and the ones extraction will spend the most on.</p>
</div></div>

<div class="card"><div class="card-h"><h2>Work queue</h2><span class="count">all pending</span></div><div class="card-b">
<div class="tw"><table><thead><tr><th>Priority</th><th class="n">Families</th><th class="n">Tokens</th></tr></thead><tbody>
${(stats.queueByPriority || []).map((p) => `<tr><td>p${p.priority}</td><td class="n">${n(p.n)}</td><td class="n">${n(p.tokens)}</td></tr>`).join('')}
</tbody></table></div>
${stats.era ? `<div class="tw" style="margin-top:14px"><table><thead><tr><th>Era</th><th class="n">Families</th><th class="n">Tokens</th></tr></thead><tbody>
${stats.era.map((e) => `<tr><td><span class="era ${e.era === 'primary' ? 'primary' : ''}">${esc(e.era)}</span></td><td class="n">${n(e.n)}</td><td class="n">${n(e.tokens)}</td></tr>`).join('')}
</tbody></table></div>` : ''}
</div></div></div>` : ''}

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

${stats && stats.projects && stats.projects.length ? `<div class="card" style="margin-top:14px">
<div class="card-h"><h2>ChatGPT Projects</h2><span class="count">${n(stats.projects.length)} found</span></div><div class="card-b">
<div class="tw"><table><thead><tr><th>Project</th><th class="n">Chats</th><th class="n">Families</th><th class="n">Chars</th><th>Span</th></tr></thead><tbody>
${stats.projects.map((pr) => `<tr>
<td><code style="font-size:11.5px">${esc(pr.project_id)}</code></td>
<td class="n">${n(pr.n_convos)}</td><td class="n">${n(pr.n_families)}</td><td class="n">${n(pr.chars)}</td>
<td style="font-size:11.5px;color:var(--ink-3)">${esc((pr.first_seen || '').slice(0, 10))} → ${esc((pr.last_seen || '').slice(0, 10))}</td>
</tr>`).join('')}
</tbody></table></div>
<p class="note">Groupings you made by hand in ChatGPT, preserved through the export. The export carries the
ID but <b>not the project's name</b>, so these are unlabelled — worth naming by eye. They are ground truth
for the clusterer, and partial by design: plenty of related threads sit outside a project.</p>
</div></div>` : ''}

${latest ? `<div class="card" style="margin-top:14px"><div class="card-h"><h2>Danger zone</h2></div><div class="card-b">
<details><summary style="cursor:pointer;font-size:13.5px;color:var(--ink-2)">Reset or delete this import</summary>
<div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
<form method="POST" action="/api/import/${esc(latest.id)}/reset" style="margin:0"
  onsubmit="return confirm('Clear every finding, marker and extraction for this import and requeue all families?\n\nThe corpus itself is kept.')">
<button class="btn danger sm" type="submit"${runningNow ? ' disabled' : ''}>Reset extractions</button></form>
<span class="sub" style="margin:0">Drops findings, markers and extractions, then requeues every family. Keeps the corpus — use this after changing the prompt.</span>
</div>
<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
<form method="POST" action="/api/import/${esc(latest.id)}/delete" style="margin:0"
  onsubmit="return confirm('Delete import ${esc(latest.id)} entirely?\n\nCorpus, findings, markers, event log and the uploaded file. This cannot be undone.')">
<button class="btn danger sm" type="submit"${runningNow ? ' disabled' : ''}>Delete import</button></form>
<span class="sub" style="margin:0">Removes everything including the uploaded archive. Use this before importing the real export.</span>
</div>
${runningNow ? '<p class="note warn" style="margin-top:12px">Both are disabled while the worker is running. Stop the run first.</p>' : ''}
</details></div></div>` : ''}

<p class="note">${stats && stats.families
    ? `The corpus is built and every family is queued. Extraction runs here and writes
       <a href="/findings">findings</a> to this database — <b>nothing is written to Outline</b>. Staged
       proposals and review are the next stage and are not built yet. The archive is readable meanwhile:
       <a href="/families">browse it</a>.`
    : `Import and scan are free and spend no Claude quota, which is why they come first. Extraction only
       starts when you press Start.`}</p>`;

  const script = (run && run.worker && run.worker.running)
    ? `setInterval(async () => {
         try {
           const r = await fetch('/api/run', {headers:{Accept:'application/json'}});
           if (!r.ok) return;
           const d = await r.json();
           if (!d.worker.running) return location.reload();
           document.title = 'MMRS — ' + (d.totals.extracted||0) + '/' + ${JSON.stringify(
             (run.progress || []).reduce((a, r2) => a + r2.n, 0))};
           location.reload();
         } catch {}
       }, 20000);`
    : null;
  return shell('MMRS Console', frame('dash', cur, body), script ? { script } : {});
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
  // Fallbacks so imports scanned by an older build still render correctly.
  const corpusChars = scan.corpusChars != null ? scan.corpusChars
    : (scan.totalChars - (scan.redundantChars || 0));
  const corpusTokens = scan.corpusTokens != null ? scan.corpusTokens : Math.floor(corpusChars / 4);
  const stored = scan.storedMessages != null ? scan.storedMessages : null;
  const months = Object.entries(scan.monthsDense || scan.months || {}).filter(([k]) => k !== 'unknown');
  const maxC = Math.max(1, ...months.map(([, v]) => v.convos));
  const bars = months.map(([k, v]) =>
    `<i class="${k >= '2025-05' ? 'hot' : ''}" style="height:${Math.max(2, v.convos / maxC * 100).toFixed(0)}%" title="${esc(k)}: ${v.convos} chats"></i>`).join('');

  const ready = rec.status === 'ready';
  const body = `<div class="topbar">
<div><h1>Scan result</h1><p class="sub">${esc(rec.filename)} · ${mb(rec.bytes)} · nothing charged</p></div>
<div class="spacer"></div>${statPill(rec.status)}
<form method="POST" action="/api/import/${esc(rec.id)}/scan" style="display:inline">
<button class="btn ghost sm" type="submit" title="Re-runs the scan against the already-extracted files. Free, about two seconds.">Re-scan</button></form>
${!ready ? `<form method="POST" action="/api/import/${esc(rec.id)}/proceed" style="display:inline">
<button class="btn" type="submit">Proceed — build the corpus</button></form>` : `<a class="btn ghost sm" href="/">Dashboard</a>`}
</div>

<div class="grid g4">
<div class="card stat"><div class="k">Conversations</div><div class="v">${n(scan.conversations)}</div><div class="d">${esc(scan.firstDate)} → ${esc(scan.lastDate)}</div></div>
<div class="card stat"><div class="k">After dedup</div><div class="v">${n(scan.families)}</div><div class="d">${n(scan.conversations - scan.families)} branch copies folded in</div></div>
<div class="card stat"><div class="k">Messages</div><div class="v">${n(stored != null ? stored : scan.distinctMessageIds)}</div><div class="d">${stored != null ? `${n(scan.emptyMessages)} empty dropped · ` : ''}${n(scan.nodesAll - scan.nodesMain)} dead nodes skipped</div></div>
<div class="card stat"><div class="k">Corpus</div><div class="v">${(corpusTokens / 1e6).toFixed(2)}<span style="font-size:15px">M</span></div><div class="d">tokens to process · ${(scan.estTokens / 1e6).toFixed(2)}M before dedup</div></div>
</div>

<div class="grid g2" style="margin-top:14px">
<div class="card"><div class="card-h"><h2>When you used it</h2><span class="conf" style="font-size:11.5px;color:var(--ink-3)">by month</span></div>
<div class="card-b"><div class="hist">${bars}</div>
<div class="hist-x"><span>${esc(months[0] ? months[0][0] : '')}</span><span>${esc(months[months.length - 1] ? months[months.length - 1][0] : '')}</span></div>
<p class="note">Highlighted bars are from <b>${esc(require('./ingest').ERA_BOUNDARY)}</b> onward — the era treated as primary evidence.
Everything before it is sparse enough to read as background rather than signal.
Months with no conversations are drawn as gaps rather than skipped, so quiet periods look quiet.</p></div></div>

<div class="card"><div class="card-h"><h2>Composition</h2></div><div class="card-b"><div class="tw"><table>
<tbody>
<tr><td>User wrote</td><td class="n">${n(scan.userChars)} chars</td></tr>
<tr><td>Assistant wrote</td><td class="n">${n(scan.asstChars)} chars</td></tr>
<tr><td>Duplicated across branches</td><td class="n">−${n(scan.redundantChars)} chars</td></tr>
<tr><td><b>Corpus after dedup</b></td><td class="n"><b>${n(corpusChars)} chars</b></td></tr>
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
<tr><td><b>${scan.redundantPct}% of text is duplicated</b></td><td>Branch copies, folded on message ID — ${n(scan.estTokens)} tokens in the file becomes ${n(corpusTokens)} to process.</td></tr>
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

function familiesPage({ importId, families, stats }) {
  // Era is dropped as a column: it is derived from the start date and 529 of
  // 667 rows say "primary", so a full column of it repeats what the date
  // already shows. It is marked only on the minority it distinguishes.
  const rows = families.map((f) => `<tr class="fam" data-name="${esc(f.family.toLowerCase())}"
 data-chars="${f.chars}" data-msgs="${f.n_messages}" data-date="${esc(f.first_seen || '')}" data-convos="${f.n_convos}">
<td class="c-name"><a href="/family/${encodeURIComponent(f.family)}">${esc(f.family)}</a>${
  f.n_convos > 1 ? ` <span class="chip" title="Folded from ${f.n_convos} separate chats">${f.n_convos} parts</span>` : ''}${
  f.era === 'baseline' ? ' <span class="chip early" title="Before the dense period from 2025-05">early</span>' : ''}</td>
<td class="n c-msgs">${n(f.n_messages)}</td>
<td class="n c-size" title="${n(f.chars)} characters">${compact(f.chars)}</td>
<td class="n c-date">${esc(f.first_seen || '')}</td>
</tr>`).join('');

  const body = `<div class="topbar">
<div><h1>Your archive</h1><p class="sub">${n(families.length)} families · ${n(stats.messages)} messages · ${(stats.tokens / 1e6).toFixed(2)}M tokens · ${esc(stats.first)} → ${esc(stats.last)}</p></div>
<div class="spacer"></div><a class="btn ghost sm" href="/">Dashboard</a></div>

<div class="toolbar">
<div class="grow"><input type="search" id="q" placeholder="Filter — try &quot;volvo&quot;, &quot;subwoofer&quot;, &quot;proverbs&quot;…" autocomplete="off"></div>
<span class="count" id="count">${n(families.length)} shown</span></div>

<div class="card"><div class="card-b tw"><table id="fam" class="famtable">
<thead><tr>
<th class="sortable c-name" data-k="name">Conversation</th>
<th class="n sortable c-msgs" data-k="msgs">Msgs</th>
<th class="n sortable c-size" data-k="chars" data-dir="desc">Size</th>
<th class="n sortable c-date" data-k="date">Started</th>
</tr></thead><tbody>${rows}</tbody></table></div></div>

<p class="note"><b>Parts</b> means ChatGPT split this across that many separate chats — you branched it,
and it has been folded back into one thread. <b>Early</b> marks the sparse period before
${esc(require('./ingest').ERA_BOUNDARY)}; everything unmarked is from the dense era.
Sizes are rounded — hover for the exact count.</p>`;

  const script = `
const q=document.getElementById('q'),tb=document.querySelector('#fam tbody'),cnt=document.getElementById('count');
const all=[...tb.querySelectorAll('tr')];
function filter(){
  const v=q.value.trim().toLowerCase();let n=0;
  for(const r of all){const hit=!v||r.dataset.name.includes(v);r.style.display=hit?'':'none';if(hit)n++}
  cnt.textContent=n.toLocaleString('en-GB')+' shown';
}
q.addEventListener('input',filter);
document.querySelectorAll('th.sortable').forEach(th=>th.addEventListener('click',()=>{
  const k=th.dataset.k,cur=th.dataset.dir;const dir=cur==='desc'?'asc':'desc';
  document.querySelectorAll('th.sortable').forEach(o=>o.removeAttribute('data-dir'));
  th.dataset.dir=dir;
  const num=k!=='name'&&k!=='date';
  all.sort((a,b)=>{
    let x=a.dataset[k],y=b.dataset[k];
    if(num){x=+x;y=+y}
    const c=num?x-y:String(x).localeCompare(String(y));
    return dir==='desc'?-c:c;
  });
  all.forEach(r=>tb.appendChild(r));
}));`;
  return shell('MMRS — Your archive', frame('browse', {}, body), { script });
}

function familyPage({ family, detail, conversations, messages, extraction, findings = [], markers = [] }) {
  // Message text is markdown, rendered by src/md.js — escaped first, so the
  // output can only contain tags that renderer emits.
  const byConv = new Map();
  let out = '', shown = 0, branchIdx = 0;
  const convStarts = new Map();
  for (const c of conversations) convStarts.set(c.id, c);

  for (const m of messages) {
    shown++;
    out += `<div class="turn"><div class="turn-h">
<span class="who ${esc(m.role)}">${esc(m.role)}</span>
<span class="turn-m">${esc((m.created || '').slice(0, 10))} · ${n(m.chars)} chars${m.model ? ' · ' + esc(m.model) : ''}</span>
</div><div class="msg ${esc(m.role)}">${md.render(m.text)}</div></div>`;
  }

  const body = `<div class="topbar">
<div><h1>${esc(family)}</h1><p class="sub">${n(detail.n_messages)} messages · ${n(detail.chars)} chars · ${esc(detail.first_seen)} → ${esc(detail.last_seen)}${detail.n_convos > 1 ? ` · folded from ${detail.n_convos} chats` : ''}</p></div>
<div class="spacer"></div><a class="btn ghost sm" href="/families">Back to archive</a></div>

${extraction ? `<div class="card" style="margin-bottom:16px"><div class="card-h"><h2>What was extracted</h2>
<span class="count">${esc(extraction.verdict || '')} · ${n(findings.length)} findings · ${n(markers.length)} markers${
  extraction.elapsed_ms ? ` · ${Math.round(extraction.elapsed_ms / 1000)}s` : ''}</span></div>
<div class="card-b">
${extraction.summary ? `<p style="margin:0 0 16px;font-family:'IBM Plex Serif',Georgia,serif;font-size:15px;line-height:1.6">${esc(extraction.summary)}</p>` : ''}
${findings.length ? findings.map((f) => findingCard(f)).join('') : '<p class="sub" style="margin:0">No durable findings — the honest read for many threads.</p>'}
${(() => { try { const oq = JSON.parse(extraction.open_questions || '[]');
  return oq.length ? `<div class="oq"><b>Left unresolved</b><ul>${oq.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''; }
  catch { return ''; } })()}
</div></div>
${markersBlock(markers)}` : ''}

${detail.n_convos > 1 ? `<div class="card" style="margin-bottom:16px"><div class="card-h"><h2>Folded from ${detail.n_convos} chats</h2>
<span class="count">${detail.redundancy_pct}% was duplicate</span></div><div class="card-b"><div class="tw"><table>
<thead><tr><th>Chat</th><th class="n">Started</th><th class="n">Messages</th><th class="n">Chars</th></tr></thead><tbody>
${conversations.map((c) => `<tr><td>${esc(c.title || '(untitled)')}</td><td class="n">${esc((c.created || '').slice(0, 10))}</td><td class="n">${n(c.n_messages)}</td><td class="n">${n(c.chars)}</td></tr>`).join('')}
</tbody></table></div>
<p class="note">These overlapped heavily. Only genuinely new messages are shown below, in date order —
nothing is repeated, and nothing is lost.</p></div></div>` : ''}

<div class="card"><div class="card-b">${out}</div></div>`;

  return shell(`MMRS — ${family}`, frame('browse', {}, body));
}

const LEVEL_CLS = { info: '', warn: 'warn', error: 'err' };

function logsPage({ events, counts, worker, level, importId }) {
  const rows = events.map((e) => `<tr class="ev ${LEVEL_CLS[e.level] || ''}">
<td class="n evts">${esc(e.ts.replace('T', ' ').replace('Z', ''))}</td>
<td><span class="lvl ${esc(e.level)}">${esc(e.level)}</span></td>
<td class="evname">${esc(e.event)}</td>
<td class="evfam">${e.family ? `<a href="/family/${encodeURIComponent(e.family)}">${esc(e.family)}</a>` : ''}</td>
<td class="evdetail">${esc(e.detail || '')}</td>
<td class="n">${e.ms == null ? '' : Math.round(e.ms / 1000) + 's'}</td>
</tr>`).join('');

  const c = Object.fromEntries((counts || []).map((x) => [x.level, x.n]));
  const tab = (k, label) => `<a class="tab ${level === k ? 'on' : ''}" href="/logs?level=${k}">${label}</a>`;

  const body = `<div class="topbar">
<div><h1>Worker log</h1><p class="sub">Everything the extractor has done, newest first. Survives restarts.</p></div>
<div class="spacer"></div>
${worker.running ? `<span class="pill ok"><span class="beacon"></span>${worker.pausedUntil ? 'Paused' : 'Running'}</span>`
  : '<span class="pill idle">Idle</span>'}
<a class="btn ghost sm" href="/">Dashboard</a></div>

<div class="toolbar">
  <div class="tabs">${tab('all', `All ${n((c.info || 0) + (c.warn || 0) + (c.error || 0))}`)}
  ${tab('problems', `Problems ${n((c.warn || 0) + (c.error || 0))}`)}
  ${tab('error', `Errors ${n(c.error || 0)}`)}</div>
  <span class="spacer"></span>
  <label class="count"><input type="checkbox" id="auto" ${worker.running ? 'checked' : ''}> auto-refresh</label>
</div>

${worker.current ? `<p class="note"><b>Now reading:</b> ${esc(worker.current)}${
  worker.currentFor_s != null ? ` — ${worker.currentFor_s}s so far` : ''}</p>` : ''}
${worker.limit ? `<p class="note">Test run: stopping after <b>${worker.limit}</b> families. ${worker.done} done.</p>` : ''}

<div class="card"><div class="card-b tw"><table class="logtable">
<thead><tr><th>Time</th><th>Level</th><th>Event</th><th>Family</th><th>Detail</th><th class="n">Took</th></tr></thead>
<tbody>${rows || '<tr><td colspan="6" style="color:var(--ink-3)">Nothing logged yet.</td></tr>'}</tbody>
</table></div></div>`;

  const script = `
const cb=document.getElementById('auto');
let t=null;
function arm(){ if(cb.checked){ t=setTimeout(()=>location.reload(), 10000); } else if(t){ clearTimeout(t); t=null; } }
cb.addEventListener('change',arm); arm();`;
  return shell('MMRS — Worker log', frame('logs', {}, body), { script });
}

const jparse = (s2, fallback) => { try { return JSON.parse(s2 || ''); } catch { return fallback; } };

const DOMAIN_LABEL = {
  technology: 'Technology & Systems', making: 'Making & Repair', science: 'Science & Nature',
  body: 'Body & Mind', work: 'Work & Money', people: 'People & Self',
  meaning: 'Meaning & Culture', living: 'Living & Leisure',
};

// The proportional split rendered as a bar, so a 55/45 reads as genuinely
// split rather than as a label with a number stuck to it.
function domainBar(doms) {
  if (!doms.length) return '';
  return `<div class="dom">
<div class="dombar">${doms.map((d) => `<i class="d-${esc(d.domain)}" style="width:${d.pct}%"
 title="${esc(DOMAIN_LABEL[d.domain] || d.domain)} ${d.pct}%"></i>`).join('')}</div>
<div class="domlabels">${doms.map((d) => `<a href="/findings?domain=${esc(d.domain)}"><i class="dot d-${esc(d.domain)}"></i>${
  esc(DOMAIN_LABEL[d.domain] || d.domain)}${doms.length > 1 ? ` <b>${d.pct}%</b>` : ''}</a>`).join('')}</div></div>`;
}

function findingCard(f, opts = {}) {
  const cites = jparse(f.citations, []) || [];
  const doms = jparse(f.domains, []) || [];
  const tags = jparse(f.tags, []) || [];
  return `<div class="finding">
<div class="finding-h">
  <span class="ftype ${esc(f.type)}">${esc(f.type)}</span>
  <span class="ftitle">${esc(f.title)}</span>
  <span class="conf" title="model's own confidence">${f.confidence == null ? '' : Number(f.confidence).toFixed(2)}</span>
</div>
${opts.showFamily ? `<div class="ffam">from <a href="/family/${encodeURIComponent(f.family)}">${esc(f.family)}</a></div>` : ''}
${domainBar(doms)}
<div class="fbody">${md.render(f.body)}</div>
${tags.length ? `<div class="ftags">${tags.map((t) =>
  `<a class="tag" href="/findings?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>` : ''}
${cites.length ? `<div class="fcite">turns ${cites.map((c) => esc(String(c))).join(', ')}</div>` : ''}
</div>`;
}

function findingsPage({ findings, counts, type, domain, tag, domains = [], tags = [], verdicts, totals }) {
  const tab = (k, label, n2) => `<a class="tab ${type === k ? 'on' : ''}" href="/findings?type=${k}">${label}${
    n2 == null ? '' : ` <span class="tabn">${n(n2)}</span>`}</a>`;
  const byType = Object.fromEntries((counts || []).map((c) => [c.type, c.n]));
  const order = ['method', 'reference', 'project', 'study', 'decision', 'research', 'diagnosis', 'comparison', 'howto'];

  const body = `<div class="topbar">
<div><h1>What it found</h1><p class="sub">${n(totals.findings)} findings and ${n(totals.markers)} markers
from ${n(totals.extracted)} conversations read${verdicts.length ? ' · ' + verdicts.map((v) => `${n(v.n)} ${esc(v.verdict)}`).join(', ') : ''}</p></div>
<div class="spacer"></div><a class="btn ghost sm" href="/">Dashboard</a></div>

<div class="toolbar"><div class="tabs">${tab('all', 'All', totals.findings)}${
  order.filter((t) => byType[t]).map((t) => tab(t, t, byType[t])).join('')}</div></div>

${domains.length ? `<div class="filterrow"><span class="filterlabel">Domain</span>
<div class="typechips">${domains.map((d) => `<a class="typechip dm ${domain === d.domain ? 'on' : ''}"
 href="/findings?domain=${esc(d.domain)}"><i class="dot d-${esc(d.domain)}"></i><b>${n(d.n)}</b><span>${
  esc(DOMAIN_LABEL[d.domain] || d.domain)}</span></a>`).join('')}</div></div>` : ''}

${tags.length ? `<div class="filterrow"><span class="filterlabel">Tags</span>
<div class="tagcloud">${tags.map((t) => `<a class="tag ${tag === t.tag ? 'on' : ''}"
 href="/findings?tag=${encodeURIComponent(t.tag)}">${esc(t.tag)}<b>${n(t.n)}</b></a>`).join('')}</div></div>` : ''}

${domain || tag ? `<p class="note">Filtered by ${domain ? `domain <b>${esc(DOMAIN_LABEL[domain] || domain)}</b>` : ''}${
  tag ? `tag <b>${esc(tag)}</b>` : ''} — <a href="/findings">clear</a></p>` : ''}

${findings.length ? findings.map((f) => findingCard(f, { showFamily: true })).join('')
  : `<div class="card"><div class="card-b"><p style="margin:0;color:var(--ink-3)">Nothing extracted yet.
Start a run from the dashboard — <b>Test 5</b> reads five conversations and stops.</p></div></div>`}

<p class="note">These are drafts. <b>Nothing here has been written to Outline</b> — proposing and approving
is a later stage that does not exist yet. Confidence is the model's own, and is worth distrusting
independently.</p>`;
  return shell('MMRS — What it found', frame('findings', {}, body));
}

function markersBlock(markers) {
  if (!markers.length) return '';
  return `<div class="card" style="margin-bottom:16px"><div class="card-h"><h2>Markers</h2>
<span class="count">${n(markers.length)} · for the later portrait pass, not published</span></div>
<div class="card-b">
${markers.map((m) => `<div class="marker">
<div class="mnote">${esc(m.note || '')}<span class="mturn">turn ${m.turn == null ? '?' : m.turn}</span></div>
<div class="mquote">${esc(m.quote)}</div></div>`).join('')}
<p class="note">Observations, deliberately not conclusions. A pattern only exists across the whole archive,
so nothing here claims anything on its own.</p>
</div></div>`;
}

function notFound() {
  return shell('MMRS — not found', frame('dash', {}, `<div class="topbar"><div><h1>Nothing here</h1>
<p class="sub">That path does not exist.</p></div></div>
<div class="card"><div class="card-b"><a href="/">Back to the dashboard</a></div></div>`));
}

module.exports = { shell, esc, dashboard, importPage, scanPage, signin, unconfigured, notFound, familiesPage, familyPage, logsPage, findingsPage };
