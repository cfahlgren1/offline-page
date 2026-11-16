import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// The whole site is one prerendered page: static files in dist/, served by Cloudflare and by an HF Space.
export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter: adapter({ pages: "dist", assets: "dist" }),
      // The stylesheet goes into the page itself, which saves a first visit one round trip before anything is drawn.
      inlineStyleThreshold: Infinity,
      // scripts/write-service-worker.mjs writes sw.js after the build, and src/lib/offlineCache.ts registers it.
      serviceWorker: { register: false },
    }),
  ],
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
});
