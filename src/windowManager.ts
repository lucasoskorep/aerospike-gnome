import Meta from "gi://Meta";
import Gio from "gi://Gio";
import GLib from "gi://GLib";

import {WindowWrapper} from './window.js';
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Mtk from "@girs/mtk-16";
import {Logger} from "./utils/logger.js";
import MonitorManager from "./monitor.js";


export interface IWindowManager {
    _activeWindowId: number | null;

    // addWindow(window: Meta.Window): void;

    handleWindowClosed(winWrap: WindowWrapper): void;
    handleWindowMinimized(winWrap: WindowWrapper): void;
    handleWindowUnminimized(winWrap: WindowWrapper): void;


    // removeFromTree(window: Meta.Window): void;
    syncActiveWindow(): number | null;
}

const _UNUSED_MONITOR_ID = -1
export default class WindowManager implements IWindowManager {
    _displaySignals: number[];
    _windowManagerSignals: number[];
    _workspaceManagerSignals: number[];
    _shieldScreenSignals: number[];
    _overviewSignals: number[];
    _activeWindowId: number | null;
    _grabbedWindowMonitor: number;
    _monitors: Map<number, MonitorManager>;
    _sessionProxy: Gio.DBusProxy | null;
    _lockedSignalId: number | null;
    _isScreenLocked: boolean;

    constructor() {
        this._displaySignals = [];
        this._windowManagerSignals = [];
        this._workspaceManagerSignals = [];
        this._overviewSignals = [];
        this._shieldScreenSignals = [];
        this._activeWindowId = null;
        this._grabbedWindowMonitor = _UNUSED_MONITOR_ID;
        this._monitors = new Map<number, MonitorManager>();
        this._sessionProxy = null;
        this._lockedSignalId = null;
        this._isScreenLocked = false;

    }

    public enable(): void {
        Logger.log("Starting Aerospike Window Manager");
        this.captureExistingWindows();
        // Connect window signals
        this.instantiateDisplaySignals()

        const mon_count = global.display.get_n_monitors();
        for (let i = 0; i < mon_count; i++) {
            this._monitors.set(i, new MonitorManager(i));
        }
    }

    public disable(): void {
        Logger.log("DISABLED AEROSPIKE WINDOW MANAGER!")
        // Disconnect the focus signal and remove any existing borders
        this.disconnectDisplaySignals();
        this.removeAllWindows();
    }

    removeAllWindows(): void {
        this._monitors.forEach((monitor: MonitorManager) => {
            monitor.removeAllWindows();
        })
    }


    instantiateDisplaySignals(): void {
        this._displaySignals.push(
            global.display.connect("grab-op-begin", (display, window, op) => {
                this.handleGrabOpBegin(display, window, op)
            }),
            global.display.connect("grab-op-end", (display, window, op) => {
                this.handleGrabOpEnd(display, window, op)
            }),
            global.display.connect("window-entered-monitor", (display, monitor, window) => {
                Logger.log("WINDOW HAS ENTERED NEW MONITOR!")
            }),
            global.display.connect('window-created', (display, window) => {
                this.handleWindowCreated(display, window);
            }),
            global.display.connect("showing-desktop-changed", () => {
                Logger.log("SHOWING DESKTOP CHANGED");
            }),
            global.display.connect("workareas-changed", () => {
                Logger.log("WORK AREAS CHANGED");
            }),
            global.display.connect("in-fullscreen-changed", () => {
                Logger.log("IN FULL SCREEN CHANGED");
            }),
        )


        this._windowManagerSignals = [
            // global.window_manager.connect("minimize", (_source, window) => {
            //     Logger.log("MINIMIZING WINDOW")
            // }),
            // global.window_manager.connect("unminimize", (_source, window) => {
            //     Logger.log("WINDOW UNMINIMIZED");
            // }),
            global.window_manager.connect("show-tile-preview", (_, _metaWindow, _rect, _num) => {
                Logger.log("SHOW TITLE PREVIEW!")
            }),
        ];


        this._workspaceManagerSignals = [
            global.workspace_manager.connect("showing-desktop-changed", () => {
                Logger.log("SHOWING DESKTOP CHANGED AT WORKSPACE LEVEL");
            }),
            global.workspace_manager.connect("workspace-added", (_, wsIndex) => {
                Logger.log("WORKSPACE ADDED");
            }),
            global.workspace_manager.connect("workspace-removed", (_, wsIndex) => {
                Logger.log("WORKSPACE REMOVED");
            }),
            global.workspace_manager.connect("active-workspace-changed", () => {
                Logger.log("Active workspace-changed");
            }),
        ];


        this._overviewSignals = [
            Main.overview.connect("hiding", () => {
                // this.fromOverview = true;
                Logger.log("HIDING OVERVIEW")
                const eventObj = {
                    name: "focus-after-overview",
                    callback: () => {
                        // const focusNodeWindow = this.tree.findNode(this.focusMetaWindow);
                        // this.updateStackedFocus(focusNodeWindow);
                        // this.updateTabbedFocus(focusNodeWindow);
                        // this.movePointerWith(focusNodeWindow);
                        Logger.log("FOCUSING AFTER OVERVIEW");
                    },
                };
                // this.queueEvent(eventObj);
            }),
            Main.overview.connect("showing", () => {
                // this.toOverview = true;
                Logger.log("SHOWING OVERVIEW");
            }),
        ];

        // Main.screenShield;

        // Handler for lock event
        this._shieldScreenSignals.push(Main.screenShield.connect('lock-screen', () => {
                console.log('Session locked at:', new Date().toISOString());
            }), Main.screenShield.connect('unlock-screen', () => {
                console.log('Session unlocked at:', new Date().toISOString());
            })
        );

        // Handler for unlock event

        // this._signalsBound = true;

    }

