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
  archived   INTEGER DEFAULT 0
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

CREATE INDEX IF NOT EXISTS idx_msg_family  ON messages(import_id, family, seq);
CREATE INDEX IF NOT EXISTS idx_conv_family ON conversations(import_id, family);
CREATE INDEX IF NOT EXISTS idx_wq_status   ON work_queue(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_fam_import  ON families(import_id);
`;

let db = null;

function open() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(SCHEMA);
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

function clearCorpus(importId) {
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

module.exports = {
  open, q, now, DB_PATH, DATA_DIR,
  createImport, getImport, listImports, setStatus, saveScan, failImport,
  clearCorpus, corpusStats, listFamilies, queueSummary,
};
