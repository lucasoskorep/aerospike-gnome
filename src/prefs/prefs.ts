import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {Logger} from "../utils/logger.js";

export default class MyExtensionPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow) {
        // Create settings object
        const settings = this.getSettings('org.gnome.shell.extensions.aerospike');

        // Create a preferences page
        const page = new Adw.PreferencesPage({
            title: _('Settings'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // Create keybindings group
        const keybindingsGroup = new Adw.PreferencesGroup({
            title: _('Keyboard Shortcuts'),
        });
        page.add(keybindingsGroup);

        // Add keybinding rows
        this.addKeybindingRow(keybindingsGroup, settings, 'keybinding-1', _('Action 1'));
        this.addKeybindingRow(keybindingsGroup, settings, 'keybinding-2', _('Action 2'));
        this.addKeybindingRow(keybindingsGroup, settings, 'keybinding-3', _('Action 3'));
        this.addKeybindingRow(keybindingsGroup, settings, 'keybinding-4', _('Action 4'));

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
    }

    private addKeybindingRow(
        group: Adw.PreferencesGroup,
        settings: Gio.Settings,
        key: string,
        title: string
    ) {
        const shortcutsRow = new Adw.ActionRow({
            title: title,
        });

        group.add(shortcutsRow);

        // Create a button for setting shortcuts
        const shortcutButton = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            label: settings.get_strv(key)[0] || _("Disabled")
        });

        shortcutsRow.add_suffix(shortcutButton);
        shortcutsRow.set_activatable_widget(shortcutButton);

        // When clicking the button, show a dialog or start listening for keystroke
        shortcutButton.connect('clicked', () => {
            // Show a simple popup stating that the shortcut is being recorded
            const dialog = new Gtk.MessageDialog({
                modal: true,
                text: _("Press a key combination to set as shortcut"),
                secondary_text: _("Press Esc to cancel or Backspace to disable"),
                buttons: Gtk.ButtonsType.CANCEL,
                transient_for: group.get_root() as Gtk.Window
            });

            // Create a keypress event controller
            const controller = new Gtk.EventControllerKey();
            dialog.add_controller(controller);

            controller.connect('key-pressed', (_controller, keyval, keycode, state) => {

            });

            dialog.present();
        });
    }
}