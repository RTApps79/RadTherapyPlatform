import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

// RTApps RadTherapyPlatform
// Vite config for local dev, production build, and GitHub Pages deployment.
//
// NOTE: If deploying to https://<user>.github.io/RadTherapyPlatform/,
// set `base` below to "/RadTherapyPlatform/". Leave as "/" for a custom
// domain, Netlify/Vercel, or when serving from the domain root.
export default defineConfig({
  base: "/RadTherapyPlatform/",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
      "@services": fileURLToPath(new URL("./src/services", import.meta.url)),
      "@models": fileURLToPath(new URL("./src/models", import.meta.url)),
      "@modules": fileURLToPath(new URL("./src/modules", import.meta.url)),
      "@shell": fileURLToPath(new URL("./src/shell", import.meta.url)),
      "@config": fileURLToPath(new URL("./src/config", import.meta.url)),
      "@styles": fileURLToPath(new URL("./src/styles", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: "es2022",
    sourcemap: true,
    outDir: "dist",
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
