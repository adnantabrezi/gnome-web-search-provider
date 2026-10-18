#!/usr/bin/env bash
# Install the GNOME Web Search Provider (must be run as root).
set -euo pipefail

PREFIX="${PREFIX:-/usr/local}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $EUID -ne 0 ]]; then
    echo "Please run as root:  sudo ./install.sh" >&2
    exit 1
fi

echo "Installing to $PREFIX ..."

install -Dm755 "$HERE/src/search-provider" "$PREFIX/bin/brave-search-provider"
install -Dm755 "$HERE/src/settings"        "$PREFIX/bin/brave-search-settings"

install -Dm644 "$HERE/data/io.github.adnan.BraveSearch.search-provider.ini" \
    "$PREFIX/share/gnome-shell/search-providers/io.github.adnan.BraveSearch.search-provider.ini"
install -Dm644 "$HERE/data/io.github.adnan.BraveSearch.service" \
    "$PREFIX/share/dbus-1/services/io.github.adnan.BraveSearch.service"
install -Dm644 "$HERE/data/io.github.adnan.BraveSearch.desktop" \
    "$PREFIX/share/applications/io.github.adnan.BraveSearch.desktop"
install -Dm644 "$HERE/data/io.github.adnan.BraveSearch.Settings.desktop" \
    "$PREFIX/share/applications/io.github.adnan.BraveSearch.Settings.desktop"

# Keep the D-Bus service pointing at the installed binary.
sed -i "s#^Exec=.*#Exec=$PREFIX/bin/brave-search-provider#" \
    "$PREFIX/share/dbus-1/services/io.github.adnan.BraveSearch.service"

update-desktop-database "$PREFIX/share/applications" >/dev/null 2>&1 || true

TARGET_USER="${SUDO_USER:-}"
if [[ -n "$TARGET_USER" && "$TARGET_USER" != "root" ]]; then
    echo "Prioritising the provider for user '$TARGET_USER' ..."
    runuser -u "$TARGET_USER" -- gsettings set org.gnome.desktop.search-providers \
        sort-order "['io.github.adnan.BraveSearch.desktop', 'org.gnome.Settings.desktop', 'org.gnome.Contacts.desktop', 'org.gnome.Nautilus.desktop']" \
        2>/dev/null || echo "  (could not set sort-order automatically; see README)"
fi

cat <<'EOF'

Done.

Next steps:
  1. Log out and back in (required on Wayland so GNOME Shell loads the provider).
  2. Open Settings -> Search and drag "Web Search" to the top.
  3. Configure engines in the "Web Search Settings" app.
EOF