    disconnectDisplaySignals(): void {
        this._displaySignals.forEach((signal) => {
            global.disconnect(signal)
        })
        this._windowManagerSignals.forEach((signal) => {
            global.disconnect(signal)
        })
        this._workspaceManagerSignals.forEach((signal) => {
            global.disconnect(signal)
        })
    }

    handleGrabOpBegin(display: Meta.Display, window: Meta.Window, op: Meta.GrabOp): void {
        Logger.log("Grab Op Start");
        Logger.log(display, window, op)
        Logger.log(window.get_monitor())
        this._grabbedWindowMonitor = window.get_monitor();
    }

    handleGrabOpEnd(display: Meta.Display, window: Meta.Window, op: Meta.GrabOp): void {
        Logger.log("Grab Op End ", op);
        Logger.log("primary display", display.get_primary_monitor())
        var rect = window.get_frame_rect()
        Logger.info("Release Location", window.get_monitor(), rect.x, rect.y, rect.width, rect.height)
        this._tileMonitors();
        const old_mon_id = this._grabbedWindowMonitor;
        const new_mon_id = window.get_monitor();

        Logger.info("MONITOR MATCH", old_mon_id !== new_mon_id);
        if (old_mon_id !== new_mon_id) {
            Logger.trace("MOVING MONITOR");
            let old_mon = this._monitors.get(old_mon_id);
            let new_mon = this._monitors.get(new_mon_id);
            if (old_mon === undefined || new_mon === undefined) {
                return;
            }
            let wrapped = old_mon.getWindow(window.get_id())
            if (wrapped === undefined) {
                wrapped = new WindowWrapper(window, this.handleWindowMinimized);
            } else {
                old_mon.removeWindow(window.get_id())
            }
            new_mon.addWindow(wrapped)
        }
        Logger.info("monitor_start and monitor_end", this._grabbedWindowMonitor, window.get_monitor());
    }

    public handleWindowMinimized(winWrap: WindowWrapper): void {
        Logger.warn("WARNING MINIMIZING WINDOW");
        Logger.log("WARNING MINIMIZED", winWrap);
        const monitor_id = winWrap.getWindow().get_monitor()
        Logger.log("WARNING MINIMIZED", monitor_id);
        Logger.warn("WARNING MINIMIZED", this._monitors);
        this._monitors.get(monitor_id)?.minimizeWindow(winWrap);
        this._tileMonitors()
    }

    public handleWindowUnminimized(winWrap: WindowWrapper): void {
        Logger.log("WINDOW UNMINIMIZED");
        const monitor_id = winWrap.getWindow().get_monitor()
        this._monitors.get(monitor_id)?.unminimizeWindow(winWrap);
        this._tileMonitors()
    }

    public captureExistingWindows() {
        Logger.log("CAPTURING WINDOWS")
        const workspace = global.workspace_manager.get_active_workspace();
        const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace);
        Logger.log("WINDOWS", windows);
        windows.forEach(window => {
            if (this._isWindowTileable(window)) {
                this.addWindowToMonitor(window);
            }
        });

        this._tileMonitors();
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
        this.addWindowToMonitor(window);
    }


    /**
     * Handle window closed event
     */
    handleWindowClosed(window: WindowWrapper): void {

        window.disconnectWindowSignals()
        const mon_id = window._window.get_monitor();
        this._monitors.get(mon_id)?.removeWindow(window.getWindowId());

        // Remove from managed windows
        this.syncActiveWindow();
        // Retile remaining windows
        this._tileMonitors();
    }


    public addWindowToMonitor(window: Meta.Window) {
        var wrapper = new WindowWrapper(window, this.handleWindowMinimized)
        wrapper.connectWindowSignals(this)
        this._monitors.get(window.get_monitor())?.addWindow(wrapper)
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

    _tileMonitors(): void {
        for (const monitor of this._monitors.values()) {
            monitor._tileWindows()
        }
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


}
