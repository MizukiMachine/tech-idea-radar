# Frontend

React SPA for Builder Agent Chain.

## Stack

- Vite + React + TypeScript (SWC)
- Vitest + Testing Library
- CSS Variables for theming

## Setup

```bash
# From repo root
npm install
```

Copy `.env.example` to `.env` if needed. Leave `VITE_API_BASE_URL` empty during local Vite development and start from the repository root with `npm run dev`. The root dev stack gives the frontend and backend a shared stack id; the frontend will reject API responses from any other backend. Frontend builds reject explicit `VITE_API_BASE_URL` values unless the exact URL is also listed in `VITE_ALLOWED_API_BASES`; prefer same-origin `/api` proxying for local, preview, and standard deployments.

## Scripts

- `npm run frontend:dev` - Start dev server only when launched by the root dev stack. For solo debugging, set `BAC_ALLOW_FRONTEND_SOLO=true` intentionally.
- `npm run frontend:build` - Production build
- `npm run frontend:preview` - Preview `dist` through the verified dev-stack proxy
- `npm run frontend:test` - Run tests

## Testing

- Vitest with `@testing-library/react`
- Tests in `src/__tests__/`
