'use strict';

// Render a family as the text the extractor reads.
//
// Structural markers use box-drawing banners, which the corpus itself never
// produces — message bodies are full of markdown headings, so heading-based
// structure would be indistinguishable from content.

const SEG = '━'.repeat(3);
const RULE = '═'.repeat(3);

function renderFamily({ family, detail, conversations, messages }) {
  const out = [];
  out.push(`${RULE} THREAD: ${family} ${RULE}`);
  out.push(`Span: ${detail.first_seen} to ${detail.last_seen}`);
  out.push(`${detail.n_messages} messages, ${detail.chars.toLocaleString('en-GB')} characters`);
  if (detail.n_convos > 1) {
    out.push(`Folded from ${detail.n_convos} separate chats he branched apart `
      + `(${detail.redundancy_pct}% of the raw text was duplicated between them and has been removed).`);
  }
  out.push('');
  out.push('Structure is marked by the banner lines below. Every other line is '
    + 'verbatim message content, including its own markdown.');
  out.push('');

  for (const m of messages) {
    out.push(`${SEG} TURN ${m.seq} │ ${m.role} │ ${(m.created || 'unknown').slice(0, 10)} ${SEG}`);
    out.push('');
    out.push(m.text);
    out.push('');
  }
  return out.join('\n');
}

module.exports = { renderFamily };
