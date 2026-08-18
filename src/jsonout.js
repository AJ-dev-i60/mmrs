'use strict';

// Recover a JSON object from a model response.
//
// The naive approach — regex out a ``` fence, then slice first-brace to
// last-brace — breaks on any response whose *content* contains a code fence or
// a ${...} expression, because those live inside JSON string values. That is
// not a rare edge: it is every finding about docker-compose, shell, YAML or
// templating. Order matters here: try the honest parse first, and only fall
// back to structural recovery.

function stripWrappingFence(t) {
  // Only a fence that wraps the WHOLE response, anchored at both ends.
  const m = t.match(/^```(?:json|JSON)?\s*\n([\s\S]*?)\n?```$/);
  return m ? m[1].trim() : t;
}

// Extract the balanced object starting at `start`, tracking string state so
// braces and backticks inside string values are ignored.
function balancedFrom(t, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return t.slice(start, i + 1); }
  }
  return null;
}

// Every balanced object in the text, outermost-first at each position. Prose
// can contain braces — "note the {shape} of it" — so the first one is not
// necessarily the payload.
function candidates(t) {
  const out = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{') continue;
    const obj = balancedFrom(t, i);
    if (obj) { out.push(obj); i += obj.length - 1; }
  }
  return out;
}

const firstBalancedObject = (t) => { const i = t.indexOf('{'); return i < 0 ? null : balancedFrom(t, i); };

function parse(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) throw new Error('empty model output');

  // 1. The model obeyed and returned bare JSON.
  try { return JSON.parse(raw); } catch {}

  // 2. The whole response is wrapped in one fence.
  const unfenced = stripWrappingFence(raw);
  if (unfenced !== raw) {
    try { return JSON.parse(unfenced); } catch {}
  }

  // 3. There is prose around it. Try every balanced object and prefer one that
  //    looks like our schema, so a stray `{shape}` in the prose cannot win.
  const parsed = [];
  for (const c of candidates(unfenced)) {
    try { parsed.push(JSON.parse(c)); } catch {}
  }
  const shaped = parsed.find((o) => o && typeof o === 'object'
    && ('findings' in o || 'verdict' in o || 'markers' in o));
  if (shaped) return shaped;
  if (parsed.length) return parsed[0];
  throw new Error('no parseable JSON object in model output');
}

module.exports = { parse, firstBalancedObject, candidates, stripWrappingFence };
