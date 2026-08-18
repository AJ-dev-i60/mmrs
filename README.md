# MMRS

Deployment scaffold at `https://mmrs.edgestudios.co.za`, on the EdgeStudios
Coolify VPS.

**Status: scaffold.** It proves DNS, certificate, build, deploy, healthcheck and
the access gate. The application it becomes is not yet specified.

## Design notes

Zero runtime dependencies — Node built-ins only, so the image is the runtime
plus three source files and there is no install step. Same shape as
`edge-launcher`, which is the known-good pattern on this Coolify.

**Fails closed.** With no `MMRS_PASSCODE` set the server answers 503 rather than
serving an open page. The `*.edgestudios.co.za` wildcard means this hostname
resolves publicly for anyone, and this service is expected to hold personal
material, so an open default would be wrong.

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `MMRS_PASSCODE` | yes | Gate passcode. Without it the service returns 503. |
| `PORT` | no | Listen port, default 3000. |
| `MMRS_VERSION` | no | Shown on the landing page. |
| `SOURCE_COMMIT` | no | Set by Coolify; shown on the landing page. |

## Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `/healthz` | open | Coolify healthcheck. JSON. |
| `/gate` | open | POST passcode, sets a signed cookie. |
| `/` | gated | Landing page. |

## Next

Pocket-ID SSO, replacing the passcode gate. Note that Pocket-ID requires
`client_secret_post` and does not advertise it — see the Launcher page in
Outline before wiring it.
