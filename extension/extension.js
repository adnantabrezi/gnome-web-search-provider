// SPDX-License-Identifier: MIT
//
// Web Search — GNOME Shell overview search provider.
//
// Adds one provider to the Activities search that returns, for the typed
// query:
//   * matching browser bookmarks   (from <profile>/Bookmarks, JSON)
//   * matching browser history     (from <profile>/History, SQLite, read-only)
//   * a "<Engine> search for …"    action
//
// The engine and which sources are included are configured from the
// extension's preferences (Extensions app → Web Search → Settings), backed by
// the org.gnome.shell.extensions.websearch GSettings schema.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {engineInfo, buildSearchUrl} from './engines.js';

const MAX_ROWS = 5;          // GNOME shows at most 5 rows per list provider
const MAX_URL_LEN = 2048;    // skip absurdly long URLs
const MAX_TEXT_LEN = 160;    // max length of a displayed title

const SEARCH_PREFIX = 'search:';
const BOOKMARK_PREFIX = 'bookmark:';
const HISTORY_PREFIX = 'history:';

const FALLBACK_ICON = 'web-browser-symbolic';
const BOOKMARK_ICON = 'user-bookmarks-symbolic';
const HISTORY_ICON = 'document-open-recent-symbolic';

const SKIP_URL_PREFIXES = [
    'chrome://',
    'chrome-extension://',
    'devtools://',
    'about:',
    'brave://',
];

// Search-result pages add noise when browsing history.
const SKIP_URL_PATTERNS = [
    'search.brave.com/search?',
    'google.com/search?',
    'duckduckgo.com/?q=',
    'bing.com/search?',
    'search.yahoo.com/search?',
    'youtube.com/results?search_query=',
];

/** @returns {boolean} whether a history URL should be ignored */
function isSkippedUrl(url) {
    if (!url || url.length > MAX_URL_LEN)
        return true;
    if (SKIP_URL_PREFIXES.some(prefix => url.startsWith(prefix)))
        return true;
    return SKIP_URL_PATTERNS.some(pattern => url.includes(pattern));
}

