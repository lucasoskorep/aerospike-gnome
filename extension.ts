import Meta from 'gi://Meta';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import WindowManager from './src/wm/windowManager.js'
import {Direction} from './src/wm/container.js'
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
        try {
            Logger.log("STARTING AEROSPIKE!")
            this.bindSettings();
            this.setupKeybindings();
            this.windowManager.enable()
            Logger.log("AEROSPIKE ENABLED SUCCESSFULLY")
        } catch (e) {
            Logger.error("AEROSPIKE ENABLE FAILED", e);
        }
    }

    disable() {
        this.windowManager.disable()
        this.removeKeybindings()
    }

    private keybindingActions(): Record<string, () => void> {
        return {
            'print-tree':         () => { this.windowManager.printTreeStructure(); },
            'toggle-orientation': () => { this.windowManager.toggleActiveContainerOrientation(); },
            'reset-ratios':       () => { this.windowManager.resetActiveContainerRatios(); },
            'toggle-tabbed':      () => { this.windowManager.toggleActiveContainerTabbed(); },
            'focus-left':         () => { this.windowManager.focusInDirection(Direction.LEFT); },
            'focus-right':        () => { this.windowManager.focusInDirection(Direction.RIGHT); },
            'focus-up':           () => { this.windowManager.focusInDirection(Direction.UP); },
            'focus-down':         () => { this.windowManager.focusInDirection(Direction.DOWN); },
            'move-left':          () => { this.windowManager.moveInDirection(Direction.LEFT); },
            'move-right':         () => { this.windowManager.moveInDirection(Direction.RIGHT); },
            'move-up':            () => { this.windowManager.moveInDirection(Direction.UP); },
            'move-down':          () => { this.windowManager.moveInDirection(Direction.DOWN); },
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
