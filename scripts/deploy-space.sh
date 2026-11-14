#!/usr/bin/env bash
# Publishes the built site to the Hugging Face Space. The Space serves dist/ as is, with no build step on the Hub,
# because org Spaces need credits to build. The source lives on GitHub.
set -euo pipefail
cd "$(dirname "$0")/.."
SPACE="${SPACE:-paperweight/offline-page}"
npm run build
stage="$(mktemp -d)"
cp -R dist/. "$stage/"
cp README.md "$stage/README.md"
# Keep the Space's .gitattributes (which large files are stored with LFS), since --delete clears everything else.
hf download "$SPACE" .gitattributes --repo-type space --local-dir "$stage" >/dev/null
rm -rf "$stage/.cache"
hf upload "$SPACE" "$stage" . --repo-type space --delete "*" --commit-message "${1:-deploy the built site}"
rm -rf "$stage"
