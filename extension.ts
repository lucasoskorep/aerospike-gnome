import Meta from 'gi://Meta';
import {Extension, ExtensionMetadata} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import WindowManager from './src/wm/windowManager.js'
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
        this.setupKeybindings();
        this.windowManager.enable()
    }

    disable() {
        this.windowManager.disable()
        this.removeKeybindings()
    }


    private bindSettings() {
        // Monitor settings changes
        this.settings.connect('changed::move-left', () => {
            log(`Keybinding 1 changed to: ${this.settings.get_strv('move-left')}`);
            this.refreshKeybinding('move-left');
        });

        this.settings.connect('changed::move-right', () => {
            log(`Keybinding 2 changed to: ${this.settings.get_strv('move-right')}`);
            this.refreshKeybinding('move-right');
        });

        this.settings.connect('changed::join-with-left', () => {
            log(`Keybinding 3 changed to: ${this.settings.get_strv('join-with-left')}`);
            this.refreshKeybinding('join-with-left');
        });

        this.settings.connect('changed::join-with-right', () => {
            log(`Keybinding 4 changed to: ${this.settings.get_strv('join-with-right')}`);
            this.refreshKeybinding('join-with-right');
        });

        this.settings.connect('changed::print-tree', () => {
            log(`Print tree keybinding changed to: ${this.settings.get_strv('print-tree')}`);
            this.refreshKeybinding('print-tree');
        });

        this.settings.connect('changed::toggle-orientation', () => {
            log(`Toggle orientation keybinding changed to: ${this.settings.get_strv('toggle-orientation')}`);
            this.refreshKeybinding('toggle-orientation');
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
            case 'move-left':
                this.bindKeybinding('move-left', () => {
                    Logger.info('Keybinding 1 was pressed!');
                });
                break;
            case 'move-right':
                this.bindKeybinding('move-right', () => {
                    Logger.info('Keybinding 2 was pressed!');
                });
                break;
            case 'join-with-left':
                this.bindKeybinding('join-with-left', () => {
                    Logger.info('Keybinding 3 was pressed!');
                });
                break;
            case 'join-with-right':
                this.bindKeybinding('join-with-right', () => {
                    Logger.info('Keybinding 4 was pressed!');
                });
                break;
            case 'print-tree':
                this.bindKeybinding('print-tree', () => {
                    this.windowManager.printTreeStructure();
                });
                break;
            case 'toggle-orientation':
                this.bindKeybinding('toggle-orientation', () => {
                    this.windowManager.toggleActiveContainerOrientation();
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
        this.bindKeybinding('move-left', () => {
            Logger.info('Keybinding 1 was pressed!');
        });

        this.bindKeybinding('move-right', () => {
            Logger.info('Keybinding 2 was pressed!');
        });

        this.bindKeybinding('join-with-left', () => {
            Logger.info('Keybinding 3 was pressed!');
        });

        this.bindKeybinding('join-with-right', () => {
            Logger.info('Keybinding 4 was pressed!');
        });

        this.bindKeybinding('print-tree', () => {
            this.windowManager.printTreeStructure();
        });

        this.bindKeybinding('toggle-orientation', () => {
            this.windowManager.toggleActiveContainerOrientation();
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
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            callback
        );

        this.keyBindings.set(settingName, keyBindingAction);
    }



}