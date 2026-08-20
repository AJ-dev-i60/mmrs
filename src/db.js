'use strict';

// SQLite via node's built-in driver — no dependency, one file on a volume.
// WAL so the future extraction worker can write while the web process reads.
// If concurrency ever outgrows that, Postgres is the escape hatch; nothing in
// here uses SQLite-specific syntax beyond the pragmas.

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.MMRS_DATA || '/data';
const DB_PATH = path.join(DATA_DIR, 'mmrs.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS imports (
  id            TEXT PRIMARY KEY,
  filename      TEXT NOT NULL,
  bytes         INTEGER NOT NULL,
  sha256        TEXT,
  corpus        TEXT NOT NULL DEFAULT 'personal',  -- D11: provenance
  status        TEXT NOT NULL,                     -- uploaded|scanning|scanned|normalising|ready|failed
  error         TEXT,
  scan_json     TEXT,
  uploaded_at   TEXT NOT NULL,
  scanned_at    TEXT,
  normalised_at TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  import_id  TEXT NOT NULL,
  title      TEXT,
  family     TEXT NOT NULL,
  is_branch  INTEGER NOT NULL DEFAULT 0,
  created    TEXT,
  updated    TEXT,
  n_messages INTEGER,
  chars      INTEGER,
  starred    INTEGER DEFAULT 0,
  archived   INTEGER DEFAULT 0,
  project_id TEXT                                  -- D16: ChatGPT Project, opaque g-p-... ID
);

CREATE TABLE IF NOT EXISTS families (
  import_id      TEXT NOT NULL,
  family         TEXT NOT NULL,
  n_convos       INTEGER,
  n_messages     INTEGER,
  chars          INTEGER,
  est_tokens     INTEGER,
  first_seen     TEXT,
  last_seen      TEXT,
  era            TEXT,
  redundancy_pct REAL,
  projects       TEXT,                             -- D16: JSON array of project IDs
  PRIMARY KEY (import_id, family)
);

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  import_id    TEXT NOT NULL,
  family       TEXT NOT NULL,
  role         TEXT,
  created      TEXT,
  content_type TEXT,
  model        TEXT,
  chars        INTEGER,
  text         TEXT,
  seq          INTEGER
);

-- The exhaustive task list. status carries the run; note lets a worker record
-- a question and move on rather than blocking (the original brief).
CREATE TABLE IF NOT EXISTS work_queue (
  import_id    TEXT NOT NULL,
  family       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending|running|done|failed|needs_input
  priority     INTEGER,
  est_tokens   INTEGER,
  era          TEXT,
  claimed_at   TEXT,
  completed_at TEXT,
  attempts     INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  PRIMARY KEY (import_id, family)
);

-- One row per family successfully extracted. Findings and markers hang off it.
CREATE TABLE IF NOT EXISTS extractions (
  import_id   TEXT NOT NULL,
  family      TEXT NOT NULL,
  verdict     TEXT,
  summary     TEXT,
  topics      TEXT,
  entities    TEXT,
  open_questions TEXT,
  domains     TEXT,
  model       TEXT,
  elapsed_ms  INTEGER,
  usage_json  TEXT,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (import_id, family)
);

