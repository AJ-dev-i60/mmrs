'use strict';

// Minimal markdown renderer for archived chat messages.
//
// Deliberately small: the corpus is ChatGPT output, so it uses a narrow and
// predictable slice of markdown. Everything is HTML-escaped BEFORE any markup
// is applied, so the output can only contain tags this file emits.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

function inline(t) {
  return t
    // code first, so its contents are not further transformed
    .replace(/`([^`\n]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,;:!?)])/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    // links: only http(s), and the label is already escaped
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_, label, href) => `<a href="${href}" rel="noopener noreferrer nofollow" target="_blank">${label}</a>`);
}

const splitRow = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const isDivider = (line) => /^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/.test(line) && line.includes('-');

function render(raw) {
  const lines = esc(raw).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (buf.length) out.push(`<p>${inline(buf.join(' '))}</p>`);
    buf.length = 0;
  };
  const para = [];

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = line.match(/^\s*```+\s*([\w+-]*)\s*$/);
    if (fence) {
      flushParagraph(para);
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<pre${fence[1] ? ` data-lang="${fence[1]}"` : ''}><code>${body.join('\n')}</code></pre>`);
      continue;
    }

    if (!line.trim()) { flushParagraph(para); i++; continue; }

    // heading — chat content nests deep, so h1..h3 all render at one visual weight
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushParagraph(para);
      const lvl = Math.min(6, Math.max(3, h[1].length + 2));   // never emit h1/h2 inside a page
      out.push(`<h${lvl} class="mdh">${inline(h[2].trim())}</h${lvl}>`);
      i++; continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { flushParagraph(para); out.push('<hr>'); i++; continue; }

    // table
    if (line.includes('|') && i + 1 < lines.length && isDivider(lines[i + 1])) {
      flushParagraph(para);
      const head = splitRow(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) body.push(splitRow(lines[i++]));
      out.push(`<div class="mdtw"><table class="mdt"><thead><tr>${
        head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
        body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
      }</tbody></table></div>`);
      continue;
    }

    // blockquote
    if (/^\s*&gt;\s?/.test(line)) {
      flushParagraph(para);
      const body = [];
      while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) body.push(lines[i++].replace(/^\s*&gt;\s?/, ''));
      out.push(`<blockquote>${inline(body.join(' '))}</blockquote>`);
      continue;
    }

    // lists (one level; nesting is rare in this corpus and not worth the complexity)
    const bullet = line.match(/^\s*([-*+])\s+(.*)$/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph(para);
      const ordered = Boolean(numbered);
      const items = [];
      while (i < lines.length) {
        const b = lines[i].match(/^\s*([-*+])\s+(.*)$/);
        const nm = lines[i].match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (ordered ? !nm : !b) {
          // a plain indented continuation line belongs to the previous item
          if (items.length && /^\s{2,}\S/.test(lines[i]) && lines[i].trim()) {
            items[items.length - 1] += ' ' + lines[i].trim(); i++; continue;
          }
          break;
        }
        items.push((ordered ? nm : b)[2]); i++;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushParagraph(para);
  return out.join('\n');
}

module.exports = { render, esc };
