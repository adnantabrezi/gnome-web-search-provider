#!/usr/bin/env bash
# Build the extensions.gnome.org upload bundle (run from the extension dir).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/../dist"

mkdir -p "$OUT"
rm -f "$OUT"/web-search-provider@adnantabrezi.github.com.shell-extension.zip

gnome-extensions pack --force \
    --extra-source=engines.js \
    --out-dir="$OUT" \
    "$HERE"

echo
echo "Bundle: $OUT/web-search-provider@adnantabrezi.github.com.shell-extension.zip"
