import Meta from 'gi://Meta';
import {Extension, ExtensionMetadata} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import WindowManager from './src/windowManager.js'
import {Logger} from "./src/utils/logger.js";

export default class aerospike extends Extension {
    settings: Gio.Settings;
    keyBindings: Map<string, number>;
    windowManager: WindowManager;

    constructor(metadata: ExtensionMetadata) {
        super(metadata);
        this.settings = this.getSettings('org.gnome.shell.extensions.aerospike');
        this.keyBindings = new Map();
        this.windowManager = new WindowManager();
    }

    enable() {
        Logger.log("STARTING AEROSPIKE!")
        this.bindSettings();
        this.windowManager.enable()
    }

    disable() {
        this.windowManager.disable()
    }


    private bindSettings() {
        // Monitor settings changes
        this.settings.connect('changed::keybinding-1', () => {
            log(`Keybinding 1 changed to: ${this.settings.get_strv('keybinding-1')}`);
            this.refreshKeybinding('keybinding-1');
        });

        this.settings.connect('changed::keybinding-2', () => {
            log(`Keybinding 2 changed to: ${this.settings.get_strv('keybinding-2')}`);
            this.refreshKeybinding('keybinding-2');
        });

        this.settings.connect('changed::keybinding-3', () => {
            log(`Keybinding 3 changed to: ${this.settings.get_strv('keybinding-3')}`);
            this.refreshKeybinding('keybinding-3');
        });

        this.settings.connect('changed::keybinding-4', () => {
            log(`Keybinding 4 changed to: ${this.settings.get_strv('keybinding-4')}`);
            this.refreshKeybinding('keybinding-4');
        });

        this.settings.connect('changed::dropdown-option', () => {
            log(`Dropdown option changed to: ${this.settings.get_string('dropdown-option')}`);
        });

        this.settings.connect('changed::color-selection', () => {
            log(`Color selection changed to: ${this.settings.get_string('color-selection')}`);
        });
    }
    private refreshKeybinding(settingName: string) {
        if (this.keyBindings.has(settingName)) {
            Main.wm.removeKeybinding(settingName);
            this.keyBindings.delete(settingName);
        }

        switch (settingName) {
            case 'keybinding-1':
                this.bindKeybinding('keybinding-1', () => {
                    log('Keybinding 1 was pressed!');
                });
                break;
            case 'keybinding-2':
                this.bindKeybinding('keybinding-2', () => {
                    log('Keybinding 2 was pressed!');
                });
                break;
            case 'keybinding-3':
                this.bindKeybinding('keybinding-3', () => {
                    log('Keybinding 3 was pressed!');
                });
                break;
            case 'keybinding-4':
                this.bindKeybinding('keybinding-4', () => {
                    log('Keybinding 4 was pressed!');
                });
                break;
        }
    }

    private removeKeybindings() {
        this.keyBindings.forEach((_, key) => {
            Main.wm.removeKeybinding(key);
        });
        this.keyBindings.clear();
    }

    private setupKeybindings() {
        this.bindKeybinding('keybinding-1', () => {
            log('Keybinding 1 was pressed!');
        });

        this.bindKeybinding('keybinding-2', () => {
            log('Keybinding 2 was pressed!');
        });

        this.bindKeybinding('keybinding-3', () => {
            log('Keybinding 3 was pressed!');
        });

        this.bindKeybinding('keybinding-4', () => {
            log('Keybinding 4 was pressed!');
        });
    }

    private bindKeybinding(settingName: string, callback: () => void) {
        const keyBindingSettings = this.settings.get_strv(settingName);

        if (keyBindingSettings.length === 0 || keyBindingSettings[0] === '') {
            return;
        }

        const keyBindingAction = Main.wm.addKeybinding(
            settingName,
            this.settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL,
            callback
        );

        this.keyBindings.set(settingName, keyBindingAction);
    }



}