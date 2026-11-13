---
title: offline-page
emoji: ✈️
colorFrom: purple
colorTo: gray
sdk: static
app_build_command: npm run build
app_file: dist/index.html
pinned: false
short_description: A writing app with autocorrect that works in airplane mode
models:
  - cfahlgren1/tinyfix
  - cfahlgren1/tinynext
---

# offline.page

A Markdown writing app with autocorrect and autocomplete that run entirely in your browser. About 3 MB of models, no server, and once the page has loaded it keeps working with Wi‑Fi off.

- **tinyfix** ([cfahlgren1/tinyfix](https://huggingface.co/cfahlgren1/tinyfix)) fixes misspellings as you finish a word, and real words in the wrong place ("form → from") about two words later. About 3 ms per check.
- **tinynext** ([cfahlgren1/tinynext](https://huggingface.co/cfahlgren1/tinynext)) suggests the next words in gray; press Tab to take them. It was trained on office email, so it sounds like a memo.

Pages are saved in your browser's local storage, and export as Markdown.

## Development

```sh
npm install
npm run dev     # local dev server
npm run build   # typecheck, build to dist/, and write the offline service worker
```
