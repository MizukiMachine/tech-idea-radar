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

Copy `.env.example` to `.env` if needed. Leave `VITE_API_BASE_URL` empty during local Vite development to use the built-in `/api` proxy.

## Scripts

- `npm run frontend:dev` - Start dev server
- `npm run frontend:build` - Production build
- `npm run frontend:test` - Run tests

## Testing

- Vitest with `@testing-library/react`
- Tests in `src/__tests__/`
