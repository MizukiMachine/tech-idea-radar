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
PM2_APP_NAME="builder-agent-chain"

echo "=== Builder Agent Chain Deploy ==="
echo "Project: $PROJECT_DIR"
echo "Target:  $DEPLOY_DIR"
echo ""

# --- Build ---
echo "[1/5] Installing dependencies..."
cd "$PROJECT_DIR"
npm ci --production=false

echo "[2/5] Building workspaces..."
npm run backend:build
npm run frontend:build

# --- Deploy ---
echo "[3/5] Deploying files..."
mkdir -p "$DEPLOY_DIR"/{frontend,backend/dist,logs}

# Frontend static files
cp -r "$PROJECT_DIR/frontend/dist/." "$DEPLOY_DIR/frontend/"

# Backend
cp -r "$PROJECT_DIR/backend/dist/." "$DEPLOY_DIR/backend/dist/"
cp "$PROJECT_DIR/backend/package.json" "$DEPLOY_DIR/backend/"
cp "$PROJECT_DIR/ecosystem.config.cjs" "$DEPLOY_DIR/"

# Install production deps for backend
echo "[4/5] Installing production dependencies..."
cd "$DEPLOY_DIR/backend"
npm ci --production --ignore-scripts 2>/dev/null || npm install --production --ignore-scripts

# --- Restart ---
echo "[5/5] Restarting backend..."
cd "$DEPLOY_DIR"

if pm2 describe "$PM2_APP_NAME" > /dev/null 2>&1; then
    pm2 restart ecosystem.config.cjs --update-env
else
    pm2 start ecosystem.config.cjs
fi

pm2 save

echo ""
echo "=== Deploy complete ==="
echo "Frontend: $DEPLOY_DIR/frontend/"
echo "Backend:  PM2 app '$PM2_APP_NAME' on port 3001"
echo ""
echo "Next steps:"
echo "  - Configure nginx (see deploy/nginx.conf.template)"
echo "  - Set up SSL: certbot --nginx -d YOUR_DOMAIN"
echo "  - Check logs: pm2 logs $PM2_APP_NAME"
