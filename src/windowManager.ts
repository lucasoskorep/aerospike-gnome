import Meta from "gi://Meta";

import {WindowWrapper} from './window.js';
import Mtk from "@girs/mtk-16";
import {Logger} from "./utils/logger.js";


export interface IWindowManager {
    _activeWindowId: number | null;

    _tileWindows(): void;

    addWindow(window: Meta.Window): void;

    handleWindowClosed(windowId: number): void;

    // removeFromTree(window: Meta.Window): void;
    syncActiveWindow(): number | null;
}

export default class WindowManager implements IWindowManager {
    _focusSignal: number | null;
    _displaySignals: number[];
    _windowCreateId: number | null;
    _windows: Map<number, WindowWrapper>;
    _activeWindowId: number | null;

    constructor() {
        this._focusSignal = null;
        this._windowCreateId = null;
        this._displaySignals = [];
        this._windows = new Map<number, WindowWrapper>();
        this._activeWindowId = null;
    }

    public enable(): void {
        Logger.log("Starting Aerospike Window Manager");
        this.captureExistingWindows();
        // Connect window signals
        this._windowCreateId = global.display.connect(
            'window-created',
            (display, window) => {
                this.handleWindowCreated(display, window);
            }
        );
        this.instantiateDisplaySignals()
    }

    instantiateDisplaySignals(): void {
        this._displaySignals.push(
            global.display.connect("grab-op-begin", (display, window, op) => {
                this.handleGrabOpBegin(display, window, op)
            }),
            global.display.connect("grab-op-end", (display, window, op) => {
                this.handleGrabOpEnd(display, window, op)
            })
        )

    }

    handleGrabOpBegin(display: Meta.Display, window: Meta.Window, op: Meta.GrabOp): void {
        Logger.log("Grab Op Start");
        Logger.log(display, window, op)
        Logger.log(window.get_monitor())
    }

    handleGrabOpEnd(display: Meta.Display, window: Meta.Window, op: Meta.GrabOp): void {
        Logger.log("Grab Op End ");
        Logger.log(display, window, op)
        this._tileWindows();
    }

    public disable(): void {
        Logger.log("DISABLED AEROSPIKE WINDOW MANAGER!")
        // Disconnect the focus signal and remove any existing borders
        if (this._focusSignal) {
            global.display.disconnect(this._focusSignal);
            this._focusSignal = null;
        }
    }

    public captureExistingWindows() {
        Logger.log("CAPTURING WINDOWS")
        const workspace = global.workspace_manager.get_active_workspace();
        const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace);
        Logger.log("WINDOWS", windows);
        windows.forEach(window => {
            if (this._isWindowTileable(window)) {
                this.addWindow(window);
            }
        });

