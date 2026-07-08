import { defineConfig } from "vitest/config";

const backendTarget = "http://127.0.0.1:8080";

export default defineConfig({
  base: "/-/",
  publicDir: false,
  build: {
    outDir: "../backend/internal/assets/web",
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
    },
    proxy: {
      "/-/api": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/-/raw": {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
  },
});
