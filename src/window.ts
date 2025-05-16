import Meta from 'gi://Meta';
import Clutter from "gi://Clutter";
import {IWindowManager} from "./windowManager.js";
import {Logger} from "./utils/logger.js";
import {Rect} from "./utils/rect.js";
import WindowContainer from "./container.js";


type WindowMinimizedHandler = (window: WindowWrapper) => void;
type WindowWorkspaceChangedHandler = (window: WindowWrapper) => void;

export class WindowWrapper {
    readonly _window: Meta.Window;
    readonly _windowMinimizedHandler: WindowMinimizedHandler;
    // readonly _windowWorkspaceChangedHandler: WindowWorkspaceChangedHandler;
    readonly _signals: number[];

    constructor(
        window: Meta.Window,
        winMinimized: WindowMinimizedHandler
    ) {
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
        const windowId = this._window.get_id()
        // Handle window destruction
        this._signals.push(
            this._window.connect('unmanaging', window => {
                Logger.log("REMOVING WINDOW", windowId);
                windowManager.handleWindowClosed(this)
            }),
            this._window.connect('notify::minimized', (we) => {
                if (this._window.minimized) {
                    Logger.log(`Window minimized: ${windowId}`);
                    windowManager.handleWindowMinimized(this);

                } else if (!this._window.minimized) {
                    Logger.log(`Window unminimized: ${windowId}`);
                    windowManager.handleWindowUnminimized(this);

                }
            }),
            this._window.connect('notify::has-focus', () => {
                if (this._window.has_focus()) {
                    windowManager._activeWindowId = windowId;
                }
            }),
            this._window.connect('notify::maximized-horizontally', () => {
                if (this._window.get_maximized()) {
                    Logger.log(`Window maximized: ${windowId}`);
                } else {
                    Logger.log(`Window unmaximized: ${windowId}`);
                }
            }),
            this._window.connect("workspace-changed", (_metaWindow) => {
                Logger.log("WORKSPACE CHANGED FOR WINDOW", this._window.get_id());
            }),
        );
    }

    disconnectWindowSignals(): void {

        if (this._signals) {
            this._signals.forEach(signal => {
                try {
                    if (this._window != null) {
                        this._window.disconnect(signal);
                    }
                } catch (e) {
                    Logger.warn("error disconnecting signal", signal, e);
                }
            });
        }
    }

    // This is meant to be an exact copy of Forge's move function, renamed to maintain your API
    safelyResizeWindow(rect: Rect): void {
        // Keep minimal logging 
        Logger.log("SAFELY RESIZE", rect.x, rect.y, rect.width, rect.height);
        const actor = this._window.get_compositor_private();

        if (!actor) {
            Logger.log("No actor available, can't resize safely yet");
            return;
        }
        let windowActor = this._window.get_compositor_private() as Clutter.Actor;
        if (!windowActor) return;
        windowActor.remove_all_transitions();
        Logger.info("MOVING")
        this._window.move_frame(true, rect.x, rect.y);
        Logger.info("RESIZING MOVING")
        this._window.move_resize_frame(true, rect.x, rect.y, rect.width, rect.height);

    }


}
