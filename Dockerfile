FROM node:22-alpine

ENV NODE_ENV=production \
    HEVY_AUDIT_LOG=/data/audit.log

WORKDIR /app/hevy-mcp
COPY hevy-mcp/package.json hevy-mcp/package-lock.json hevy-mcp/.npmrc ./
RUN npm ci --omit=dev --ignore-scripts

COPY hevy-mcp/index.mjs hevy-mcp/verify-audit.mjs hevy-mcp/openapi.json ./

# Audit log lives on a volume so it survives container restarts.
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node

# stdio MCP server: run with `docker run -i` (no TTY, no port).
ENTRYPOINT ["node", "index.mjs"]
