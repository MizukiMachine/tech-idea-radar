import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const proxyTarget = process.env.VITE_PROXY_TARGET;
  const devStackId = process.env.VITE_DEV_STACK_ID;
  const envFileApiBase = env.VITE_API_BASE_URL?.trim() ?? "";
  const isPreview = process.env.npm_lifecycle_event === "preview";
  const requiresProxyTarget = command !== "build" && !isPreview;

  if (requiresProxyTarget && !proxyTarget) {
    throw new Error("VITE_PROXY_TARGET is required for the dev server. Use `npm run dev` from the repository root.");
  }

  if (requiresProxyTarget && !devStackId && process.env.BAC_ALLOW_FRONTEND_SOLO !== "true") {
    throw new Error("VITE_DEV_STACK_ID is required for the dev server. Use `npm run dev` from the repository root.");
  }

  if (requiresProxyTarget && devStackId && envFileApiBase) {
    throw new Error("VITE_API_BASE_URL must be empty during local dev-stack runs. The frontend must use the verified Vite /api proxy.");
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
