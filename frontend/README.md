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

Copy `.env.example` to `.env` and set `VITE_API_BASE_URL` if needed (defaults to `http://localhost:3001`).

## Scripts

- `npm run frontend:dev` - Start dev server
- `npm run frontend:build` - Production build
- `npm run frontend:test` - Run tests

## Testing

- Vitest with `@testing-library/react`
- Tests in `src/__tests__/`
