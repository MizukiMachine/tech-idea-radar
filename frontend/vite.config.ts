import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";

function envValue(env: Record<string, string>, name: string): string {
  return (process.env[name] ?? env[name] ?? "").trim();
}

function normalizeApiBase(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    if (url.pathname === "/") url.pathname = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/\/$/, "");
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const proxyTarget = process.env.VITE_PROXY_TARGET;
  const devStackId = process.env.VITE_DEV_STACK_ID;
  const rawApiBase = normalizeApiBase(envValue(env, "VITE_API_BASE_URL"));
  const allowedApiBases = envValue(env, "VITE_ALLOWED_API_BASES")
    .split(",")
    .map((value) => normalizeApiBase(value.trim()))
    .filter(Boolean);
  const isPreview = process.env.npm_lifecycle_event === "preview";
  const requiresProxyTarget = command !== "build" && !isPreview;

  if (requiresProxyTarget && !proxyTarget) {
    throw new Error("VITE_PROXY_TARGET is required for the dev server. Use `npm run dev` from the repository root.");
  }

  if (requiresProxyTarget && !devStackId && process.env.BAC_ALLOW_FRONTEND_SOLO !== "true") {
    throw new Error("VITE_DEV_STACK_ID is required for the dev server. Use `npm run dev` from the repository root.");
  }

  if (requiresProxyTarget && devStackId && rawApiBase) {
    throw new Error("VITE_API_BASE_URL must be empty during local dev-stack runs. The frontend must use the verified Vite /api proxy.");
  }

  if (rawApiBase && !allowedApiBases.includes(rawApiBase)) {
    throw new Error([
      `Refusing to run frontend with VITE_API_BASE_URL=${rawApiBase}.`,
      "Frontend runs must use the same-origin API path by default.",
      "If this is an intentional production/staging split API deployment, add the exact base URL to VITE_ALLOWED_API_BASES.",
    ].join(" "));
  }

  const proxyHeaders = devStackId ? { "X-BAC-Dev-Stack-Id": devStackId } : undefined;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: proxyTarget ? {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          headers: proxyHeaders,
        },
        "/health": {
          target: proxyTarget,
          changeOrigin: true,
          headers: proxyHeaders,
        },
      } : undefined,
    },
    preview: {
      port: 4173,
    },
  };
});
