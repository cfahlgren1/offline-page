import tailwindcss from "@tailwindcss/vite";
import { marked } from "marked";
import { defineConfig, type Plugin } from "vite";
import { WELCOME_MARKDOWN } from "./src/welcome.ts";

/**
 * Puts the welcome page into index.html as plain HTML, so a first visit shows it (and a search engine reads it) before
 * any script runs. The editor replaces it with the same content. List items get a paragraph inside, as the editor's do,
 * so nothing moves when it takes over.
 */
function welcomeHtml(): string {
  const html = marked
    .parse(WELCOME_MARKDOWN, { async: false })
    .replace(/<li>(.*?)<\/li>/gs, "<li><p>$1</p></li>")
    // No line breaks between blocks: the page keeps white space, as the editor does, so they would show as gaps.
    .replace(/>\s+</g, "><")
    .trim();
  return `<div id="welcome-static" class="tiptap ProseMirror prose">${html}</div>`;
}

/** Moves the stylesheet into index.html, which saves a first visit one round trip before anything is drawn. */
function inlineStyles(): Plugin {
  return {
    name: "inline-styles",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const page = bundle["index.html"];
      if (page?.type !== "asset") throw new Error("index.html is missing from the build.");
      let html = String(page.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type !== "asset" || !name.endsWith(".css")) continue;
        const tag = new RegExp(`<link rel="stylesheet"[^>]*href="\\./${name}"[^>]*>`);
        if (!tag.test(html)) throw new Error(`index.html doesn't link ${name}.`);
        // The stylesheet's own links are relative to assets/, so they're re-pointed from the page.
        const styles = String(file.source).replaceAll("url(./", "url(./assets/");
        html = html.replace(tag, () => `<style>${styles}</style>`);
        delete bundle[name];
      }
      page.source = html;
    },
  };
}

// Relative paths, so the same build works on an HF Space and on offlinepage.app.
export default defineConfig({
  base: "./",
  plugins: [
    tailwindcss(),
    { name: "welcome-page", transformIndexHtml: (html) => html.replace("<!--welcome-->", welcomeHtml()) },
    inlineStyles(),
  ],
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
});
