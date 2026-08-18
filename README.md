# MMRS

Ingests a ChatGPT data export and turns it into a normalised corpus, ready for
extraction into Outline canon.

Live at `https://mmrs.edgestudios.co.za` behind Pocket-ID SSO.
Canon: Outline → **PR · Archivist — chat archive to Outline canon**.

## Pipeline

    upload → unpack → scan → [Proceed] → normalise → extract → review → publish
    └───────── free, ~2.5s for 86 MB ──────────┘   └── quota ──┘

Everything up to and including normalise is free and spends no Claude quota.
The operator sees the full scan and presses Proceed before anything is spent.
Extraction and review are not built yet.

## Layout

    src/server.js     routes, auth
    src/oidc.js       Pocket-ID authorization-code flow with PKCE
    src/gate.js       passcode fallback (inert once OIDC is configured)
    src/page.js       server-rendered screens
    src/db.js         schema + queries (node:sqlite, WAL)
    src/ingest.js     export parsing — shards, mainline walk, survey
    src/normalise.js  dedup + corpus store + work queue
    src/import.js     upload, recursive unzip, scan, proceed

Zero runtime dependencies — Node built-ins only. `unzip` is the sole binary
dependency, and only because Node has no zip container support.

## Three things that will bite a reimplementation

**A conversation is a graph, not a list.** Walk `current_node` up the `parent`
chain and reverse. Iterating `mapping.values()` ingests abandoned regenerations
— 581 of 7,780 nodes in the 2026-08 export.

**Branches share message IDs.** ChatGPT's branch-into-new-chat produces separate
conversations overlapping their parent by up to 98%. Dedup on message ID; that
removes 15.3% of the corpus. Never dedup by keeping the largest conversation in
a title family — branches diverge, so that silently loses content.

**The export nests zips.** Conversations live inside
`User Online Activity/Conversations__….zip`, *inside* the outer archive. Unzip
recursively or the shard search comes back empty.

## Verification

The ingest logic is a port of the Python reference in `~/projects/archivist`.
It reproduces those numbers exactly, which is the regression test:

    690 conversations → 667 families, 5,910 messages, 7,785,180 chars
    (~1.95M tokens), 15.3% redundant, 326 empty messages dropped

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `OIDC_ISSUER` | yes | `https://id.edgestudios.co.za` |
| `OIDC_CLIENT_ID` | yes | Pocket-ID client |
| `OIDC_CLIENT_SECRET` | yes | Pocket-ID client secret |
| `BASE_URL` | yes | Public URL, used to build the redirect URI |
| `OIDC_ALLOWED_GROUPS` | no | Comma-separated. Empty = any Pocket-ID user |
| `MMRS_DATA` | no | Data directory, default `/data`. **Must be a volume.** |
| `MMRS_VERSION` | no | Shown in the UI |

## Storage

SQLite at `$MMRS_DATA/mmrs.db` (WAL), uploads under `$MMRS_DATA/imports/<id>/`.
Single writer, many readers — which is exactly SQLite's sweet spot for this
shape. Postgres is the escape hatch if the extraction worker ever needs true
write concurrency; nothing here uses SQLite-specific SQL beyond the pragmas.
