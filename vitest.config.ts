import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "ai-engine",
          include: ["ai-engine/tests/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "backend",
          include: ["backend/tests/**/*.spec.ts"],
        },
      },
      {
        test: {
          name: "frontend",
          include: ["frontend/src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["frontend/vitest.setup.ts"],
          globals: true,
        },
      },
    ],
  },
});
