'use strict';

// Turn a parsed export into the normalised corpus store.
//
// The unit of work is the FAMILY — a root conversation plus every branch
// ChatGPT spawned from it. Branches overlap their parent by up to 98 percent,
// so processing per conversation would read the same argument six times and
// spend quota six times (Outline: PR · Archivist, D2).

const ing = require('./ingest');
const db = require('./db');

function priorityFor(chars, era) {
  let p = chars < 2000 ? 1 : chars < 10000 ? 2 : chars < 50000 ? 3 : 4;
  if (era === 'primary') p += 1;      // D5 — weight the era that matters
  return p;
}

function normalise(root, importId, onProgress) {
  const { convos } = ing.load(root);
  const d = db.open();

  db.clearCorpus(importId);

  // Group into families, oldest conversation first within each.
  const fams = new Map();
  for (const c of convos) {
    const f = ing.familyOf(c.title);
    if (!fams.has(f)) fams.set(f, []);
    fams.get(f).push(c);
  }
  for (const list of fams.values()) {
    list.sort((a, b) => (a.create_time || 0) - (b.create_time || 0));
  }

  const insConv = d.prepare(`INSERT OR REPLACE INTO conversations
    (id, import_id, title, family, is_branch, created, updated, n_messages, chars, starred, archived, project_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insMsg = d.prepare(`INSERT OR REPLACE INTO messages
    (id, import_id, family, role, created, content_type, model, chars, text, seq)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const insFam = d.prepare(`INSERT OR REPLACE INTO families
    (import_id, family, n_convos, n_messages, chars, est_tokens, first_seen, last_seen, era, redundancy_pct, projects)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const insWq = d.prepare(`INSERT OR REPLACE INTO work_queue
    (import_id, family, status, priority, est_tokens, era) VALUES (?,?,'pending',?,?,?)`);

  const seenGlobal = new Set();
  const projectsSeen = new Set();
  let rawCharsTotal = 0, keptCharsTotal = 0, emptyDropped = 0, famDone = 0;
  let projectConvos = 0, projectFamilies = 0;

  d.exec('BEGIN');
  try {
    for (const [fam, members] of [...fams.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const seenFam = new Set();
      const famProjects = new Set();
      let seq = 0, rawChars = 0, keptChars = 0, keptMsgs = 0;

      for (const conv of members) {
        const msgs = ing.mainline(conv);
        let convChars = 0;

        for (const m of msgs) {
          const { text, contentType } = ing.flatten(m);
          const len = ing.charLen(text);
          convChars += len;

          if (seenFam.has(m.id) || seenGlobal.has(m.id)) continue;
          seenFam.add(m.id); seenGlobal.add(m.id);

          // 'thoughts' and 'reasoning_recap' arrive with their content stripped
          // by OpenAI — no information, so they are dropped rather than stored.
          if (ing.isHidden(m) || !text.trim()) { emptyDropped++; continue; }

          seq++; keptMsgs++; keptChars += len;
          insMsg.run(m.id, importId, fam, ing.roleOf(m), ing.ts(m.create_time),
            contentType, ing.modelOf(m), len, text, seq);
        }

        // D16 - the Project ID is per conversation, not per family. A family
        // normally sits wholly inside one project or none, but a branch can be
        // moved, so keep the distinct set rather than the first one seen.
        const project = ing.projectOf(conv);
        if (project) { famProjects.add(project); projectsSeen.add(project); projectConvos++; }

        rawChars += convChars;
        insConv.run(conv.conversation_id, importId, conv.title || null, fam,
          ing.isBranch(conv.title) ? 1 : 0, ing.ts(conv.create_time), ing.ts(conv.update_time),
          msgs.length, convChars, conv.is_starred ? 1 : 0, conv.is_archived ? 1 : 0,
          project);
      }

      rawCharsTotal += rawChars; keptCharsTotal += keptChars;
      const first = ing.day(members[0].create_time);
      const last = ing.day(members[members.length - 1].create_time);
      const eraTag = ing.era(first);
      const redundancy = rawChars ? +(100 * (1 - keptChars / rawChars)).toFixed(1) : 0;

      if (famProjects.size) projectFamilies++;
      insFam.run(importId, fam, members.length, keptMsgs, keptChars,
        Math.floor(keptChars / 4), first, last, eraTag, redundancy,
        famProjects.size ? JSON.stringify([...famProjects]) : null);
      insWq.run(importId, fam, priorityFor(keptChars, eraTag), Math.floor(keptChars / 4), eraTag);

      famDone++;
      if (onProgress && famDone % 50 === 0) onProgress(famDone, fams.size);
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }

  return {
    families: fams.size,
    messages: keptCharsTotal ? db.q('SELECT COUNT(*) AS n FROM messages WHERE import_id = ?').get(importId).n : 0,
    chars: keptCharsTotal,
    estTokens: Math.floor(keptCharsTotal / 4),
    droppedChars: rawCharsTotal - keptCharsTotal,
    droppedPct: rawCharsTotal ? +(100 * (1 - keptCharsTotal / rawCharsTotal)).toFixed(1) : 0,
    emptyDropped,
    projects: projectsSeen.size,
    projectConvos,
    projectFamilies,
  };
}

module.exports = { normalise, priorityFor };
