import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
      },
      "/health": {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
});
