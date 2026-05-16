#!/usr/bin/env bash
# ============================================
# Builder Agent Chain - Deploy Script
# ============================================
# Usage: ./deploy/deploy.sh
#
# Prerequisites:
#   - Node.js 18+ installed
#   - PM2 installed globally (npm install -g pm2)
#   - .env file configured (copy from .env.example)
#   - Nginx configured (see deploy/nginx.conf.template)
#
# Set DEPLOY_DIR to change the installation target.
# Default: /var/www/builder-agent-chain

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/builder-agent-chain}"
DATA_DIR="/var/lib/builder-agent-chain"
PM2_APP_NAME="builder-agent-chain"
HEALTH_CHECK_URL="http://127.0.0.1:3001/health"
HEALTH_CHECK_TIMEOUT=60

echo "=== Builder Agent Chain Deploy ==="
echo "Project: $PROJECT_DIR"
echo "Target:  $DEPLOY_DIR"
echo ""

# --- Build ---
echo "[1/6] Installing dependencies..."
cd "$PROJECT_DIR"
npm ci --production=false

echo "[2/6] Building workspaces..."
npm run backend:build
npm run frontend:build

# --- Deploy ---
echo "[3/6] Deploying files..."
mkdir -p "$DEPLOY_DIR"/{frontend,backend/dist,logs}
mkdir -p "$DATA_DIR"

# Frontend static files
cp -r "$PROJECT_DIR/frontend/dist/." "$DEPLOY_DIR/frontend/"

# Backend
cp -r "$PROJECT_DIR/backend/dist/." "$DEPLOY_DIR/backend/dist/"
cp "$PROJECT_DIR/backend/package.json" "$DEPLOY_DIR/backend/"
cp "$PROJECT_DIR/ecosystem.config.cjs" "$DEPLOY_DIR/"

# Install production deps for backend
echo "[4/6] Installing production dependencies..."
cd "$DEPLOY_DIR/backend"
npm ci --production --ignore-scripts 2>/dev/null || npm install --production --ignore-scripts

# --- PM2 logrotate setup ---
echo "[5/6] Setting up PM2 logrotate..."
if ! pm2 conf | grep -q "pm2-logrotate" 2>/dev/null; then
    pm2 install pm2-logrotate 2>/dev/null || true
fi
pm2 set pm2-logrotate:max_size 50M 2>/dev/null || true
pm2 set pm2-logrotate:retain 7 2>/dev/null || true
pm2 set pm2-logrotate:compress true 2>/dev/null || true

# --- Restart (reload for zero-downtime) ---
echo "[6/6] Reloading backend (zero-downtime)..."
cd "$DEPLOY_DIR"

if pm2 describe "$PM2_APP_NAME" > /dev/null 2>&1; then
    pm2 reload ecosystem.config.cjs --update-env
else
    pm2 start ecosystem.config.cjs
fi

pm2 save

# --- Health check ---
echo ""
echo "Waiting for backend to become healthy (timeout: ${HEALTH_CHECK}s)..."
elapsed=0
while [ "$elapsed" -lt "$HEALTH_CHECK_TIMEOUT" ]; do
    if curl -sf "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
        echo "Health check passed after ${elapsed}s."
        break
    fi
    sleep 2
    elapsed=$((elapsed + 2))
done

if [ "$elapsed" -ge "$HEALTH_CHECK_TIMEOUT" ]; then
    echo "WARNING: Health check did not pass within ${HEALTH_CHECK_TIMEOUT}s."
    echo "Check PM2 logs: pm2 logs $PM2_APP_NAME"
fi

echo ""
echo "=== Deploy complete ==="
echo "Frontend: $DEPLOY_DIR/frontend/"
echo "Backend:  PM2 app '$PM2_APP_NAME' on port 3001"
echo "Data:     $DATA_DIR"
echo ""
echo "Next steps:"
echo "  - Configure nginx (see deploy/nginx.conf.template)"
echo "  - Set up SSL: certbot --nginx -d YOUR_DOMAIN"
echo "  - Check logs: pm2 logs $PM2_APP_NAME"
