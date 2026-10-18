# Web Search — GNOME Shell extension

A GNOME Shell extension that adds a **search provider to the Activities
overview**: type a query and get matching browser **bookmarks** and **history**
plus a **"‹engine› search for …"** action, with **preferences in the Extensions
app**.

This is the [extensions.gnome.org](https://extensions.gnome.org) friendly
flavour of the project. It is self-contained JavaScript — no D-Bus service, no
files outside the extension directory.

> Unlike the external provider in the parent directory, a Shell extension
> **cannot** appear in **Settings → Search**. If you want that, use the D-Bus
> provider instead — and don't run both at once, or every query returns
> duplicate rows.

## Features

- Overview search integration (one provider, up to 5 rows).
- Bookmarks and history from Brave/Chromium profiles, matched against the query.
- Selectable engine: Brave, Google, DuckDuckGo, Bing, Startpage, Ecosia, Qwant,
  Wikipedia (or a custom URL template).
- Toggles for the search action, bookmarks and history, plus result limits.
- Preferences in the **Extensions** app (gear button) /
  `gnome-extensions prefs`.
- Graceful degradation: history is skipped automatically if `sqlite3` is not
  installed.

## Requirements

- GNOME Shell **45–51**.
- A Chromium-based browser profile (Brave is scanned by default).
- `sqlite3` for history results (bookmarks and web search work without it).

## Install

### From extensions.gnome.org

Open the extension page and flip the switch.

### From a bundle

```sh
gnome-extensions install --force web-search-provider@adnantabrezi.github.com.shell-extension.zip
# then log out and back in, and enable it:
gnome-extensions enable web-search-provider@adnantabrezi.github.com
```

### From source

```sh
cp -r . ~/.local/share/gnome-shell/extensions/web-search-provider@adnantabrezi.github.com
glib-compile-schemas ~/.local/share/gnome-shell/extensions/web-search-provider@adnantabrezi.github.com/schemas/
```

Log out and back in (required on Wayland), then enable **Web Search** in the
Extensions app.

## Settings

Open **Extensions → Web Search → Settings** (the gear button), or run:

```sh
gnome-extensions prefs web-search-provider@adnantabrezi.github.com
```

| Setting | Description |
|---|---|
| Default search engine | Engine used for the search action |
| Custom search URL | Template with `{query}` (appended if the placeholder is absent) |
| Search action / Bookmarks / History | Toggle each source |
| Bookmarks / History count | 0–10 results each |

Settings are stored in dconf under `org.gnome.shell.extensions.websearch`.

## Build a bundle

```sh
./build.sh          # writes dist/web-search-provider@adnantabrezi.github.com.shell-extension.zip
```

or from the repository root:

```sh
./build-extension.sh
```

## How it works

| File | Role |
|---|---|
| `extension.js` | Registers a provider via `Main.overview.searchController.addProvider()` |
| `prefs.js` | Preferences UI (GTK4 / libadwaita) |
| `engines.js` | Shared engine table |
| `metadata.json` | Extension metadata (uuid, shell-version, settings-schema) |
| `schemas/` | GSettings schema for the preferences |

Data sources (read-only):

- bookmarks — `~/.config/BraveSoftware/Brave-Browser/*/Bookmarks` (JSON, parsed
  and cached until the file changes)
- history — `~/.config/BraveSoftware/Brave-Browser/*/History` (SQLite, queried
  through `sqlite3 -readonly 'file:…?immutable=1'` so it works while the browser
  is running)

## License

MIT — see [../LICENSE](../LICENSE).
