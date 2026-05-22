#!/usr/bin/env node
if (!process.env.VITE_PROXY_TARGET) {
  console.error('[frontend] VITE_PROXY_TARGET is required for frontend dev. Use `npm run dev` from the repository root.');
  process.exit(1);
}