        this._tileWindows();
    }


    handleWindowCreated(display: Meta.Display, window: Meta.Window) {
        Logger.log("WINDOW CREATED ON DISPLAY", window, display);
        if (!this._isWindowTileable(window)) {
            return;
        }
        Logger.log("WINDOW IS TILABLE");
        const actor = window.get_compositor_private();
        if (!actor) {
            return;
        }
        this.addWindow(window);
    }


    /**
     * Handle window closed event
     */
    handleWindowClosed(windowId: number): void {
        Logger.log("closing window", windowId);
        const window = this._windows.get(windowId);
        if (!window) {
            return;
        }
        window.disconnectWindowSignals()
        // Remove from managed windows
        this._windows.delete(windowId);

        this.syncActiveWindow();
        // Retile remaining windows
        this._tileWindows();
    }


    public addWindow(window: Meta.Window) {
        const windowId = window.get_id();

        Logger.log("ADDING WINDOW", window);

        var wrapper = new WindowWrapper(window)
        wrapper.connectWindowSignals(this)

        // Add window to managed windows
        this._windows.set(windowId, wrapper);

        // If this is the first window, make it the active one
        if (this._windows.size === 1 || window.has_focus()) {
            this._activeWindowId = windowId;
        }

        this._tileWindows();
    }

    // public UnmanageWindow(window: Meta.Window) {
    //     this._windows.delete(window.get_id());
    //     this._unmanagedWindows.add(window.get_id())
    // }
    //
    // public ManageWindow(window: Meta.Window) {
    //     this._windows.set(window.get_id(), {
    //         window,
    //     })
    // }

    /**
     * Synchronizes the active window with GNOME's currently active window
     *
     * This function queries GNOME Shell for the current focused window and
     * updates the extension's active window tracking to match.
     *
     * @returns The window ID of the active window, or null if no window is active
     */
    public syncActiveWindow(): number | null {
        // // Get the active workspace
        // const workspace = global.workspace_manager.get_active_workspace();
        //
        // // Check if there is an active window
        // const activeWindow = global.display.get_focus_window();
        //
        // if (!activeWindow) {
        //     Logger.log("No active window found in GNOME");
        //     this._activeWindowId = null;
        //     return null;
        // }
        //
        // // Get the window ID
        // const windowId = activeWindow.get_id();
        //
        // // Check if this window is being managed by our extension
        // if (this._windows.has(windowId)) {
        //     Logger.log(`Setting active window to ${windowId}`);
        //     this._activeWindowId = windowId;
        //     return windowId;
        // } else {
        //     Logger.log(`Window ${windowId} is not managed by this extension`);
        //
        //     // Try to find a managed window on the current workspace to make active
        //     const managedWindows = Array.from(this._windows.entries())
        //         .filter(([_, wrapper]) =>
        //             wrapper.window && wrapper.window.get_workspace() === workspace);
        //
        //     if (managedWindows.length > 0) {
        //         // Take the first managed window on this workspace
        //         const firstWindowId = managedWindows[0][0];
        //         Logger.log(`Using managed window ${firstWindowId} as active instead`);
        //         this._activeWindowId = firstWindowId;
        //         return firstWindowId;
        //     }
        //
        //     // No managed windows on this workspace
        //     Logger.log("No managed windows found on the active workspace");
        //     this._activeWindowId = null;
        //     return null;
        // }
        return null;
    }

    _isWindowTileable(window: Meta.Window) {
        if (!window || !window.get_compositor_private()) {
            return false;
        }

        const windowType = window.get_window_type();
        Logger.log("WINDOW TYPE", windowType);
        // Skip certain types of windows
        return !window.is_skip_taskbar() &&
            windowType !== Meta.WindowType.DESKTOP &&
            windowType !== Meta.WindowType.DOCK &&
            windowType !== Meta.WindowType.DIALOG &&
            windowType !== Meta.WindowType.MODAL_DIALOG &&
            windowType !== Meta.WindowType.UTILITY &&
            windowType !== Meta.WindowType.MENU;
    }

    _tileWindows() {
        Logger.log("TILING WINDOWS")
        const workspace = global.workspace_manager.get_active_workspace();
        const workArea = workspace.get_work_area_for_monitor(
            global.display.get_primary_monitor()
        );
        Logger.log("Workspace", workspace);
        Logger.log("WorkArea", workArea);

        // Get all windows for current workspace
        const windows = Array.from(this._windows.values())
            .filter(({_window}) => {

                if (_window != null) {
                    return _window.get_workspace() === workspace;
                }
            })
            .map(x => x);

        if (windows.length === 0) {
            return;
        }
        this._tileHorizontally(windows, workArea)

    }


    _tileHorizontally(windows: (WindowWrapper | null)[], workArea: Mtk.Rectangle) {
        const windowWidth = Math.floor(workArea.width / windows.length);

        windows.forEach((window, index) => {
            const x = workArea.x + (index * windowWidth);
            const rect = {
                x: x,
                y: workArea.y,
                width: windowWidth,
                height: workArea.height
            };
            if (window != null) {
                window.safelyResizeWindow(rect.x, rect.y, rect.width, rect.height);
            }
        });
    }

}
