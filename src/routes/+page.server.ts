import { marked } from "marked";
import { WELCOME_MARKDOWN } from "#lib/welcome";

/**
 * The welcome page as plain HTML, made at build time. The editor replaces it with the same content. List items get a
 * paragraph inside, as the editor's do, so nothing moves when it takes over.
 */
export function load() {
  const welcomeHtml = marked
    .parse(WELCOME_MARKDOWN, { async: false })
    .replace(/<li>(.*?)<\/li>/gs, "<li><p>$1</p></li>")
    // No line breaks between blocks: the page keeps white space, as the editor does, so they would show as gaps.
    .replace(/>\s+</g, "><")
    .trim();
  return { welcomeHtml };
}
