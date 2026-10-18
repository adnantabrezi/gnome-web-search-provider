# GNOME Web Search Provider

Adds a **web search provider to the GNOME Shell overview search**, with support for
your browser's **bookmarks** and **history**, plus a small settings app to pick
the search engine and what gets shown.

Type a query in Activities and you get:

- matching **bookmarks** and **history** entries (click to open),
- a fallback **“<engine> search for …”** action that opens your chosen engine,
- all of it reorderable/toggleable in **Settings → Search**.

> **Two flavours — install one.**
>
> * **[`extension/`](extension/) — a real GNOME Shell extension.** Preferences
>   live in the **Extensions** app (gear button), and it can be published on
>   [extensions.gnome.org](https://extensions.gnome.org). It *cannot* appear in
>   **Settings → Search**.
> * **`src/` + `data/` — an external D-Bus search provider.** This is the only
>   kind that shows up in **Settings → Search** (so you can reorder it), but it
>   has no preferences hook in the Extensions app — hence the small standalone
>   settings app.
>
> Don't enable both at once: every query would then be answered twice.

---

## Features

- **Overview search integration** — results appear in the Activities search,
  grouped under one section.
- **Bookmarks & history** from Brave/Chromium profiles, matched against the
  query (all typed words must match the title or URL).
- **Selectable search engine** — Brave, Google, DuckDuckGo, Bing, Startpage,
  Ecosia, Qwant, Wikipedia, or a custom URL template.
- **Toggles** for the search action, bookmarks and history, plus result limits.
- **Settings app** built with GTK4 / libadwaita.
- **Fast** — results are served in ~15 ms; the D-Bus service is activated on
  demand and stays resident.
- **Noise filtering** — skips `chrome://`/`about:` URLs, search-result pages,
  and absurdly long URLs.

---

## Requirements

- GNOME Shell **45+** (Settings → Search provider list; tested on **51**).
- Python **3** with PyGObject (`python-gobject`).
- GTK4 + libadwaita for the settings app (`gtk4`, `libadwaita`).
- A Chromium-based browser profile (currently **Brave** is scanned by default).

---

## Extension (GNOME Extensions / extensions.gnome.org)

A self-contained Shell extension lives in [`extension/`](extension/). It adds
the same results to the overview search and puts its **preferences in the
Extensions app** (gear button) — no standalone app involved.

```bash
./build-extension.sh          # -> dist/web-search-provider@adnantabrezi.github.com.shell-extension.zip
gnome-extensions install --force dist/web-search-provider@adnantabrezi.github.com.shell-extension.zip
```

Log out/in (Wayland), then enable **Web Search** in the Extensions app. See
[`extension/README.md`](extension/README.md) for the full details and the
extensions.gnome.org upload steps.

**Trade-off:** a Shell extension cannot be listed under **Settings → Search**,
and running it alongside the provider below produces duplicate results.

## Provider install (appears in Settings → Search)

```bash
git clone https://github.com/adnantabrezi/gnome-web-search-provider.git
cd gnome-web-search-provider
sudo ./install.sh
```

Then **log out and back in** once (on Wayland the Shell cannot be restarted in
place; this lets the Shell pick up the new provider).

After that, open **Settings → Search → Search Results** and drag
**Web Search** to the top.

### Manual install

```bash
sudo install -Dm755 src/search-provider  /usr/local/bin/brave-search-provider
sudo install -Dm755 src/settings         /usr/local/bin/brave-search-settings
sudo install -Dm644 data/io.github.adnan.BraveSearch.search-provider.ini \
    /usr/local/share/gnome-shell/search-providers/
sudo install -Dm644 data/io.github.adnan.BraveSearch.service \
    /usr/local/share/dbus-1/services/
sudo install -Dm644 data/io.github.adnan.BraveSearch.desktop \
    /usr/local/share/applications/
sudo install -Dm644 data/io.github.adnan.BraveSearch.Settings.desktop \
    /usr/local/share/applications/

# make the Shell prioritise it (run as your user, not root)
gsettings set org.gnome.desktop.search-providers sort-order \
  "['io.github.adnan.BraveSearch.desktop', 'org.gnome.Settings.desktop']"
```

---

## Usage

1. Press **Super** and start typing.
2. Pick a **bookmark/history** hit to open it, or the
   **“<engine> search for …”** row to search the web.
3. Reorder or disable the provider in **Settings → Search**.

### Settings

Open the settings app any of these ways:

- App grid → **Web Search Settings**
- Right-click the **Web Search** icon → **Settings**
- Terminal → `brave-search-settings`

| Setting | Description |
|---|---|
| Default search engine | Engine used for the search action |
| Custom search URL | Template with `{query}` (terms are appended if omitted) |
| Search action / Bookmarks / History | Toggle each source |
| Max bookmarks / Max history | 0–10 results each |

Settings are stored in `~/.config/brave-search-provider/config.json` and applied
immediately (the provider re-reads the file on every search).

---

## How it works

| Piece | Path | Role |
|---|---|---|
| D-Bus service | `src/search-provider` → `/usr/local/bin/brave-search-provider` | Implements `org.gnome.Shell.SearchProvider2` |
| D-Bus activation | `data/io.github.adnan.BraveSearch.service` | Starts the service on first query |
| Provider definition | `data/io.github.adnan.BraveSearch.search-provider.ini` | Tells the Shell which desktop id/D-Bus name/path to use |
| Desktop entries | `data/*.desktop` | Name, icon and the settings action |
| Settings app | `src/settings` → `/usr/local/bin/brave-search-settings` | GTK4/libadwaita preferences |

Data sources read locally (read-only):

- bookmarks — `~/.config/BraveSoftware/Brave-Browser/*/Bookmarks` (JSON)
- history — `~/.config/BraveSoftware/Brave-Browser/*/History` (SQLite, opened
  with `immutable=1` so it works while the browser is running)

The Shell only scans **system** data dirs for `gnome-shell/search-providers`
(the user dir is ignored), which is why the `.ini` is installed under
`/usr/local/share`.

---

## Configuration reference

`~/.config/brave-search-provider/config.json`:

```json
{
  "engine": "brave",
  "custom_url": "",
  "search_results": true,
  "bookmarks": true,
  "history": true,
  "max_bookmarks": 3,
  "max_history": 4
}
```

---

## Troubleshooting

- **Nothing shows up after installing:** log out/in once (Wayland), or reload the
  session bus in place:
  `dbus-send --session --type=method_call --dest=org.freedesktop.DBus / org.freedesktop.DBus.ReloadConfig`
- **provider not listed in Settings:** confirm the `.ini` exists in
  `/usr/local/share/gnome-shell/search-providers/` and that `XDG_DATA_DIRS`
  contains `/usr/local/share`.
- **Typed fast and it searched the wrong thing:** GNOME activates a cached
  result if you press Enter before its ~150 ms search debounce settles. This
  project mitigates it by preferring the freshly-typed terms on activation.
- **Extra “Web Search” entry in the app grid:** unavoidable — the Shell only
  loads external providers whose desktop file is displayable (`should_show()`).

---

## Uninstall

For the external provider:

```bash
sudo ./uninstall.sh
```

For the extension:

```bash
gnome-extensions uninstall web-search-provider@adnantabrezi.github.com
```

---

## Limitations / roadmap

- History/bookmarks are read from **Brave** profiles only (paths are easy to
  extend to Chrome/Chromium/Vivaldi).
- GNOME Shell caps a provider at **5 rows** in the overview.

---

## License

MIT — see [LICENSE](LICENSE).
