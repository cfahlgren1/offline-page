/** Finds an element that index.html is expected to have, and fails loudly when it's missing. */
export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id} in index.html.`);
  return found as T;
}
