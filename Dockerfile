FROM node:22-alpine

WORKDIR /app

# Copy the whole source directory, never individual files. A Dockerfile that
# names each file builds cleanly when a new one is added and only fails at
# runtime - that cost a rollback on the launcher deploy (see Outline:
# PL · Self-Hosted Platform, "Launcher").
COPY src ./src

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# This image has no curl or wget. Coolify warns about that for Dockerfile
# deployments; the warning is a red herring - node's fetch does the job.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
