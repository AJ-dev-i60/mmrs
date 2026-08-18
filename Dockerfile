FROM node:22-alpine

# unzip: OpenAI's export nests zips inside the outer archive, so the importer
# has to unpack recursively. Node has zlib but no zip container support.
# git + bash: the Claude Code CLI expects them present.
RUN apk add --no-cache unzip git bash ca-certificates

# The extraction worker shells out to `claude -p`, authenticated against a
# subscription via CLAUDE_CODE_OAUTH_TOKEN. There is no API key (Outline:
# PR · Archivist, O2), so this is the only path.
RUN npm install -g @anthropic-ai/claude-code && claude --version

WORKDIR /app

# Copy whole directories, never individual files. A Dockerfile that names each
# file builds cleanly when a new one is added and only fails at runtime — that
# cost a rollback on the launcher deploy, and would have silently shipped an
# image with no prompts/ here.
COPY src ./src
COPY prompts ./prompts

ENV NODE_ENV=production
ENV PORT=3000
ENV MMRS_DATA=/data
# Claude Code writes config/state here; keep it off the read-only paths.
ENV HOME=/data/home
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
