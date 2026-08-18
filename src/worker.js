'use strict';

// The extraction worker. Runs inside the web container as an async loop, so
// there is one app, one volume, and no shared-volume problem on Coolify.
// It is subprocess- and I/O-bound, so it does not block the event loop.
//
// Quota, not money, is the scarce resource (Outline: PR · Archivist, O2). On
// hitting a limit the family goes back to 'pending' and the loop sleeps —
// nothing is lost and nothing is charged. A run may span days.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const db = require('./db');
const { renderFamily } = require('./render');

const PROMPT_PATH = path.join(__dirname, '..', 'prompts', 'extract.md');
const MODEL = process.env.MMRS_MODEL || 'opus';
const CALL_TIMEOUT_MS = Number(process.env.MMRS_CALL_TIMEOUT_MS) || 10 * 60 * 1000;
const IDLE_MS = 5000;
const QUOTA_BACKOFF_MS = Number(process.env.MMRS_QUOTA_BACKOFF_MS) || 15 * 60 * 1000;

const QUOTA_RE = /rate.?limit|usage limit|quota|too many requests|429|overloaded|capacity/i;

let state = {
  running: false,
  stopping: false,
  current: null,
  since: null,
  lastError: null,
  pausedUntil: null,
  done: 0,
  failed: 0,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function callClaude(input) {
  return new Promise((resolve, reject) => {
    const prompt = fs.readFileSync(PROMPT_PATH, 'utf8');
    const p = spawn('claude', ['-p', prompt, '--model', MODEL, '--output-format', 'json'],
      { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('call timed out')); }, CALL_TIMEOUT_MS);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${err.slice(0, 300)}`));
      resolve(out);
    });
    p.stdin.end(input);
  });
}

const { parse: parseResult } = require('./jsonout');

async function extractOne(importId, family) {
  const detail = db.familyDetail(importId, family);
  if (!detail) throw new Error('family vanished');
  const text = renderFamily({
    family, detail,
    conversations: db.familyConversations(importId, family),
    messages: db.familyMessages(importId, family),
  });

  const t0 = Date.now();
  let env, result, lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    env = JSON.parse(await callClaude(text));
    try { result = parseResult(env.result); break; }
    catch (e) {
      lastErr = e;
      try {
        const dir = path.join(db.DATA_DIR, 'failed');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${family.replace(/\W+/g, '-')}-try${attempt}.txt`), env.result || '');
      } catch {}
      if (attempt === 2) throw new Error(`unparseable output: ${e.message}`);
    }
  }
  db.saveExtraction(importId, family, result, {
    model: MODEL, elapsed_ms: Date.now() - t0, usage: env.usage,
  });
  return { findings: (result.findings || []).length, markers: (result.markers || []).length, verdict: result.verdict };
}

async function loop(importId) {
  while (state.running && !state.stopping) {
    if (state.pausedUntil && Date.now() < state.pausedUntil) { await sleep(5000); continue; }
    state.pausedUntil = null;

    let family;
    try { family = db.claimNext(importId); }
    catch (e) { state.lastError = `claim failed: ${e.message}`; await sleep(IDLE_MS); continue; }

    if (!family) {
      db.stopRun(importId, 'queue drained');
      state.running = false; state.current = null;
      console.log('[worker] queue drained — stopping');
      break;
    }

    state.current = family; state.since = Date.now();
    try {
      const r = await extractOne(importId, family);
      state.done++; state.lastError = null;
      console.log(`[worker] ${family} — ${r.verdict}, ${r.findings} findings, ${r.markers} markers`);
    } catch (e) {
      const msg = String(e.message || e);
      if (QUOTA_RE.test(msg)) {
        // Not a failure. Put it back and wait for the window to refill.
        db.releaseFamily(importId, family, `quota: ${msg}`);
        state.pausedUntil = Date.now() + QUOTA_BACKOFF_MS;
        state.lastError = `quota reached — paused until ${new Date(state.pausedUntil).toISOString().slice(11, 16)}Z`;
        console.warn(`[worker] quota reached, pausing ${QUOTA_BACKOFF_MS / 60000}m`);
      } else {
        db.failFamily(importId, family, msg);
        state.failed++; state.lastError = `${family}: ${msg}`;
        console.error(`[worker] ${family} failed — ${msg}`);
      }
    }
    state.current = null;
  }
  state.running = false; state.stopping = false; state.current = null;
}

function start(importId) {
  if (state.running) return { ok: false, error: 'already running' };
  const released = db.releaseStale(importId);
  db.startRun(importId);
  state = { ...state, running: true, stopping: false, lastError: null, pausedUntil: null, done: 0, failed: 0 };
  console.log(`[worker] started on ${importId}${released ? ` (released ${released} stale)` : ''}`);
  loop(importId).catch((e) => {
    state.running = false;
    state.lastError = `loop crashed: ${e.message}`;
    db.stopRun(importId, `crashed: ${e.message}`);
    console.error('[worker] loop crashed', e);
  });
  return { ok: true, released };
}

function stop(importId) {
  if (!state.running) return { ok: false, error: 'not running' };
  state.stopping = true;
  db.stopRun(importId, 'stopped by operator');
  console.log('[worker] stop requested — will finish the family in flight');
  return { ok: true };
}

const status = () => ({
  ...state,
  model: MODEL,
  currentFor_s: state.since && state.current ? Math.floor((Date.now() - state.since) / 1000) : null,
  pausedUntil: state.pausedUntil ? new Date(state.pausedUntil).toISOString() : null,
});

// Survive a container restart mid-run: if a run was active, pick it back up.
function resumeIfInterrupted() {
  try {
    const latest = db.listImports().find((i) => i.status === 'ready');
    if (!latest) return;
    const run = db.activeRun(latest.id);
    if (run) { console.log('[worker] found an interrupted run — resuming'); start(latest.id); }
  } catch (e) { console.error('[worker] resume check failed:', e.message); }
}

module.exports = { start, stop, status, resumeIfInterrupted };
