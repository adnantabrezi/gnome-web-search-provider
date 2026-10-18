// SPDX-License-Identifier: MIT
//
// Preferences for the Web Search extension. Shown by the Extensions app
// (gear button) and by `gnome-extensions prefs <uuid>`.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {ENGINES, ENGINE_ORDER} from './engines.js';

const RESET_KEYS = [
    'engine',
    'custom-url',
    'search-results',
    'bookmarks',
    'history',
    'max-bookmarks',
    'max-history',
];

export default class WebSearchPreferences extends ExtensionPreferences {
    /**
     * @param {Adw.PreferencesWindow} window - the preferences window
     */
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('Search'),
            icon_name: 'system-search-symbolic',
        });
        window.add(page);

        // --- engine ---------------------------------------------------- //
        const engineGroup = new Adw.PreferencesGroup({
            title: _('Search engine'),
            description: _('Used for the "search for …" result and for Launch Search.'),
        });
        page.add(engineGroup);

        const engineRow = new Adw.ComboRow({
            title: _('Default search engine'),
            model: Gtk.StringList.new(ENGINE_ORDER.map(id => ENGINES[id].name)),
        });
        engineGroup.add(engineRow);

        const customRow = new Adw.EntryRow({title: _('Custom search URL')});
        customRow.set_tooltip_text(
            _('Use {query} where the search terms should go; if omitted the terms are appended.'));
        engineGroup.add(customRow);

        const syncEngine = () => {
            const index = Math.max(0, ENGINE_ORDER.indexOf(settings.get_string('engine')));
            engineRow.set_selected(index);
            customRow.set_text(settings.get_string('custom-url'));
            customRow.set_visible(ENGINE_ORDER[index] === 'custom');
        };
        syncEngine();

        engineRow.connect('notify::selected', () => {
            const id = ENGINE_ORDER[engineRow.get_selected()];
            settings.set_string('engine', id);
            customRow.set_visible(id === 'custom');
        });

        customRow.connect('changed', () => {
            settings.set_string('custom-url', customRow.get_text().trim());
        });

        // --- sources --------------------------------------------------- //
        const sourcesGroup = new Adw.PreferencesGroup({title: _('Show in overview search')});
        page.add(sourcesGroup);

        const addSwitch = (key, title, subtitle = '') => {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            sourcesGroup.add(row);
        };

        addSwitch('search-results', _('Search action'), _('e.g. “Brave search for …”'));
        addSwitch('bookmarks', _('Bookmarks'));
        addSwitch('history', _('History'));

        // --- amounts --------------------------------------------------- //
        const amountsGroup = new Adw.PreferencesGroup({title: _('Number of results')});
        page.add(amountsGroup);

        const addSpin = (key, title) => {
            const row = new Adw.SpinRow({
                title,
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 10,
                    step_increment: 1,
                    page_increment: 1,
                }),
            });
            row.set_value(settings.get_int(key));
            row.connect('notify::value', () => {
                settings.set_int(key, Math.round(row.get_value()));
            });
            amountsGroup.add(row);
            return row;
        };

        const bookmarkSpin = addSpin('max-bookmarks', _('Bookmarks'));
        const historySpin = addSpin('max-history', _('History'));

        // --- reset ----------------------------------------------------- //
        const resetGroup = new Adw.PreferencesGroup();
        page.add(resetGroup);

        const resetRow = new Adw.ButtonRow({title: _('Reset to defaults')});
        resetRow.add_css_class('destructive-action');
        resetRow.connect('activated', () => {
            for (const key of RESET_KEYS)
                settings.reset(key);

            syncEngine();
            bookmarkSpin.set_value(settings.get_int('max-bookmarks'));
            historySpin.set_value(settings.get_int('max-history'));
        });
        resetGroup.add(resetRow);
    }
}
