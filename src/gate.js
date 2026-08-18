'use strict';
const crypto = require('crypto');

const COOKIE = 'mmrs_gate';
const MAX_AGE = 60 * 60 * 24 * 14;   // 14 days

function secret() {
  return process.env.MMRS_PASSCODE || '';
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

function issue() {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  return `${exp}.${sign(exp)}`;
}

function valid(token) {
  if (!token) return false;
  const [exp, mac] = String(token).split('.');
  if (!exp || !mac) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(exp);
  // timingSafeEqual throws on length mismatch, so compare digests of equal size
  const a = Buffer.from(mac, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function authed(req) {
  return valid(cookies(req)[COOKIE]);
}

function setCookie(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=${issue()}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`);
}

// Constant-time passcode check, so the gate does not leak length by timing.
function check(supplied) {
  const s = secret();
  if (!s) return false;
  const a = crypto.createHash('sha256').update(String(supplied || '')).digest();
  const b = crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = { COOKIE, secret, authed, setCookie, check };