/** @returns {string} text truncated to MAX_TEXT_LEN characters */
function shorten(text, limit = MAX_TEXT_LEN) {
    const value = (text ?? '').trim();
    return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

/** Escape a term for use inside a SQL LIKE pattern. */
function likePattern(term) {
    return `%${term.replace(/[\\%_]/g, ch => `\\${ch}`)}%`;
}

/** Quote a string as a SQL literal. */
function sqlString(value) {
    return `'${value.replaceAll("'", "''")}'`;
}

class WebSearchProvider {
    /**
     * @param {Extension} extension - the owning extension
     */
    constructor(extension) {
        this._extension = extension;
        this._settings = extension.getSettings();

        this._metas = new Map();
        this._bookmarkCache = null;
        this._profileCache = null;

        this._sqlite = GLib.find_program_in_path('sqlite3');
    }

    /** @type {string} */
    get id() {
        return this._extension.uuid;
    }

    /**
     * Returning null gives the grid display used by other extensions.
     *
     * @type {Gio.AppInfo|null}
     */
    get appInfo() {
        return null;
    }

    /** @type {boolean} */
    get canLaunchSearch() {
        return this._settings.get_boolean('search-results');
    }

    /**
     * @param {string[]} terms - the search terms
     * @param {Gio.Cancellable} cancellable - cancellation for this search
     * @returns {Promise<string[]>} result identifiers
     */
    async getInitialResultSet(terms, cancellable) {
        return this._search(terms, cancellable);
    }

    /**
     * @param {string[]} _previousResults - results of the previous search
     * @param {string[]} terms - the search terms
     * @param {Gio.Cancellable} cancellable - cancellation for this search
     * @returns {Promise<string[]>} result identifiers
     */
    async getSubsearchResultSet(_previousResults, terms, cancellable) {
        return this._search(terms, cancellable);
    }

    /**
     * @param {string[]} results - result identifiers
     * @param {number} maxResults - maximum number of results to return
     * @returns {string[]} the truncated result set
     */
    filterResults(results, maxResults) {
        return results.slice(0, maxResults);
    }

    /**
     * @param {string[]} ids - result identifiers
     * @returns {Promise<object[]>} result metadata
     */
    getResultMetas(ids) {
        return Promise.resolve(ids.map(id => this._metas.get(id) ?? {
            id,
            name: this._nameFromId(id),
            createIcon: size => this._icon(FALLBACK_ICON, size),
        }));
    }

    /**
     * @param {string} id - result identifier
     * @param {string[]} terms - the current search terms
     */
    activateResult(id, terms) {
        if (id.startsWith(BOOKMARK_PREFIX) || id.startsWith(HISTORY_PREFIX)) {
            this._open(id.slice(id.indexOf(':') + 1));
            return;
        }

        // Prefer freshly typed terms: the Shell may activate a cached result
        // when Enter is pressed before the search settles.
        const query = terms.join(' ').trim() || this._queryFromId(id);
        if (query)
            this._open(this._searchUrl(query));
    }

    /**
     * @param {string[]} terms - the current search terms
     */
    launchSearch(terms) {
        const query = terms.join(' ').trim();
        if (query)
            this._open(this._searchUrl(query));
    }

    destroy() {
        this._metas.clear();
        this._bookmarkCache = null;
        this._profileCache = null;
        this._settings = null;
        this._extension = null;
    }

    // ------------------------------------------------------------------ //
    // Search
    // ------------------------------------------------------------------ //

    /**
     * @param {string[]} terms - the search terms
     * @param {Gio.Cancellable} cancellable - cancellation for this search
     * @returns {Promise<string[]>} result identifiers
     */
    async _search(terms, cancellable) {
        const query = terms.join(' ').trim();
        if (!query)
            return [];

        const termsLower = terms.filter(term => term).map(term => term.toLowerCase());
        const settings = this._settings;

        const includeSearch = settings.get_boolean('search-results');
        const budget = Math.max(0, MAX_ROWS - (includeSearch ? 1 : 0));

        const bookmarks = [];
        const history = [];
        const seen = new Set();

        const matches = text => {
            const haystack = text.toLowerCase();
            return termsLower.every(term => haystack.includes(term));
        };

        if (settings.get_boolean('bookmarks')) {
            const max = settings.get_int('max-bookmarks');
            for (const item of this._bookmarks()) {
                if (bookmarks.length >= max || bookmarks.length >= budget)
                    break;
                if (!item.url || seen.has(item.url) || !matches(`${item.name} ${item.url}`))
                    continue;
                seen.add(item.url);
                bookmarks.push({url: item.url, name: shorten(item.name), icon: BOOKMARK_ICON});
            }
        }

        if (settings.get_boolean('history') && this._sqlite) {
            const max = settings.get_int('max-history');
            for (const item of await this._history(termsLower, max, cancellable)) {
                if (history.length >= max || history.length >= budget)
                    break;
                if (seen.has(item.url))
                    continue;
                seen.add(item.url);
                history.push({url: item.url, name: shorten(item.title), icon: HISTORY_ICON});
            }
        }

        this._metas.clear();
        const ids = [];

        for (const item of [...bookmarks, ...history].slice(0, budget)) {
            const id = `${item.icon === BOOKMARK_ICON ? BOOKMARK_PREFIX : HISTORY_PREFIX}${item.url}`;
            this._metas.set(id, {
                id,
                name: item.name,
                description: item.url,
                createIcon: size => this._icon(item.icon, size),
            });
            ids.push(id);
        }

        if (includeSearch) {
            const info = engineInfo(settings.get_string('engine'),
                settings.get_string('custom-url'));
            const id = SEARCH_PREFIX + query;
            this._metas.set(id, {
                id,
                name: `Search ${info.name} for “${shorten(query)}”`,
                description: 'Open in your web browser',
                createIcon: size => this._icon(info.icon, size),
            });
            ids.push(id);
        }

        return ids;
    }

    // ------------------------------------------------------------------ //
    // Data sources
    // ------------------------------------------------------------------ //

    /** @returns {string[]} every Brave/Chromium profile directory */
    _profiles() {
        if (this._profileCache)
            return this._profileCache;

        const base = GLib.build_filenamev([GLib.get_home_dir(), '.config', 'BraveSoftware']);
        const profiles = [];

        for (const entry of this._listDirs(base)) {
            if (!entry.startsWith('Brave-Browser'))
                continue;
            const root = GLib.build_filenamev([base, entry]);
            for (const sub of this._listDirs(root)) {
                if (sub === 'Default' || sub.startsWith('Profile '))
                    profiles.push(GLib.build_filenamev([root, sub]));
            }
        }

        this._profileCache = profiles;
        return profiles;
    }

    /** @returns {string[]} directory names inside path (empty on error) */
    _listDirs(path) {
        const names = [];
        let enumerator;
        try {
            enumerator = Gio.File.new_for_path(path).enumerate_children(
                'standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
        } catch {
            return names;
        }

        try {
            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                if (info.get_file_type() === Gio.FileType.DIRECTORY)
                    names.push(info.get_name());
            }
        } catch {
            // ignore partial listings
        }

        return names;
    }

    /**
     * All bookmarks across profiles, re-read only when a file changes.
     *
     * @returns {{name: string, url: string}[]}
     */
    _bookmarks() {
        const files = [];
        let cacheKey = '';

        for (const profile of this._profiles()) {
            const file = GLib.build_filenamev([profile, 'Bookmarks']);
            const info = this._fileInfo(file);
            if (!info)
                continue;
            files.push(file);
            cacheKey += `${file}:${info.mtime}:${info.size};`;
        }

        if (this._bookmarkCache?.key === cacheKey)
            return this._bookmarkCache.items;

        const items = [];
        for (const file of files)
            items.push(...this._readBookmarks(file));

        this._bookmarkCache = {key: cacheKey, items};
        return items;
    }

    /** @returns {{mtime: number, size: number}|null} */
    _fileInfo(path) {
        try {
            const info = Gio.File.new_for_path(path).query_info(
                'time::modified,standard::size', Gio.FileQueryInfoFlags.NONE, null);
            return {
                mtime: info.get_attribute_uint64('time::modified'),
                size: info.get_attribute_uint64('standard::size'),
            };
        } catch {
            return null;
        }
    }

    /** @returns {{name: string, url: string}[]} */
    _readBookmarks(path) {
        let data;
        try {
            const [, contents] = Gio.File.new_for_path(path).load_contents(null);
            data = JSON.parse(new TextDecoder().decode(contents));
        } catch {
            return [];
        }

        const items = [];
        const walk = node => {
            if (node.type === 'url') {
                if (node.url)
                    items.push({name: node.name || node.url, url: node.url});
                return;
            }
            for (const child of node.children ?? [])
                walk(child);
        };

        for (const root of Object.values(data.roots ?? {})) {
            if (root && typeof root === 'object')
                walk(root);
        }

        return items;
    }

    /**
     * Query the browser history across profiles using sqlite3 (read-only).
     * Returns an empty list when sqlite3 is unavailable.
     *
     * @param {string[]} termsLower - lower-cased search terms
     * @param {number} limit - maximum number of rows per profile
     * @param {Gio.Cancellable} cancellable - cancellation for this search
     * @returns {Promise<{url: string, title: string}[]>}
     */
    async _history(termsLower, limit, cancellable) {
        const out = [];
        if (!limit || termsLower.length === 0)
            return out;

        for (const profile of this._profiles()) {
            if (out.length >= limit)
                break;
            const db = GLib.build_filenamev([profile, 'History']);
            if (!GLib.file_test(db, GLib.FileTest.IS_REGULAR))
                continue;

            for (const row of await this._queryHistory(db, termsLower, limit, cancellable)) {
                if (row?.url && row.url !== '' && !isSkippedUrl(row.url))
                    out.push({url: row.url, title: row.title || row.url});
                if (out.length >= limit)
                    break;
            }
        }

        return out;
    }

    /** @returns {Promise<object[]>} */
    async _queryHistory(db, termsLower, limit, cancellable) {
        const conditions = termsLower.map(term => {
            const pattern = sqlString(likePattern(term));
            return `(url LIKE ${pattern} ESCAPE '\\' OR title LIKE ${pattern} ESCAPE '\\')`;
        });

        const sql = 'SELECT url, title FROM urls ' +
            `WHERE ${conditions.join(' AND ')} ` +
            `ORDER BY last_visit_time DESC LIMIT ${Math.max(1, limit) * 4}`;

        // 'immutable=1' allows reading while the browser holds the database.
        const stdout = await this._run(
            [this._sqlite, '-readonly', '-json', `file:${db}?immutable=1`, sql],
            cancellable);

        if (!stdout.trim())
            return [];

        try {
            return JSON.parse(stdout);
        } catch {
            return [];
        }
    }

    /**
     * @param {string[]} argv - command and arguments
     * @param {Gio.Cancellable} cancellable - cancellation for this command
     * @returns {Promise<string>} standard output
     */
    _run(argv, cancellable) {
        return new Promise((resolve, reject) => {
            let proc;
            try {
                proc = Gio.Subprocess.new(
                    argv,
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            } catch (e) {
                reject(e);
                return;
            }

            proc.communicate_utf8_async(null, cancellable, (source, result) => {
                try {
                    const [, stdout] = source.communicate_utf8_finish(result);
                    resolve(stdout ?? '');
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    // ------------------------------------------------------------------ //
    // Helpers
    // ------------------------------------------------------------------ //

    /** @returns {string} the search URL for the configured engine */
    _searchUrl(query) {
        return buildSearchUrl(
            this._settings.get_string('engine'),
            this._settings.get_string('custom-url'),
            query);
    }

    /** @returns {St.Icon} */
    _icon(name, size) {
        return new St.Icon({icon_name: name, icon_size: size});
    }

    /** @returns {string} a readable name for an identifier we lost metadata for */
    _nameFromId(id) {
        if (id.startsWith(SEARCH_PREFIX))
            return `Search for “${this._queryFromId(id)}”`;
        return id.slice(id.indexOf(':') + 1);
    }

    /** @returns {string} the query encoded in a search identifier */
    _queryFromId(id) {
        return id.startsWith(SEARCH_PREFIX) ? id.slice(SEARCH_PREFIX.length) : id;
    }

    /** Open a URI with the default handler. */
    _open(uri) {
        if (!uri)
            return;
        try {
            Gio.AppInfo.launch_default_for_uri(uri, null);
        } catch (e) {
            console.error(`Web Search: failed to open ${uri}: ${e.message}`);
        }
    }
}

export default class WebSearchExtension extends Extension {
    enable() {
        this._provider = new WebSearchProvider(this);
        Main.overview.searchController.addProvider(this._provider);
    }

    disable() {
        Main.overview.searchController.removeProvider(this._provider);
        this._provider.destroy();
        this._provider = null;
    }
}
