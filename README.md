---
title: offline-page
emoji: ✈️
colorFrom: purple
colorTo: gray
sdk: static
app_file: index.html
pinned: false
short_description: A writing app with autocorrect that works in airplane mode
models:
  - paperweight/tinyfix
  - paperweight/tinynext
---

# offline.page

A Markdown writing app with autocorrect and autocomplete that run entirely in your browser. About 15 MB of models, no server, and once the page has loaded it keeps working with Wi‑Fi off.

- **tinyfix** ([paperweight/tinyfix](https://huggingface.co/paperweight/tinyfix)) fixes misspellings as you finish a word, and real words in the wrong place ("form → from") about two words later. About 3 ms per check.
- **tinynext** ([paperweight/tinynext](https://huggingface.co/paperweight/tinynext)) suggests the next few words in gray; press Tab to take them. It's a 12.5M-parameter transformer that reads the text around the cursor, trained on articles, chat and office email.

Pages are saved in your browser's local storage, and export as Markdown.

## Development

```sh
npm install
npm run dev     # local dev server
npm run build   # typecheck, build to dist/, and write the offline service worker
```
