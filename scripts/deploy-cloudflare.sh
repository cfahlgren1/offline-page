#!/usr/bin/env bash
# Publishes the built site to Cloudflare at offlinepage.app (see wrangler.jsonc).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
# no-transform stops Cloudflare from adding its analytics script to the page: the app loads nothing from other sites.
cat > dist/_headers <<'HEADERS'
/
  Cache-Control: public, max-age=0, must-revalidate, no-transform
/index.html
  Cache-Control: public, max-age=0, must-revalidate, no-transform
HEADERS
npx -y wrangler@latest deploy
rm dist/_headers