-- Three independent axes (see prompts/extract.md):
--   type    — what shape of thing it is, drives how a page is written
--   domains — what field, proportional, drives where it lives
--   tags    — open specifics, the escape valve, drives how it is found
-- Making one exclusive field carry all three is what caused misfits to be
-- crammed into the nearest slot or dropped.
CREATE TABLE IF NOT EXISTS findings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id    TEXT NOT NULL,
  family       TEXT NOT NULL,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  domains      TEXT,            -- JSON [{domain, pct}], sums to 100, max 3
  primary_domain TEXT,          -- denormalised highest-pct domain, for cheap filtering
  tags         TEXT,            -- JSON array of free-text tags
  confidence   REAL,
  citations    TEXT,
  created_at   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS finding_tags (
  import_id TEXT NOT NULL, finding_id INTEGER NOT NULL, tag TEXT NOT NULL,
  PRIMARY KEY (finding_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_ftags ON finding_tags(import_id, tag);

-- Observations, not conclusions. Read later, in bulk, by the portrait pass.
CREATE TABLE IF NOT EXISTS markers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id  TEXT NOT NULL,
  family     TEXT NOT NULL,
  turn       INTEGER,
  quote      TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id   TEXT NOT NULL,
  status      TEXT NOT NULL,          -- running|stopped|finished|failed
  started_at  TEXT NOT NULL,
  stopped_at  TEXT,
  note        TEXT
);

-- Worker event log. The container's stdout is ephemeral and only reachable
-- through the Coolify API, so anything worth looking at later lives here.
CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id TEXT,
  ts        TEXT NOT NULL,
  level     TEXT NOT NULL,          -- info|warn|error
  event     TEXT NOT NULL,          -- run_start|claim|extracted|failed|quota|run_stop|...
  family    TEXT,
  detail    TEXT,
  ms        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(id DESC);

CREATE INDEX IF NOT EXISTS idx_find_family ON findings(import_id, family);
CREATE INDEX IF NOT EXISTS idx_mark_family ON markers(import_id, family);
CREATE INDEX IF NOT EXISTS idx_find_type   ON findings(import_id, type);
CREATE INDEX IF NOT EXISTS idx_msg_family  ON messages(import_id, family, seq);
CREATE INDEX IF NOT EXISTS idx_conv_family ON conversations(import_id, family);
CREATE INDEX IF NOT EXISTS idx_wq_status   ON work_queue(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_fam_import  ON families(import_id);
`;

// Columns added after the first deploy. CREATE TABLE IF NOT EXISTS silently
// does nothing on an existing database, so new columns need an explicit ALTER
// or a volume that has already been written stays on the old shape forever.
// Every column added after a table first shipped, oldest first. CREATE TABLE
// IF NOT EXISTS is a no-op on an existing table, so a column that only appears
// in SCHEMA never reaches a database that already has that table.
const ADDED_COLUMNS = [
  ['findings', 'domains', 'TEXT'],              // v0.8.0, D17
  ['findings', 'primary_domain', 'TEXT'],       // v0.8.0, D17
  ['findings', 'tags', 'TEXT'],                 // v0.8.0, D17
  ['extractions', 'domains', 'TEXT'],           // v0.8.0, D17
  ['conversations', 'project_id', 'TEXT'],      // v0.9.0, D16
  ['families', 'projects', 'TEXT'],             // v0.9.0, D16
];

// Indexes over added columns CANNOT live in SCHEMA. On an existing database
// SCHEMA runs first, so a CREATE INDEX there references a column that has not
// been ALTERed in yet and the whole boot fails.
const ADDED_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_fdom ON findings(import_id, primary_domain)',
  'CREATE INDEX IF NOT EXISTS idx_conv_project ON conversations(import_id, project_id)',
];

function migrate(d) {
  for (const [table, col, decl] of ADDED_COLUMNS) {
    const have = d.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
    if (!have) d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
  }
  for (const sql of ADDED_INDEXES) d.exec(sql);
}

let db = null;

function open() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const d = new DatabaseSync(DB_PATH);
  try {
    d.exec('PRAGMA journal_mode = WAL');
    d.exec('PRAGMA foreign_keys = ON');
    d.exec('PRAGMA busy_timeout = 5000');
    d.exec(SCHEMA);
    migrate(d);
  } catch (e) {
    try { d.close(); } catch {}
    throw new Error(`schema/migration failed: ${e.message}`);
  }
  db = d;                 // only once it is actually usable
  return db;
}

const q = (sql) => open().prepare(sql);
const now = () => new Date().toISOString().slice(0, 19) + 'Z';

/* ---------- imports ---------- */

function createImport({ id, filename, bytes, sha256, corpus }) {
  q(`INSERT INTO imports (id, filename, bytes, sha256, corpus, status, uploaded_at)
     VALUES (?,?,?,?,?,'uploaded',?)`).run(id, filename, bytes, sha256 || null, corpus || 'personal', now());
  return getImport(id);
}

const getImport = (id) => q('SELECT * FROM imports WHERE id = ?').get(id) || null;
const listImports = () => q('SELECT * FROM imports ORDER BY uploaded_at DESC').all();

function setStatus(id, status, extra = {}) {
  const sets = ['status = ?'];
  const vals = [status];
  for (const [k, v] of Object.entries(extra)) { sets.push(`${k} = ?`); vals.push(v); }
  vals.push(id);
  q(`UPDATE imports SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

function saveScan(id, scan) {
  setStatus(id, 'scanned', { scan_json: JSON.stringify(scan), scanned_at: now(), error: null });
}

const failImport = (id, message) => setStatus(id, 'failed', { error: String(message).slice(0, 2000) });

/* ---------- corpus ---------- */

// Everything extraction produced, plus the queue state that says it happened.
// Used both by the reset control and by clearCorpus - findings whose family
// rows have been deleted are orphans, so they go together.
function clearExtractions(importId) {
  for (const t of ['finding_tags', 'findings', 'markers', 'extractions', 'runs']) {
    q(`DELETE FROM ${t} WHERE import_id = ?`).run(importId);
  }
}

// Put every family back in the queue as if it had never been claimed.
function requeueAll(importId) {
  q(`UPDATE work_queue SET status = 'pending', claimed_at = NULL,
        completed_at = NULL, attempts = 0, note = NULL
     WHERE import_id = ?`).run(importId);
}

// Drop extraction output and requeue, keeping the corpus. This is the cheap
// reset - re-importing to re-run a changed prompt would mean re-uploading and
// re-normalising for no reason.
function resetExtractions(importId) {
  const before = q('SELECT COUNT(*) AS n FROM extractions WHERE import_id = ?').get(importId).n;
  const d = open();
  d.exec('BEGIN IMMEDIATE');
  try {
    clearExtractions(importId);
    requeueAll(importId);
    d.exec('COMMIT');
  } catch (e) { d.exec('ROLLBACK'); throw e; }
  const queued = q('SELECT COUNT(*) AS n FROM work_queue WHERE import_id = ?').get(importId).n;
  return { cleared: before, requeued: queued };
}

function clearCorpus(importId) {
  clearExtractions(importId);
  for (const t of ['messages', 'families', 'conversations', 'work_queue']) {
    q(`DELETE FROM ${t} WHERE import_id = ?`).run(importId);
  }
}

function corpusStats(importId) {
  const f = q(`SELECT COUNT(*) AS families, SUM(n_messages) AS messages,
                      SUM(chars) AS chars, SUM(est_tokens) AS tokens,
                      MIN(first_seen) AS first, MAX(last_seen) AS last
               FROM families WHERE import_id = ?`).get(importId);
  const wq = q(`SELECT status, COUNT(*) AS n, SUM(est_tokens) AS tokens
                FROM work_queue WHERE import_id = ? GROUP BY status`).all(importId);
  return { ...f, queue: wq };
}

const listFamilies = (importId, limit = 200) =>
  q(`SELECT family, n_convos, n_messages, chars, est_tokens, first_seen, last_seen, era
     FROM families WHERE import_id = ? ORDER BY chars DESC LIMIT ?`).all(importId, limit);

const queueSummary = (importId) =>
  q(`SELECT priority, COUNT(*) AS n, SUM(est_tokens) AS tokens
     FROM work_queue WHERE import_id = ? GROUP BY priority ORDER BY priority DESC`).all(importId);

/* ---------- browsing ---------- */

// All families for an import. 667 rows is small enough to render in one page
// and filter client-side, which beats paginating something you want to skim.
const allFamilies = (importId) =>
  q(`SELECT f.family, f.n_convos, f.n_messages, f.chars, f.est_tokens,
            f.first_seen, f.last_seen, f.era, f.redundancy_pct,
            w.status AS queue_status, w.priority
     FROM families f
     LEFT JOIN work_queue w ON w.import_id = f.import_id AND w.family = f.family
     WHERE f.import_id = ? ORDER BY f.chars DESC`).all(importId);

const familyDetail = (importId, family) =>
  q('SELECT * FROM families WHERE import_id = ? AND family = ?').get(importId, family) || null;

const familyConversations = (importId, family) =>
  q(`SELECT id, title, is_branch, created, n_messages, chars
     FROM conversations WHERE import_id = ? AND family = ?
     ORDER BY created`).all(importId, family);

const familyMessages = (importId, family) =>
  q(`SELECT id, role, created, content_type, model, chars, text, seq
     FROM messages WHERE import_id = ? AND family = ? ORDER BY seq`).all(importId, family);

// Conversations per month, for the dashboard timeline.
const monthHistogram = (importId) =>
  q(`SELECT substr(created,1,7) AS month, COUNT(*) AS n
     FROM conversations WHERE import_id = ? AND created IS NOT NULL
     GROUP BY month ORDER BY month`).all(importId);

// D16 - what ChatGPT Projects are in this import, and which families they
// cover. Ground truth for the clusterer: these groupings were made by hand.
const projectSummary = (importId) =>
  q(`SELECT project_id, COUNT(*) AS n_convos, COUNT(DISTINCT family) AS n_families,
            SUM(chars) AS chars, MIN(created) AS first_seen, MAX(created) AS last_seen
     FROM conversations WHERE import_id = ? AND project_id IS NOT NULL
     GROUP BY project_id ORDER BY chars DESC`).all(importId);

const projectFamilies = (importId, projectId) =>
  q(`SELECT DISTINCT family FROM conversations
     WHERE import_id = ? AND project_id = ? ORDER BY family`).all(importId, projectId);

const eraSplit = (importId) =>
  q(`SELECT era, COUNT(*) AS n, SUM(est_tokens) AS tokens
     FROM families WHERE import_id = ? GROUP BY era`).all(importId);

/* ---------- extraction ---------- */

// Claim the highest-priority pending family, atomically enough for one worker.
function claimNext(importId) {
  const d = open();
  d.exec('BEGIN IMMEDIATE');
  try {
    const row = d.prepare(`SELECT family FROM work_queue
      WHERE import_id = ? AND status = 'pending'
      ORDER BY priority DESC, est_tokens ASC LIMIT 1`).get(importId);
    if (!row) { d.exec('COMMIT'); return null; }
    d.prepare(`UPDATE work_queue SET status='running', claimed_at=?, attempts=attempts+1
               WHERE import_id=? AND family=?`).run(now(), importId, row.family);
    d.exec('COMMIT');
    return row.family;
  } catch (e) { d.exec('ROLLBACK'); throw e; }
}

function saveExtraction(importId, family, result, meta) {
  const d = open();
  d.exec('BEGIN');
  try {
    d.prepare('DELETE FROM findings WHERE import_id=? AND family=?').run(importId, family);
    d.prepare('DELETE FROM markers  WHERE import_id=? AND family=?').run(importId, family);
    d.prepare(`INSERT OR REPLACE INTO extractions
      (import_id, family, verdict, summary, topics, entities, open_questions, domains, model, elapsed_ms, usage_json, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      importId, family, result.verdict || null, result.summary || null,
      JSON.stringify(result.topics || []), JSON.stringify(result.entities || []),
      JSON.stringify(result.open_questions || []), JSON.stringify(normaliseDomains(result.domains)),
      meta.model || null, meta.elapsed_ms || null, JSON.stringify(meta.usage || {}), now());

    d.prepare('DELETE FROM finding_tags WHERE import_id=? AND finding_id IN (SELECT id FROM findings WHERE import_id=? AND family=?)')
      .run(importId, importId, family);
    const fi = d.prepare(`INSERT INTO findings
      (import_id, family, type, title, body, domains, primary_domain, tags, confidence, citations, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const ft = d.prepare('INSERT OR IGNORE INTO finding_tags (import_id, finding_id, tag) VALUES (?,?,?)');
    for (const f of result.findings || []) {
      const doms = normaliseDomains(f.domains);
      const tags = (Array.isArray(f.tags) ? f.tags : [])
        .map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 20);
      const info = fi.run(importId, family, f.type || 'reference', f.title || '(untitled)', f.body || '',
        JSON.stringify(doms), doms.length ? doms[0].domain : null, JSON.stringify(tags),
        f.confidence == null ? null : Number(f.confidence), JSON.stringify(f.citations || []), now());
      for (const t of tags) ft.run(importId, info.lastInsertRowid, t);
    }
    const mk = d.prepare(`INSERT INTO markers
      (import_id, family, turn, quote, note, created_at) VALUES (?,?,?,?,?,?)`);
    for (const m of result.markers || []) {
      mk.run(importId, family, m.turn == null ? null : Number(m.turn), m.quote || '', m.note || '', now());
    }
    d.prepare(`UPDATE work_queue SET status='done', completed_at=?, note=NULL
               WHERE import_id=? AND family=?`).run(now(), importId, family);
    d.exec('COMMIT');
  } catch (e) { d.exec('ROLLBACK'); throw e; }
}

const releaseFamily = (importId, family, note) =>
  q(`UPDATE work_queue SET status='pending', claimed_at=NULL, note=? WHERE import_id=? AND family=?`)
    .run((note || '').slice(0, 500), importId, family);

const failFamily = (importId, family, note) =>
  q(`UPDATE work_queue SET status=CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
       claimed_at=NULL, note=? WHERE import_id=? AND family=?`)
    .run((note || '').slice(0, 500), importId, family);

const extractionProgress = (importId) =>
  q(`SELECT status, COUNT(*) AS n, SUM(est_tokens) AS tokens
     FROM work_queue WHERE import_id=? GROUP BY status`).all(importId);

const findingsSummary = (importId) =>
  q(`SELECT type, COUNT(*) AS n FROM findings WHERE import_id=? GROUP BY type ORDER BY n DESC`).all(importId);

const recentExtractions = (importId, limit = 12) =>
  q(`SELECT e.family, e.verdict, e.elapsed_ms, e.created_at,
            (SELECT COUNT(*) FROM findings f WHERE f.import_id=e.import_id AND f.family=e.family) AS n_findings,
            (SELECT COUNT(*) FROM markers  m WHERE m.import_id=e.import_id AND m.family=e.family) AS n_markers
     FROM extractions e WHERE e.import_id=? ORDER BY e.created_at DESC LIMIT ?`).all(importId, limit);

const totals = (importId) =>
  q(`SELECT (SELECT COUNT(*) FROM findings WHERE import_id=?) AS findings,
            (SELECT COUNT(*) FROM markers  WHERE import_id=?) AS markers,
            (SELECT COUNT(*) FROM extractions WHERE import_id=?) AS extracted`).get(importId, importId, importId);

const startRun = (importId) => {
  q(`UPDATE runs SET status='stopped', stopped_at=? WHERE import_id=? AND status='running'`).run(now(), importId);
  q(`INSERT INTO runs (import_id, status, started_at) VALUES (?,'running',?)`).run(importId, now());
  return q('SELECT * FROM runs WHERE import_id=? ORDER BY id DESC LIMIT 1').get(importId);
};
const stopRun = (importId, note) =>
  q(`UPDATE runs SET status='stopped', stopped_at=?, note=? WHERE import_id=? AND status='running'`)
    .run(now(), note || null, importId);
const activeRun = (importId) =>
  q(`SELECT * FROM runs WHERE import_id=? AND status='running' ORDER BY id DESC LIMIT 1`).get(importId) || null;
// A worker crash can leave a family 'running' with nobody working it.
const releaseStale = (importId) =>
  q(`UPDATE work_queue SET status='pending', claimed_at=NULL
     WHERE import_id=? AND status='running'`).run(importId).changes;

/* ---------- events ---------- */

function logEvent(importId, level, event, { family, detail, ms } = {}) {
  try {
    q(`INSERT INTO events (import_id, ts, level, event, family, detail, ms)
       VALUES (?,?,?,?,?,?,?)`).run(importId || null, now(), level, event,
      family || null, detail == null ? null : String(detail).slice(0, 4000), ms == null ? null : ms);
  } catch (e) { console.error('[db] logEvent failed:', e.message); }
}

const listEvents = ({ importId, level, limit = 300, sinceId = 0 } = {}) => {
  const where = ['id > ?']; const args = [sinceId];
  if (importId) { where.push('import_id = ?'); args.push(importId); }
  if (level && level !== 'all') {
    if (level === 'problems') where.push("level IN ('warn','error')");
    else { where.push('level = ?'); args.push(level); }
  }
  args.push(limit);
  return q(`SELECT * FROM events WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`).all(...args);
};

const eventCounts = (importId) =>
  q(`SELECT level, COUNT(*) AS n FROM events WHERE import_id = ? GROUP BY level`).all(importId);

const DOMAINS = ['technology', 'making', 'science', 'body', 'work', 'people', 'meaning', 'living'];

// Enforce the rules the prompt asks for, because a model will occasionally
// return 4 domains, or a split summing to 97. Drop unknowns and anything under
// 10, keep the top three, then rescale so the result always sums to 100.
function normaliseDomains(raw) {
  if (!Array.isArray(raw)) return [];
  let d = raw
    .map((x) => ({ domain: String((x && x.domain) || '').trim().toLowerCase(), pct: Number((x && x.pct) || 0) }))
    .filter((x) => DOMAINS.includes(x.domain) && x.pct >= 10)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);
  const total = d.reduce((a, x) => a + x.pct, 0);
  if (!total) return [];
  d = d.map((x) => ({ domain: x.domain, pct: Math.round(100 * x.pct / total) }));
  // rounding can leave 99 or 101; push the remainder onto the largest
  const drift = 100 - d.reduce((a, x) => a + x.pct, 0);
  if (drift) d[0].pct += drift;
  return d;
}

/* ---------- reading what extraction produced ---------- */

const allFindings = (importId, { type, domain, tag, limit = 500 } = {}) => {
  const where = ['f.import_id = ?']; const args = [importId];
  if (type && type !== 'all') { where.push('f.type = ?'); args.push(type); }
  if (domain && domain !== 'all') { where.push('f.primary_domain = ?'); args.push(domain); }
  if (tag) { where.push('EXISTS (SELECT 1 FROM finding_tags t WHERE t.finding_id = f.id AND t.tag = ?)'); args.push(tag); }
  args.push(limit);
  return q(`SELECT f.* FROM findings f WHERE ${where.join(' AND ')}
            ORDER BY f.confidence DESC, f.id ASC LIMIT ?`).all(...args);
};

const domainSummary = (importId) =>
  q(`SELECT primary_domain AS domain, COUNT(*) AS n FROM findings
     WHERE import_id=? AND primary_domain IS NOT NULL
     GROUP BY primary_domain ORDER BY n DESC`).all(importId);

const topTags = (importId, limit = 40) =>
  q(`SELECT tag, COUNT(*) AS n FROM finding_tags WHERE import_id=?
     GROUP BY tag ORDER BY n DESC, tag LIMIT ?`).all(importId, limit);

const familyFindings = (importId, family) =>
  q(`SELECT * FROM findings WHERE import_id=? AND family=? ORDER BY confidence DESC, id`).all(importId, family);

const familyMarkers = (importId, family) =>
  q(`SELECT * FROM markers WHERE import_id=? AND family=? ORDER BY turn`).all(importId, family);

const familyExtraction = (importId, family) =>
  q('SELECT * FROM extractions WHERE import_id=? AND family=?').get(importId, family) || null;

const verdictCounts = (importId) =>
  q(`SELECT verdict, COUNT(*) AS n FROM extractions WHERE import_id=? GROUP BY verdict`).all(importId);

const allMarkers = (importId, limit = 400) =>
  q(`SELECT * FROM markers WHERE import_id=? ORDER BY id DESC LIMIT ?`).all(importId, limit);

module.exports = {
  open, q, now, DB_PATH, DATA_DIR,
  allFindings, familyFindings, familyMarkers, familyExtraction, verdictCounts, allMarkers,
  domainSummary, topTags, normaliseDomains, DOMAINS,
  logEvent, listEvents, eventCounts,
  claimNext, saveExtraction, releaseFamily, failFamily, releaseStale,
  extractionProgress, findingsSummary, recentExtractions, totals,
  startRun, stopRun, activeRun,
  allFamilies, familyDetail, familyConversations, familyMessages,
  monthHistogram, eraSplit,
  createImport, getImport, listImports, setStatus, saveScan, failImport,
  clearCorpus, clearExtractions, resetExtractions, requeueAll,
  corpusStats, listFamilies, queueSummary,
  projectSummary, projectFamilies,
};
