#!/usr/bin/env bash
# Remove the GNOME Web Search Provider (must be run as root).
set -euo pipefail

PREFIX="${PREFIX:-/usr/local}"

if [[ $EUID -ne 0 ]]; then
    echo "Please run as root:  sudo ./uninstall.sh" >&2
    exit 1
fi

pkill -f "$PREFIX/bin/brave-search-provider" 2>/dev/null || true

rm -f "$PREFIX/bin/brave-search-provider" \
      "$PREFIX/bin/brave-search-settings" \
      "$PREFIX/share/gnome-shell/search-providers/io.github.adnan.BraveSearch.search-provider.ini" \
      "$PREFIX/share/dbus-1/services/io.github.adnan.BraveSearch.service" \
      "$PREFIX/share/applications/io.github.adnan.BraveSearch.desktop" \
      "$PREFIX/share/applications/io.github.adnan.BraveSearch.Settings.desktop"

update-desktop-database "$PREFIX/share/applications" >/dev/null 2>&1 || true

echo "Removed. (User config left at ~/.config/brave-search-provider/ — delete it manually if you want.)"
echo "Log out/in to drop it from the Shell."
