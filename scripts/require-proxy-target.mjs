#!/usr/bin/env node
if (!process.env.VITE_PROXY_TARGET) {
  console.error('[frontend] VITE_PROXY_TARGET is required for frontend dev. Use `npm run dev` from the repository root.');
  process.exit(1);
}

if (!process.env.VITE_DEV_STACK_ID && process.env.BAC_ALLOW_FRONTEND_SOLO !== 'true') {
  console.error('[frontend] VITE_DEV_STACK_ID is required for frontend dev. Use `npm run dev` from the repository root so frontend and backend share one verified dev stack.');
  process.exit(1);
}
