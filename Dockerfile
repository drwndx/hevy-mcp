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

# stdio MCP server by default: run with `docker run -i`. Set HEVY_TRANSPORT=http
# (plus HEVY_HTTP_HOST=0.0.0.0 and HEVY_HTTP_TOKEN) to serve on this port instead.
EXPOSE 3000
ENTRYPOINT ["node", "index.mjs"]
