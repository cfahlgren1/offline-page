import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Relative paths, so the same build works on an HF Space and on offline.page.
export default defineConfig({
  base: "./",
  plugins: [tailwindcss()],
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
});
