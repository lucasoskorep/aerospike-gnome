import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {Logger} from "../utils/logger.js";
import {EntryRow} from "./keybindings.js";

export default class AerospikeExtensions extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow) {
        // Create settings object
        const settings = this.getSettings('org.gnome.shell.extensions.aerospike');

        // Create a preferences page
        const page = new Adw.PreferencesPage({
            title: _('Settings'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);


        // Create options group
        const optionsGroup = new Adw.PreferencesGroup({
            title: _('Options'),
        });
        page.add(optionsGroup);

        // Add dropdown
        const dropdownRow = new Adw.ComboRow({
            title: _('Select an option'),
        });
        optionsGroup.add(dropdownRow);

        // Create dropdown model
        const dropdownModel = new Gtk.StringList();
        dropdownModel.append(_('Option 1'));
        dropdownModel.append(_('Option 2'));
        dropdownModel.append(_('Option 3'));
        dropdownModel.append(_('Option 4'));

        dropdownRow.set_model(dropdownModel);

        // Set the active option based on settings
        const currentOption = settings.get_string('dropdown-option');
        switch (currentOption) {
            case 'option1':
                dropdownRow.set_selected(0);
                break;
            case 'option2':
                dropdownRow.set_selected(1);
                break;
            case 'option3':
                dropdownRow.set_selected(2);
                break;
            case 'option4':
                dropdownRow.set_selected(3);
                break;
            default:
                dropdownRow.set_selected(0);
        }

        // Connect dropdown change signal
        dropdownRow.connect('notify::selected', () => {
            const selected = dropdownRow.get_selected();
            let optionValue: string;

            switch (selected) {
                case 0:
                    optionValue = 'option1';
                    break;
                case 1:
                    optionValue = 'option2';
                    break;
                case 2:
                    optionValue = 'option3';
                    break;
                case 3:
                    optionValue = 'option4';
                    break;
                default:
                    optionValue = 'option1';
            }

            settings.set_string('dropdown-option', optionValue);
        });

        // Add color button
        const colorRow = new Adw.ActionRow({
            title: _('Choose a color'),
        });
        optionsGroup.add(colorRow);

        const colorButton = new Gtk.ColorButton();
        colorRow.add_suffix(colorButton);
        colorRow.set_activatable_widget(colorButton);

        // Set current color from settings
        const colorStr = settings.get_string('color-selection');
        const rgba = new Gdk.RGBA();
        rgba.parse(colorStr);
        colorButton.set_rgba(rgba);

        // Connect color button signal
        colorButton.connect('color-set', () => {
            const color = colorButton.get_rgba().to_string();
            settings.set_string('color-selection', color);
        });

        // Create keybindings group
        const keybindingsGroup = new Adw.PreferencesGroup({
            title: _('Keyboard Shortcuts'),
            description: `${_("Syntax")}: <Super>h, <Shift>g, <Super><Shift>h
            ${_("Legend")}: <Super> - ${_("Windows key")}, <Primary> - ${_("Control key")}
            ${_("Delete text to unset. Press Return key to accept.")}`,
        });
        page.add(keybindingsGroup);

        // Add keybinding rows as EntryRows with proper mapping
        // Use the helper function to create the map object
        const keybindingMap = this.createKeybindingMap();
        
        keybindingsGroup.add(
            new EntryRow({
                title: _('Action 1'),
                settings: settings,
                bind: 'move-left',
                map: keybindingMap
            })
        );
        
        keybindingsGroup.add(
            new EntryRow({
                title: _('Action 2'),
                settings: settings,
                bind: 'move-right',
                map: keybindingMap
            })
        );
        
        keybindingsGroup.add(
            new EntryRow({
                title: _('Action 3'),
                settings: settings,
                bind: 'join-with-left',
                map: keybindingMap
            })
        );
        
        keybindingsGroup.add(
            new EntryRow({
                title: _('Action 4'),
                settings: settings,
                bind: 'join-with-right',
                map: keybindingMap
            })
        );

        keybindingsGroup.add(
            new EntryRow({
                title: _('Print Tree Structure'),
                settings: settings,
                bind: 'print-tree',
                map: keybindingMap
            })
        );

        keybindingsGroup.add(
            new EntryRow({
                title: _('Toggle Orientation'),
                settings: settings,
                bind: 'toggle-orientation',
                map: keybindingMap
            })
        );

        keybindingsGroup.add(
            new EntryRow({
                title: _('Reset Container Ratios to Equal'),
                settings: settings,
                bind: 'reset-ratios',
                map: keybindingMap
            })
        );

        keybindingsGroup.add(
            new EntryRow({
                title: _('Toggle Tabbed Mode'),
                settings: settings,
                bind: 'toggle-tabbed',
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