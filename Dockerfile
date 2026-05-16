# ============================================
# Builder Agent Chain - Multi-stage Dockerfile
# ============================================
# Build:  docker build -t builder-agent-chain .
# Run:    docker run -p 3001:3001 --env-file .env builder-agent-chain
#

# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root config
COPY package.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY ai-engine/package.json ai-engine/

# Install all deps (including devDependencies for build)
RUN npm install --include=dev

# Copy source
COPY . .

# Build all workspaces
RUN npm run build

# --- Stage 2: Production ---
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache tini

# Install backend production dependencies, including the local ai-engine package.
COPY --from=builder /app/backend/package.json ./backend/
COPY --from=builder /app/ai-engine/dist ./ai-engine/dist
COPY --from=builder /app/ai-engine/package.json ./ai-engine/
RUN cd backend && npm install --omit=dev --ignore-scripts

# Copy runtime artifacts
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/frontend/dist ./frontend
COPY --from=builder /app/ecosystem.config.cjs ./

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN mkdir -p /app/backend/logs /var/lib/builder-agent-chain \
  && chown -R appuser:appgroup /app/backend/logs /var/lib/builder-agent-chain
USER appuser

# Default env
ENV NODE_ENV=production
ENV PORT=3001
ENV FRONTEND_DIST_DIR=/app/frontend

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "backend/dist/server.js"]
