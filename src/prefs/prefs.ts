import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {Logger} from "../utils/logger.js";
import {EntryRow} from "./keybindings.js";

export default class AerospikeExtensions extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow) {
        // Create settings object
        const settings = this.getSettings('org.gnome.shell.extensions.aerospike');

        // Create keybindings page (top-level)
        const keybindingsPage = new Adw.PreferencesPage({
            title: _('Keybindings'),
            icon_name: 'input-keyboard-symbolic',
        });
        window.add(keybindingsPage);

        const keybindingMap = this.createKeybindingMap();

        // Top-level Keybindings header group with syntax help
        const keybindingsHeader = new Adw.PreferencesGroup({
            title: _('Keybindings'),
            description: `${_("Syntax")}: <Super>h, <Shift>g, <Super><Shift>h
            ${_("Legend")}: <Super> - ${_("Windows key")}, <Primary> - ${_("Control key")}
            ${_("Delete text to unset. Press Return key to accept.")}`,
        });
        keybindingsPage.add(keybindingsHeader);

        // --- Focus group ---
        const focusGroup = new Adw.PreferencesGroup({
            title: _('Focus'),
        });
        keybindingsPage.add(focusGroup);

        focusGroup.add(
            new EntryRow({
                title: _('Focus Left'),
                settings: settings,
                bind: 'focus-left',
                map: keybindingMap
            })
        );

        focusGroup.add(
            new EntryRow({
                title: _('Focus Right'),
                settings: settings,
                bind: 'focus-right',
                map: keybindingMap
            })
        );

        focusGroup.add(
            new EntryRow({
                title: _('Focus Up'),
                settings: settings,
                bind: 'focus-up',
                map: keybindingMap
            })
        );

        focusGroup.add(
            new EntryRow({
                title: _('Focus Down'),
                settings: settings,
                bind: 'focus-down',
                map: keybindingMap
            })
        );

        // --- Move group ---
        const moveGroup = new Adw.PreferencesGroup({
            title: _('Move'),
        });
        keybindingsPage.add(moveGroup);

        moveGroup.add(
            new EntryRow({
                title: _('Move Left'),
                settings: settings,
                bind: 'move-left',
                map: keybindingMap
            })
        );

        moveGroup.add(
            new EntryRow({
                title: _('Move Right'),
                settings: settings,
                bind: 'move-right',
                map: keybindingMap
            })
        );

        moveGroup.add(
            new EntryRow({
                title: _('Move Up'),
                settings: settings,
                bind: 'move-up',
                map: keybindingMap
            })
        );

        moveGroup.add(
            new EntryRow({
                title: _('Move Down'),
                settings: settings,
                bind: 'move-down',
                map: keybindingMap
            })
        );

        // --- Container Interactions group ---
        const containerGroup = new Adw.PreferencesGroup({
            title: _('Container Interactions'),
        });
        keybindingsPage.add(containerGroup);

        containerGroup.add(
            new EntryRow({
                title: _('Toggle Orientation'),
                settings: settings,
                bind: 'toggle-orientation',
                map: keybindingMap
            })
        );

        containerGroup.add(
            new EntryRow({
                title: _('Reset Container Ratios to Equal'),
                settings: settings,
                bind: 'reset-ratios',
                map: keybindingMap
            })
        );

        containerGroup.add(
            new EntryRow({
                title: _('Toggle Tabbed Mode'),
                settings: settings,
                bind: 'toggle-tabbed',
                map: keybindingMap
            })
        );

        // --- Debugging group ---
        const debuggingGroup = new Adw.PreferencesGroup({
            title: _('Debugging'),
        });
        keybindingsPage.add(debuggingGroup);

        debuggingGroup.add(
            new EntryRow({
                title: _('Print Tree Structure'),
                settings: settings,
                bind: 'print-tree',
                map: keybindingMap
            })
        );

    }

    // Helper function to create a keybinding mapping object
    private createKeybindingMap() {
        return {
            from(settings: Gio.Settings, bind: string) {
                return settings.get_strv(bind).join(',');
            },
            to(settings: Gio.Settings, bind: string, value: string) {
                if (!!value) {
                    const mappings = value.split(',').map((x) => {
                        const [, key, mods] = Gtk.accelerator_parse(x);
                        return Gtk.accelerator_valid(key, mods) && Gtk.accelerator_name(key, mods);
                    });
                    // Filter out any false values to ensure we only have strings
                    const stringMappings = mappings.filter((x): x is string => typeof x === 'string');
                    if (stringMappings.length > 0) {
                        Logger.debug("setting", bind, "to", stringMappings);
                        settings.set_strv(bind, stringMappings);
                    }
                } else {
                    // If value deleted, unset the mapping
                    settings.set_strv(bind, []);
                }
            },
        };
    }
}