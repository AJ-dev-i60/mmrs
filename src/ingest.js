'use strict';

// Parsing for ChatGPT sharded data exports.
//
// Ported from the Python reference in ~/projects/archivist/ingest/. Two rules
// are load-bearing (Outline: PR · Archivist, Decisions D2/D3):
//   D3 - a conversation is a graph. Walk current_node up the parent chain.
//   D2 - branches share message IDs. Dedup on ID, never by keeping the largest.

const fs = require('fs');
const path = require('path');

const BRANCH_RE = /^(Branch · )+/;
const ERA_BOUNDARY = '2025-05';        // D5: the real corpus starts here

// Python's len() counts code points; JS .length counts UTF-16 units, so an
// emoji outside the BMP would count as 2. Match Python so the port can be
// verified against the reference numbers exactly.
function charLen(s) {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

function findShards(root) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(root, { recursive: true, withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (/^conversations(-\d+)?\.json$/.test(e.name)) {
      out.push(path.join(e.parentPath || e.path, e.name));
    }
  }
  return out.sort();
}

function load(root) {
  const shards = findShards(root);
  if (!shards.length) throw new Error(`no conversation shards under ${root}`);
  const convos = [];
  for (const s of shards) {
    const data = JSON.parse(fs.readFileSync(s, 'utf8'));
    if (Array.isArray(data)) convos.push(...data);
    else convos.push(data);
  }
  return { convos, shards };
}

function flatten(msg) {
  if (!msg) return { text: '', contentType: null };
  const c = msg.content || {};
  const ct = c.content_type || null;
  const parts = c.parts;
  const out = [];
  if (Array.isArray(parts) && parts.length) {
    for (const p of parts) {
      if (typeof p === 'string') out.push(p);
      else if (p && typeof p === 'object') out.push(`[${p.content_type || 'asset'}]`);
    }
  } else if (c.text) {
    out.push(c.text);
  } else if (c.result) {
    out.push(String(c.result));
  }
  return { text: out.join('\n'), contentType: ct };
}

// The conversation as actually experienced, oldest first. Iterating
// mapping.values() instead would pull in abandoned regenerations.
function mainline(conv) {
  const mp = conv.mapping || {};
  let node = conv.current_node;
  const chain = [];
  const seen = new Set();
  while (node && mp[node] && !seen.has(node)) {
    seen.add(node);
    const n = mp[node];
    if (n.message) chain.push(n.message);
    node = n.parent;
  }
  return chain.reverse();
}

const familyOf = (title) => (String(title || '').trim().replace(BRANCH_RE, '').trim()) || '(untitled)';
const isBranch = (title) => BRANCH_RE.test(String(title || '').trim());

// Some message timestamps in the export are milliseconds, not seconds.
function ts(epoch) {
  if (!epoch) return null;
  let e = Number(epoch);
  if (!Number.isFinite(e)) return null;
  if (e > 1e11) e /= 1000;
  const d = new Date(e * 1000);
  if (Number.isNaN(d.getTime()) || d.getFullYear() > 9999 || d.getFullYear() < 1) return null;
  return d.toISOString().slice(0, 19) + 'Z';
}
const day = (epoch) => { const t = ts(epoch); return t ? t.slice(0, 10) : null; };
const era = (isoDate) => !isoDate ? 'unknown' : (isoDate.slice(0, 7) < ERA_BOUNDARY ? 'baseline' : 'primary');

const roleOf = (m) => (m.author && m.author.role) || 'unknown';
const modelOf = (m) => (m.metadata && m.metadata.model_slug) || null;
const isHidden = (m) => Boolean(m.metadata && m.metadata.is_visually_hidden_from_conversation);

/**
 * Survey pass — read-only, no LLM calls, nothing written.
 * This is the "free" stage the operator sees before approving anything.
 */
function survey(root) {
  const { convos, shards } = load(root);

  let nodesAll = 0, nodesMain = 0, hidden = 0, emptyMessages = 0;
  let userChars = 0, asstChars = 0;
  const roles = new Map(), contentTypes = new Map(), models = new Map();
  const months = new Map();
  const perConvo = [];
  const idsSeen = new Set();
  let dupChars = 0;

  for (const conv of convos) {
    const mp = conv.mapping || {};
    for (const k of Object.keys(mp)) if (mp[k].message) nodesAll++;

    const msgs = mainline(conv);
    nodesMain += msgs.length;
    let u = 0, a = 0;

    for (const m of msgs) {
      if (isHidden(m)) { hidden++; continue; }
      const { text, contentType } = flatten(m);
      const len = charLen(text);
      const role = roleOf(m);
      roles.set(role, (roles.get(role) || 0) + 1);
      if (contentType) contentTypes.set(contentType, (contentTypes.get(contentType) || 0) + 1);
      if (role === 'user') u += len;
      else if (role === 'assistant') {
        a += len;
        const ml = modelOf(m);
        if (ml) models.set(ml, (models.get(ml) || 0) + 1);
      }
      if (idsSeen.has(m.id)) { dupChars += len; } else {
        idsSeen.add(m.id);
        if (!text.trim()) emptyMessages++;   // stripped 'thoughts'/'reasoning_recap'
      }
    }

    userChars += u; asstChars += a;
    const created = day(conv.create_time);
    const key = created ? created.slice(0, 7) : 'unknown';
    const mo = months.get(key) || { convos: 0, chars: 0 };
    mo.convos++; mo.chars += u + a;
    months.set(key, mo);

    perConvo.push({
      id: conv.conversation_id, title: String(conv.title || '').trim(),
      family: familyOf(conv.title), isBranch: isBranch(conv.title),
      created, msgs: msgs.length, chars: u + a,
    });
  }

  const families = new Map();
  for (const c of perConvo) {
    const f = families.get(c.family) || { convos: 0, chars: 0 };
    f.convos++; f.chars += c.chars;
    families.set(c.family, f);
  }

  const sizes = perConvo.map((c) => c.chars).sort((x, y) => x - y);
  const pct = (p) => sizes.length ? sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * p / 100))] : 0;
  const totalChars = userChars + asstChars;
  const rich = perConvo.filter((c) => c.chars >= 10000);
  const dates = perConvo.map((c) => c.created).filter(Boolean).sort();

  return {
    shards: shards.length,
    conversations: convos.length,
    families: families.size,
    nodesAll, nodesMain, hidden,
    distinctMessageIds: idsSeen.size,
    userChars, asstChars, totalChars,
    estTokens: Math.floor(totalChars / 4),
    // What actually gets processed, after folding branch duplicates. This is
    // the figure the operator needs; totalChars/estTokens are the raw file.
    corpusChars: totalChars - dupChars,
    corpusTokens: Math.floor((totalChars - dupChars) / 4),
    emptyMessages,
    storedMessages: idsSeen.size - emptyMessages,
    redundantChars: dupChars,
    redundantPct: totalChars ? +(100 * dupChars / totalChars).toFixed(1) : 0,
    firstDate: dates[0] || null,
    lastDate: dates[dates.length - 1] || null,
    percentiles: { p10: pct(10), p25: pct(25), p50: pct(50), p75: pct(75), p90: pct(90), p95: pct(95), p99: pct(99) },
    richCount: rich.length,
    richShare: totalChars ? +(100 * rich.reduce((s, c) => s + c.chars, 0) / totalChars).toFixed(1) : 0,
    branchFamilies: [...families.values()].filter((f) => f.convos > 1).length,
    roles: Object.fromEntries(roles),
    contentTypes: Object.fromEntries([...contentTypes].sort((a, b) => b[1] - a[1])),
    models: Object.fromEntries([...models].sort((a, b) => b[1] - a[1])),
    months: Object.fromEntries([...months].sort()),
    // Every calendar month between first and last, so quiet periods render as
    // gaps rather than being silently dropped — omitting them understates
    // exactly the sparseness the chart exists to show.
    monthsDense: denseMonths(months, dates[0], dates[dates.length - 1]),
  };
}

function denseMonths(months, firstDate, lastDate) {
  if (!firstDate || !lastDate) return {};
  const out = {};
  const d = new Date(firstDate.slice(0, 7) + '-01T00:00:00Z');
  const end = new Date(lastDate.slice(0, 7) + '-01T00:00:00Z');
  while (d <= end) {
    const k = d.toISOString().slice(0, 7);
    out[k] = months.get(k) || { convos: 0, chars: 0 };
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

module.exports = {
  charLen, findShards, load, flatten, mainline, denseMonths,
  familyOf, isBranch, ts, day, era, roleOf, modelOf, isHidden, survey,
  ERA_BOUNDARY,
};
