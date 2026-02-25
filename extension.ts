import Meta from 'gi://Meta';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import WindowManager from './src/wm/windowManager.js'
import {Logger} from "./src/utils/logger.js";

export default class aerospike extends Extension {
    settings: Gio.Settings;
    keyBindings: Map<string, number>;
    windowManager: WindowManager;

    constructor(metadata: ConstructorParameters<typeof Extension>[0]) {
        super(metadata);
        this.settings = this.getSettings('org.gnome.shell.extensions.aerospike');
        this.keyBindings = new Map();
        this.windowManager = new WindowManager(this.settings);
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

    private keybindingActions(): Record<string, () => void> {
        return {
            'move-left':          () => { Logger.info('Keybinding 1 was pressed!'); },
            'move-right':         () => { Logger.info('Keybinding 2 was pressed!'); },
            'join-with-left':     () => { Logger.info('Keybinding 3 was pressed!'); },
            'join-with-right':    () => { Logger.info('Keybinding 4 was pressed!'); },
            'print-tree':         () => { this.windowManager.printTreeStructure(); },
            'toggle-orientation': () => { this.windowManager.toggleActiveContainerOrientation(); },
            'reset-ratios':       () => { this.windowManager.resetActiveContainerRatios(); },
        };
    }

    private bindSettings() {
        const keybindings = Object.keys(this.keybindingActions());
        keybindings.forEach(name => {
            this.settings.connect(`changed::${name}`, () => {
                log(`${name} keybinding changed to: ${this.settings.get_strv(name)}`);
                this.refreshKeybinding(name);
            });
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

        const action = this.keybindingActions()[settingName];
        if (action) this.bindKeybinding(settingName, action);
    }

    private removeKeybindings() {
        this.keyBindings.forEach((_, key) => {
            Main.wm.removeKeybinding(key);
        });
        this.keyBindings.clear();
    }

    private setupKeybindings() {
        const actions = this.keybindingActions();
        for (const [name, action] of Object.entries(actions)) {
            this.bindKeybinding(name, action);
        }
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
