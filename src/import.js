'use strict';

// Upload, unpack and scan a ChatGPT export. Everything here is free and fast —
// nothing touches the Claude quota. The operator sees the full picture and
// presses Proceed before any of that is spent.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { pipeline } = require('stream/promises');

const db = require('./db');
const ing = require('./ingest');
const { normalise } = require('./normalise');

const IMPORT_DIR = path.join(db.DATA_DIR, 'imports');
const MAX_BYTES = 2 * 1024 * 1024 * 1024;     // 2 GB
const MAX_NEST = 3;                            // nested-zip recursion limit

const newId = () => new Date().toISOString().slice(0, 10).replace(/-/g, '')
  + '-' + crypto.randomBytes(3).toString('hex');

const dirFor = (id) => path.join(IMPORT_DIR, id);
const zipFor = (id) => path.join(dirFor(id), 'upload.zip');
const extractedFor = (id) => path.join(dirFor(id), 'extracted');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      // unzip exits 1 for warnings (e.g. extra bytes at start) but still extracts.
      if (err && err.code !== 1) return reject(new Error(`${cmd} failed: ${stderr || err.message}`));
      resolve({ stdout, stderr });
    });
  });
}

/** Stream the raw request body to disk. No multipart parsing — the browser
 *  sends the file as the body, which avoids hand-rolling a parser. */
async function receive(req, filename, corpus) {
  const id = newId();
  fs.mkdirSync(dirFor(id), { recursive: true });
  const dest = zipFor(id);

  const hash = crypto.createHash('sha256');
  let bytes = 0;
  req.on('data', (c) => { bytes += c.length; hash.update(c); });

  const out = fs.createWriteStream(dest);
  await pipeline(req, out);

  if (bytes === 0) { fs.rmSync(dirFor(id), { recursive: true, force: true }); throw new Error('Empty upload'); }
  if (bytes > MAX_BYTES) { fs.rmSync(dirFor(id), { recursive: true, force: true }); throw new Error('File exceeds 2 GB'); }

  return db.createImport({
    id, filename: filename || 'export.zip', bytes,
    sha256: hash.digest('hex'), corpus: corpus || 'personal',
  });
}

/** OpenAI's export nests zips: the outer archive holds
 *  "User Online Activity/Conversations__...zip", and the conversation shards
 *  live inside THAT. Extract recursively or findShards comes back empty. */
async function extract(id) {
  const target = extractedFor(id);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  await run('unzip', ['-q', '-o', zipFor(id), '-d', target]);

  let nested = 0;
  for (let depth = 0; depth < MAX_NEST; depth++) {
    const zips = fs.readdirSync(target, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.zip'))
      .map((e) => path.join(e.parentPath || e.path, e.name));
    if (!zips.length) break;
    for (const z of zips) {
      const into = z.replace(/\.zip$/i, '');
      fs.mkdirSync(into, { recursive: true });
      await run('unzip', ['-q', '-o', z, '-d', into]);
      fs.rmSync(z, { force: true });          // reclaim space; the outer copy is kept
      nested++;
    }
  }
  return { nested };
}

async function scan(id) {
  const rec = db.getImport(id);
  if (!rec) throw new Error('Unknown import');
  db.setStatus(id, 'scanning', { error: null });
  try {
    const { nested } = await extract(id);
    const root = extractedFor(id);
    const shards = ing.findShards(root);
    if (!shards.length) {
      throw new Error('No conversation shards found. Is this a ChatGPT export? '
        + 'Expected conversations.json or conversations-000.json inside the archive.');
    }
    const result = ing.survey(root);
    result.nestedArchives = nested;
    result.attachments = countAttachments(root);
    db.saveScan(id, result);
    return result;
  } catch (e) {
    db.failImport(id, e.message);
    throw e;
  }
}

function countAttachments(root) {
  let n = 0, bytes = 0;
  for (const e of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!e.isFile()) continue;
    if (/\.(dat|png|jpe?g|webp|gif)$/i.test(e.name)) {
      n++;
      try { bytes += fs.statSync(path.join(e.parentPath || e.path, e.name)).size; } catch {}
    }
  }
  return { count: n, bytes };
}

/** The Proceed action. Still free — builds the corpus store and the task list,
 *  but spends no quota. Extraction is a separate stage after this. */
function proceed(id) {
  const rec = db.getImport(id);
  if (!rec) throw new Error('Unknown import');
  if (rec.status !== 'scanned' && rec.status !== 'ready') {
    throw new Error(`Import is "${rec.status}" — scan it first`);
  }
  db.setStatus(id, 'normalising', { error: null });
  try {
    const result = normalise(extractedFor(id), id);
    db.setStatus(id, 'ready', { normalised_at: db.now() });
    return result;
  } catch (e) {
    db.failImport(id, e.message);
    throw e;
  }
}

function remove(id) {
  db.clearCorpus(id);
  db.q('DELETE FROM imports WHERE id = ?').run(id);
  fs.rmSync(dirFor(id), { recursive: true, force: true });
}

module.exports = { receive, scan, proceed, remove, dirFor, extractedFor, IMPORT_DIR, MAX_BYTES };
