'use strict';
// Extraction probe. Runs the real prompt through headless `claude -p` against
// a handful of families, so the output can be judged before committing to 667.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const db = require('../src/db');
const { renderFamily } = require('../src/render');

const PROMPT = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'extract.md'), 'utf8');
const OUT = path.join(__dirname, process.env.PROBE_OUT || 'out');
fs.mkdirSync(OUT, { recursive: true });

function claude(input, model = 'opus') {
  return new Promise((resolve, reject) => {
    const p = spawn('claude', ['-p', PROMPT, '--model', model, '--output-format', 'json'],
      { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => code === 0 ? resolve(out) : reject(new Error(`exit ${code}: ${err.slice(0, 400)}`)));
    p.stdin.end(input);
  });
}

const { parse: parseFindings } = require('../src/jsonout');

(async () => {
  const importId = db.listImports()[0].id;
  const names = process.argv.slice(2);
  if (!names.length) throw new Error('pass family names');

  for (const family of names) {
    const detail = db.familyDetail(importId, family);
    if (!detail) { console.log(`SKIP  ${family} — not found`); continue; }
    const text = renderFamily({
      family, detail,
      conversations: db.familyConversations(importId, family),
      messages: db.familyMessages(importId, family),
    });

    const t0 = Date.now();
    process.stdout.write(`RUN   ${family}  (${detail.est_tokens.toLocaleString('en-GB')} tok) … `);
    try {
      let env, findings;
      for (let attempt = 1; attempt <= 2; attempt++) {
        env = JSON.parse(await claude(text));
        try { findings = parseFindings(env.result); break; } catch (pe) {
          // Keep the raw response — the first run threw it away and the failure
          // could not be diagnosed afterwards.
          fs.writeFileSync(path.join(OUT, `RAW-${family.replace(/\W+/g, '-')}-try${attempt}.txt`), env.result || '');
          if (attempt === 2) throw pe;
          process.stdout.write('retry… ');
        }
      }
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      const slug = family.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().slice(0, 60);
      fs.writeFileSync(path.join(OUT, slug + '.json'), JSON.stringify({
        family, elapsed_s: +secs,
        usage: env.usage, cost_equiv_usd: env.total_cost_usd,
        ...findings,
      }, null, 2));
      console.log(`${secs}s  verdict=${findings.verdict}  findings=${(findings.findings || []).length}`);
    } catch (e) {
      console.log(`FAILED — ${e.message}`);
      fs.writeFileSync(path.join(OUT, 'ERROR-' + family.replace(/\W+/g, '-') + '.txt'), String(e.stack || e));
    }
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
