#!/usr/bin/env node

if (process.env.BAC_ALLOW_UNSAFE_VITE_PREVIEW === 'true') {
  console.warn('[frontend] BAC_ALLOW_UNSAFE_VITE_PREVIEW=true; running raw vite preview without dev-stack backend verification.');
  process.exit(0);
}

console.error([
  '[frontend] Refusing to run raw vite preview.',
  'It does not attach the dev-stack API boundary header and can serve stale bundles with the wrong backend.',
  'Use `npm run preview:stack` from the repository root, or set BAC_ALLOW_UNSAFE_VITE_PREVIEW=true only for an intentionally isolated static preview.',
].join('\n'));
process.exit(1);
