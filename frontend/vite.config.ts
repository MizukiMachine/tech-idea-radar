import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig(({ command }) => {
  const proxyTarget = process.env.VITE_PROXY_TARGET;
  const isPreview = process.env.npm_lifecycle_event === "preview";
  const requiresProxyTarget = command !== "build" && !isPreview;

  if (requiresProxyTarget && !proxyTarget) {
    throw new Error("VITE_PROXY_TARGET is required for the dev server. Use `npm run dev` from the repository root.");
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: proxyTarget ? {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/health": {
          target: proxyTarget,
          changeOrigin: true,
        },
      } : undefined,
    },
    preview: {
      port: 4173,
    },
  };
});
