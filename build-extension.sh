#!/usr/bin/env bash
# Build the extensions.gnome.org upload bundle.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/dist"

mkdir -p "$OUT"
rm -f "$OUT"/web-search-provider@adnantabrezi.github.com.shell-extension.zip

# gnome-extensions pack compiles/collects the GSettings schema and bundles
# metadata.json, extension.js, prefs.js and anything passed via --extra-source.
gnome-extensions pack --force \
    --extra-source=engines.js \
    --out-dir="$OUT" \
    "$HERE/extension"

echo
echo "Bundle: $OUT/web-search-provider@adnantabrezi.github.com.shell-extension.zip"
