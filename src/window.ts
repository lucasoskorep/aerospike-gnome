import Meta from 'gi://Meta';
import St from "gi://St";
import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {IWindowManager} from "./windowManager.js";
import {Logger} from "./utils/logger.js";
import MaximizeFlags = Meta.MaximizeFlags;

export type Signal = {
    name: string;
    id: number;
}

type WindowMinimizedHandler = (window: WindowWrapper) => void;

export class WindowWrapper {
    readonly _window: Meta.Window;
    readonly _windowMinimizedHandler: WindowMinimizedHandler;
    readonly _signals: Signal[];

    constructor(window: Meta.Window, winMinimized: WindowMinimizedHandler) {
        this._window = window;
        this._signals = [];
        this._windowMinimizedHandler = winMinimized;
    }

    getWindow(): Meta.Window {
        return this._window;
    }

    getWindowId(): number {
        return this._window.get_id();
    }

    connectWindowSignals(
        windowManager: IWindowManager,
    ): void {

        const windowId = this._window.get_id();

        // Handle window destruction
        const destroyId = this._window.connect('unmanaging', window => {
            Logger.log("REMOVING WINDOW", windowId);
            windowManager.handleWindowClosed(this)
        });
        this._signals.push({name: 'unmanaging', id: destroyId});

        // Handle focus changes
        const focusId = this._window.connect('notify::has-focus', () => {
            if (this._window.has_focus()) {
                windowManager._activeWindowId = windowId;
            }
        });
        this._signals.push({name: 'notify::has-focus', id: focusId});


        // Handle minimization
        const minimizeId = this._window.connect('notify::minimized', () => {
            if (this._window.minimized) {
                Logger.log(`Window minimized: ${windowId}`);
                windowManager.handleWindowMinimized(this);

            } else if (!this._window.minimized) {
                Logger.log(`Window unminimized: ${windowId}`);
                windowManager.handleWindowUnminimized(this);

            }
        });
        this._signals.push({name: 'notify::minimized', id: minimizeId});

        // Handle maximization
        const maximizeId = this._window.connect('notify::maximized-horizontally', () => {
            if (this._window.get_maximized()) {
                Logger.log(`Window maximized: ${windowId}`);
            } else {
                Logger.log(`Window unmaximized: ${windowId}`);
            }
        });
        this._signals.push({name: 'notify::maximized-horizontally', id: maximizeId});
    }

    disconnectWindowSignals(): void {

        // Disconnect signals
        if (this._signals) {
            this._signals.forEach(signal => {
                try {
                    if (this._window != null) {
                        this._window.disconnect(signal.id);
                    }
                } catch (e) {
                    Logger.warn("error disconnecting signal", signal, e);
                }
            });
        }
    }

    resizeWindow(x: number, y: number, width: number, height: number) {
        Logger.info(this._window.allows_move())
        Logger.info(this._window.allows_resize())

        if (this._window.get_maximized() == MaximizeFlags.BOTH || this._window.is_fullscreen() || this._window.is_monitor_sized()) {
            Logger.info("is monitor sized?", this._window.is_monitor_sized());
            Logger.info("is monitor sized?", this._window.is_fullscreen());
            Logger.info("is monitor sized?", this._window.get_maximized());
            Logger.info("is monitor sized?", this._window.get_maximized() == MaximizeFlags.BOTH);

            Logger.info("window is fullscreen or maximized and will not be resized", this._window)
            return;
            // Logger.log("WINDOW IS FULLSCREEN")
            // this._window.unmake_fullscreen();
        }
        this._window.move_resize_frame(false, x, y, width, height);
    }

    // This is meant to be an exact copy of Forge's move function, renamed to maintain your API
    safelyResizeWindow(x: number, y: number, width: number, height: number): void {
        // Keep minimal logging 
        Logger.log("SAFELY RESIZE", x, y, width, height);
        
        // Simple early returns like Forge
        if (!this._window) return;
        
        // Skip the this._window.grabbed check since we confirmed it doesn't exist in Meta.Window
        
        // Unmaximize in all directions - no try/catch to match Forge
        this._window.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
        this._window.unmaximize(Meta.MaximizeFlags.VERTICAL);
        this._window.unmaximize(Meta.MaximizeFlags.BOTH);
        
        // Get actor and return early if not available - no try/catch
        const windowActor = this._window.get_compositor_private() as Clutter.Actor;
        if (!windowActor) return;
        
        // Remove transitions - no try/catch
        windowActor.remove_all_transitions();
        
        // Move and resize in exact order as Forge - no try/catch 
        this._window.move_frame(true, x, y);
        this._window.move_resize_frame(true, x, y, width, height);
    }


}
