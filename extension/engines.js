// SPDX-License-Identifier: MIT
//
// Search-engine table shared by the Shell extension and its preferences.
// Keep in sync with the standalone provider (src/search-provider).

/** @type {Record<string, {name: string, url: string, icon: string}>} */
export const ENGINES = {
    brave: {
        name: 'Brave',
        url: 'https://search.brave.com/search?q=',
        icon: 'brave-desktop',
    },
    google: {
        name: 'Google',
        url: 'https://www.google.com/search?q=',
        icon: 'web-browser-symbolic',
    },
    duckduckgo: {
        name: 'DuckDuckGo',
        url: 'https://duckduckgo.com/?q=',
        icon: 'web-browser-symbolic',
    },
    bing: {
        name: 'Bing',
        url: 'https://www.bing.com/search?q=',
        icon: 'web-browser-symbolic',
    },
    startpage: {
        name: 'Startpage',
        url: 'https://www.startpage.com/sp/search?query=',
        icon: 'web-browser-symbolic',
    },
    ecosia: {
        name: 'Ecosia',
        url: 'https://www.ecosia.org/search?q=',
        icon: 'web-browser-symbolic',
    },
    qwant: {
        name: 'Qwant',
        url: 'https://www.qwant.com/?q=',
        icon: 'web-browser-symbolic',
    },
    wikipedia: {
        name: 'Wikipedia',
        url: 'https://en.wikipedia.org/w/index.php?search=',
        icon: 'web-browser-symbolic',
    },
    custom: {
        name: 'Custom URL',
        url: '',
        icon: 'web-browser-symbolic',
    },
};

/** Display order for the preferences combo. */
export const ENGINE_ORDER = [
    'brave',
    'google',
    'duckduckgo',
    'bing',
    'startpage',
    'ecosia',
    'qwant',
    'wikipedia',
    'custom',
];

/**
 * Resolve the effective engine for a search.
 *
 * @param {string} engine - engine id from settings
 * @param {string} customUrl - custom URL template from settings
 * @returns {{name: string, url: string, icon: string}}
 */
export function engineInfo(engine, customUrl) {
    if (engine === 'custom' && customUrl)
        return {name: 'Custom', url: customUrl, icon: ENGINES.custom.icon};

    return ENGINES[engine] ?? ENGINES.brave;
}

/**
 * Build a search URL for the given query.
 *
 * A `{query}` placeholder is substituted if present, otherwise the encoded
 * query is appended to the template.
 *
 * @param {string} engine - engine id from settings
 * @param {string} customUrl - custom URL template from settings
 * @param {string} query - the user's search terms
 * @returns {string} the URL to open
 */
export function buildSearchUrl(engine, customUrl, query) {
    const {url} = engineInfo(engine, customUrl);
    const encoded = encodeURIComponent(query);

    if (url.includes('{query}'))
        return url.replaceAll('{query}', encoded);

    return url + encoded;
}
