#!/usr/bin/env bash
# Publishes the built site to Cloudflare at offlinepage.app (see wrangler.jsonc).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
npx -y wrangler@latest deploy
