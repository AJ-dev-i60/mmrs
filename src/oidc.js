'use strict';

// Pocket-ID (OIDC) authorization-code flow with PKCE, Node built-ins only.
// Confidential client: the exchange happens server-side and the secret never
// reaches the browser.
//
// Adapted from AJ-dev-i60/edge-launcher, which is the proven implementation on
// this platform. Deviating from it is not worth the risk; the notes it carries
// were paid for once already.

const crypto = require('crypto');

const b64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (s) =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const COOKIE = 'mmrs_session';

class Oidc {
  constructor(cfg) {
    this.issuer = cfg.issuer.replace(/\/+$/, '');
    this.clientId = cfg.clientId;
    this.clientSecret = cfg.clientSecret;
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
    this.redirectUri = `${this.baseUrl}/auth/callback`;
    this.sessionTtlMs = cfg.sessionTtlMs || 12 * 60 * 60 * 1000;
    // Empty means any user Pocket-ID authenticates.
    this.allowedGroups = cfg.allowedGroups || [];
    // Deriving the session key from the client secret keeps sessions valid
    // across restarts without another variable to manage.
    this.sessionKey = crypto.createHash('sha256')
      .update(`session:${this.clientSecret}`).digest();
    this.discovery = null;
    this.pending = new Map();
  }

  async endpoints() {
    if (this.discovery) return this.discovery;
    const res = await fetch(`${this.issuer}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`OIDC discovery failed: HTTP ${res.status}`);
    this.discovery = await res.json();
    return this.discovery;
  }

  // --- stateless signed session cookie --------------------------------------

  sign(payload) {
    const body = b64url(Buffer.from(JSON.stringify(payload)));
    const mac = b64url(crypto.createHmac('sha256', this.sessionKey).update(body).digest());
    return `${body}.${mac}`;
  }

  verify(value) {
    if (!value || !value.includes('.')) return null;
    const [body, mac] = value.split('.');
    const expected = b64url(crypto.createHmac('sha256', this.sessionKey).update(body).digest());
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const s = JSON.parse(fromB64url(body));
      if (!s.exp || s.exp < Date.now()) return null;
      return s;
    } catch {
      return null;
    }
  }

  sessionFrom(req) {
    const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '');
    return m ? this.verify(decodeURIComponent(m[1])) : null;
  }

  // --- flow -----------------------------------------------------------------

  async authorizeUrl(returnTo = '/') {
    const { authorization_endpoint } = await this.endpoints();
    const state = b64url(crypto.randomBytes(24));
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());

    this.sweep();
    this.pending.set(state, { verifier, returnTo, createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid profile email groups',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return `${authorization_endpoint}?${params}`;
  }

  sweep() {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [state, e] of this.pending) {
      if (e.createdAt < cutoff) this.pending.delete(state);
    }
  }

  async callback(url) {
    if (url.searchParams.get('error')) {
      throw new Error(url.searchParams.get('error_description')
        || url.searchParams.get('error'));
    }
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) throw new Error('Missing code or state');

    const entry = this.pending.get(state);
    // Single use. An unknown or replayed state is rejected outright.
    if (!entry) throw new Error('Unknown or expired state - start again');
    this.pending.delete(state);

    const { token_endpoint } = await this.endpoints();
    const res = await fetch(token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      // Pocket-ID requires client_secret_post. It ignores an HTTP Basic header
      // and answers "Client id or secret not provided", which reads like a
      // missing-config problem. Its discovery document advertises no
      // token_endpoint_auth_methods_supported, so this is not discoverable and
      // has to be known in advance.
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        code_verifier: entry.verifier,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      throw new Error(`Token exchange failed: HTTP ${res.status} `
        + `${(await res.text()).slice(0, 200)}`);
    }

    const tokens = await res.json();
    const claims = this.readIdToken(tokens.id_token);

    const groups = Array.isArray(claims.groups) ? claims.groups : [];
    if (this.allowedGroups.length && !groups.some((g) => this.allowedGroups.includes(g))) {
      throw new Error(`Your account is not in a permitted group `
        + `(${this.allowedGroups.join(', ')})`);
    }

    return {
      cookie: this.sign({
        sub: claims.sub,
        name: claims.name || claims.preferred_username || claims.email || 'user',
        email: claims.email || '',
        groups,
        exp: Date.now() + this.sessionTtlMs,
      }),
      returnTo: entry.returnTo || '/',
    };
  }

  // The ID token arrives over TLS directly from the token endpoint in response
  // to our own request, so per OIDC Core 3.1.3.7 the signature need not be
  // re-verified here. Issuer, audience and expiry are still checked.
  readIdToken(idToken) {
    if (!idToken) throw new Error('No id_token returned');
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new Error('Malformed id_token');
    const claims = JSON.parse(fromB64url(parts[1]));

    if (claims.iss !== this.issuer) throw new Error(`Unexpected issuer ${claims.iss}`);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(this.clientId)) throw new Error('id_token audience mismatch');
    if (claims.exp && claims.exp * 1000 < Date.now()) throw new Error('id_token already expired');
    return claims;
  }

  cookieHeader(value) {
    return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; `
      + `SameSite=Lax; Max-Age=${Math.floor(this.sessionTtlMs / 1000)}`;
  }

  clearCookieHeader() {
    return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  }

  async endSessionUrl() {
    const d = await this.endpoints().catch(() => ({}));
    return d.end_session_endpoint || null;
  }
}

function fromEnv() {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  const baseUrl = process.env.BASE_URL;
  if (!issuer || !clientId || !clientSecret || !baseUrl) return null;
  return new Oidc({
    issuer, clientId, clientSecret, baseUrl,
    allowedGroups: (process.env.OIDC_ALLOWED_GROUPS || '')
      .split(',').map((s) => s.trim()).filter(Boolean),
  });
}

module.exports = { Oidc, fromEnv, COOKIE };
