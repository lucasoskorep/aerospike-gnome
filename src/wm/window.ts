import Meta from 'gi://Meta';
import Clutter from "gi://Clutter";
import {IWindowManager} from "./windowManager.js";
import {Logger} from "../utils/logger.js";
import {Rect} from "../utils/rect.js";
import WindowContainer from "./container.js";
import queueEvent from "../utils/events.js";


type WindowMinimizedHandler = (window: WindowWrapper) => void;
type WindowWorkspaceChangedHandler = (window: WindowWrapper) => void;

export class WindowWrapper {
    readonly _window: Meta.Window;
    readonly _windowMinimizedHandler: WindowMinimizedHandler;
    readonly _signals: number[] = [];
    _parent: WindowContainer | null = null;
    _dragging: boolean = false;

    constructor(
        window: Meta.Window,
        winMinimized: WindowMinimizedHandler
    ) {
        this._window = window;
        this._windowMinimizedHandler = winMinimized;
    }

    getWindow(): Meta.Window {
        return this._window;
    }

    getWindowId(): number {
        return this._window.get_id();
    }

    getWorkspace(): number {
        return this._window.get_workspace().index();
    }

    getMonitor(): number {
        return this._window.get_monitor();
    }

    getRect(): Rect {
        return this._window.get_frame_rect();
    }

    startDragging(): void {
        this._dragging = true;
    }
    stopDragging(): void {
        Logger.log("STOPPED DRAGGING")
        this._dragging = false;
    }

    // setParent(parent: WindowContainer): void {
    //     this._parent = parent;
    // }
    //
    // getParent(): WindowContainer | null {
    //     if (this._parent == null) {
    //         Logger.warn(`Attempting to get parent for window without parent ${JSON.stringify(this)}`);
    //     }
    //     return this._parent
    // }

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
                if (this._window.is_maximized()) {
                    Logger.log(`Window maximized: ${windowId}`);
                } else {
                    Logger.log(`Window unmaximized: ${windowId}`);
                }
            }),
            this._window.connect("workspace-changed", (_metaWindow) => {
                Logger.log("WORKSPACE CHANGED FOR WINDOW", this._window.get_id());
                windowManager.handleWindowChangedWorkspace(this);
            }),
            this._window.connect("position-changed", (_metaWindow) => {
                windowManager.handleWindowPositionChanged(this);
            }),
            this._window.connect("size-changed", (_metaWindow) => {
                windowManager.handleWindowSizeChanged(this);
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

    safelyResizeWindow(rect: Rect, _retry: number = 2): void {
        // Keep minimal logging
        // Note: we allow resizing even during drag operations to support position updates
        // The dragging flag only prevents REORDERING, not position/size changes
        // Logger.log("SAFELY RESIZE", rect.x, rect.y, rect.width, rect.height);
        const actor = this._window.get_compositor_private();

        if (!actor) {
            Logger.log("No actor available, can't resize safely yet");
            return;
        }
        let windowActor = this._window.get_compositor_private() as Clutter.Actor;
        if (!windowActor) return;
        windowActor.remove_all_transitions();
        // Logger.info("MOVING")
        this._window.move_frame(true, rect.x, rect.y);
        // Logger.info("RESIZING MOVING")
        this._window.move_resize_frame(true, rect.x, rect.y, rect.width, rect.height);
        let new_rect = this._window.get_frame_rect();
        if ( _retry > 0 && (new_rect.x != rect.x || rect.y != new_rect.y || rect.width < new_rect.width || rect.height < new_rect.height)) {
            Logger.warn("RESIZING FAILED AS SMALLER", new_rect.x, new_rect.y, new_rect.width, new_rect.height, rect.x, rect.y, rect.width, rect.height);
            queueEvent({
                name: "attempting_delayed_resize",
                callback: () => {
                    this.safelyResizeWindow(rect, _retry-1);
                }
            })
        }
    }


}
