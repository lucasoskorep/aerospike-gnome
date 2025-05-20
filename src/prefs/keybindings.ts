// Gnome imports
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { Logger } from '../utils/logger.js';

/**
 * EntryRow class for handling text input including keybindings
 */
export class EntryRow extends Adw.EntryRow {
    static {
        GObject.registerClass(this);
    }

    constructor(params: {
        title: string,
        settings: Gio.Settings,
        bind: string,
        map?: {
            from: (settings: Gio.Settings, bind: string) => string,
            to: (settings: Gio.Settings, bind: string, value: string) => void
        }
    }) {
        super({ title: params.title });
        
        const { settings, bind, map } = params;

        // When text changes, update settings
        this.connect('changed', () => {
            const text = this.get_text();
            if (typeof text === 'string') {
                if (map) {
                    map.to(settings, bind, text);
                } else {
                    settings.set_string(bind, text);
                }
            }
        });

        // Set initial text from settings
        const current = map ? map.from(settings, bind) : settings.get_string(bind);
        this.set_text(current ?? '');

        // Add reset button
        this.add_suffix(
            new ResetButton({
                settings,
                bind,
                onReset: () => {
                    this.set_text((map ? map.from(settings, bind) : settings.get_string(bind)) ?? '');
                },
            })
        );
    }
}

/**
 * Reset button for settings
 */
export class ResetButton extends Gtk.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(params: {
        settings?: Gio.Settings,
        bind: string,
        onReset?: () => void
    }) {
        super({
            icon_name: 'edit-clear-symbolic',
            tooltip_text: _('Reset'),
            valign: Gtk.Align.CENTER,
        });

        this.connect('clicked', () => {
            params.settings?.reset(params.bind);
            params.onReset?.();
        });
    }
}