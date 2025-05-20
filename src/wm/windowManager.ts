import Meta from "gi://Meta";
// import Gio from "gi://Gio";
// import GLib from "gi://GLib";

import {WindowWrapper} from './window.js';
import * as Main from "resource:///org/gnome/shell/ui/main.js";
// import Mtk from "@girs/mtk-16";
import {Logger} from "../utils/logger.js";
import Monitor from "./monitor.js";


export interface IWindowManager {
    _activeWindowId: number | null;

    // addWindow(window: Meta.Window): void;

    handleWindowClosed(winWrap: WindowWrapper): void;

    handleWindowMinimized(winWrap: WindowWrapper): void;

    handleWindowUnminimized(winWrap: WindowWrapper): void;

    handleWindowChangedWorkspace(winWrap: WindowWrapper): void;

    handleWindowPositionChanged(winWrap: WindowWrapper): void;

    syncActiveWindow(): number | null;
}


const _UNUSED_MONITOR_ID = -1
const _UNUSED_WINDOW_ID = -1

export default class WindowManager implements IWindowManager {
    _displaySignals: number[] = [];
    _windowManagerSignals: number[] = [];
    _workspaceManagerSignals: number[] = [];
    _overviewSignals: number[] = [];

    _activeWindowId: number | null = null;
    _monitors: Map<number, Monitor> = new Map<number, Monitor>();

    _minimizedItems: Map<number, WindowWrapper> = new Map<number, WindowWrapper>();

    _grabbedWindowMonitor: number = _UNUSED_MONITOR_ID;
    _grabbedWindowId: number = _UNUSED_WINDOW_ID;

    constructor() {


    }

    public enable(): void {
        Logger.log("Starting Aerospike Window Manager");
        // Connect window signals
        this.instantiateDisplaySignals();

        const mon_count = global.display.get_n_monitors();
        for (let i = 0; i < mon_count; i++) {
            this._monitors.set(i, new Monitor(i));
        }

        this.captureExistingWindows();
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
                // this._moveWindowToMonitor(window, monitor);
            }),
            global.display.connect('window-created', (display, window) => {
                this.handleWindowCreated(display, window);
            }),

            global.display.connect("showing-desktop-changed", () => {
                Logger.log("SHOWING DESKTOP CHANGED");
            }),
            global.display.connect("workareas-changed", (display) => {
                Logger.log("WORK AREAS CHANGED",);
                console.log(display.get_workspace_manager().get_active_workspace_index())
            }),
            global.display.connect("in-fullscreen-changed", () => {
                Logger.log("IN FULL SCREEN CHANGED");
            }),
        )

        this._windowManagerSignals = [
            global.window_manager.connect("show-tile-preview", (_, _metaWindow, _rect, _num) => {
                Logger.log("SHOW TITLE PREVIEW!")
            }),
        ];

        this._workspaceManagerSignals = [
            global.workspace_manager.connect("showing-desktop-changed", () => {
                Logger.log("SHOWING DESKTOP CHANGED AT WORKSPACE LEVEL");
            }),
            global.workspace_manager.connect("workspace-added", (_, wsIndex) => {
                Logger.log("WORKSPACE ADDED", wsIndex);
                this._monitors.forEach((monitor: Monitor) => {
                    monitor.addWorkspace();
                })
            }),
            global.workspace_manager.connect("workspace-removed", (_, wsIndex) => {
                Logger.log("WORKSPACE REMOVED", wsIndex);
                this._monitors.forEach((monitor: Monitor) => {
                    monitor.removeWorkspace(wsIndex);
                })
            }),
            global.workspace_manager.connect("active-workspace-changed", (source) => {
                Logger.log("Active workspace-changed", source.get_active_workspace().index());
            }),
        ];

        this._overviewSignals = [
            Main.overview.connect("hiding", () => {
                // this.fromOverview = true;
                Logger.log("HIDING OVERVIEW")
                this._tileMonitors();
                // const eventObj = {
                //     name: "focus-after-overview",
                //     callback: () => {
                //         Logger.log("FOCUSING AFTER OVERVIEW");
                //     },
                // };
                // this.queueEvent(eventObj);
            }),
            Main.overview.connect("showing", () => {
                // this.toOverview = true;
                Logger.log("SHOWING OVERVIEW");
            }),
        ];


    }

    public disable(): void {
        Logger.log("DISABLED AEROSPIKE WINDOW MANAGER!")
        // Disconnect the focus signal and remove any existing borders
        this.disconnectSignals();
        this.removeAllWindows();
    }

    removeAllWindows(): void {
        this._monitors.forEach((monitor: Monitor) => {
            monitor.removeAllWindows();
        })
        this._minimizedItems.clear();
    }


    disconnectSignals(): void {
        this.disconnectDisplaySignals();
        this.disconnectMonitorSignals();
        this.disconnectMinimizedSignals();
    }

    disconnectMonitorSignals(): void {
        this._monitors.forEach((monitor: Monitor) => {
            monitor.disconnectSignals();
        })
    }

    disconnectDisplaySignals(): void {
        this._displaySignals.forEach((signal) => {
            global.display.disconnect(signal)
        })
        this._windowManagerSignals.forEach((signal) => {
            global.window_manager.disconnect(signal)
        })
        this._workspaceManagerSignals.forEach((signal) => {
            global.workspace_manager.disconnect(signal)
        })
        this._overviewSignals.forEach((signal) => {
            Main.overview.disconnect(signal)
        })
    }

    disconnectMinimizedSignals(): void {
        this._minimizedItems.forEach((item) => {
            item.disconnectWindowSignals();
        })
    }


    handleGrabOpBegin(display: Meta.Display, window: Meta.Window, op: Meta.GrabOp): void {
        Logger.log("Grab Op Start");
        Logger.log(display, window, op)
        Logger.log(window.get_monitor())

        this._grabbedWindowMonitor = window.get_monitor();
        this._grabbedWindowId = window.get_id();
    }

    handleGrabOpEnd(display: Meta.Display, window: Meta.Window, op: Meta.GrabOp): void {
        Logger.log("Grab Op End ", op);
        Logger.log("primary display", display.get_primary_monitor())
        this._grabbedWindowId = _UNUSED_WINDOW_ID;
        var rect = window.get_frame_rect()
        Logger.info("Release Location", window.get_monitor(), rect.x, rect.y, rect.width, rect.height)
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
                old_mon.removeWindow(wrapped)
            }
            new_mon.addWindow(wrapped)
        }
        this._tileMonitors();
        Logger.info("monitor_start and monitor_end", this._grabbedWindowMonitor, window.get_monitor());
    }

    _moveWindowToMonitor(window: Meta.Window, monitorId: number): void {
        let wrapped = undefined;
        for (const monitor of this._monitors.values()) {
            wrapped = monitor.getWindow(window.get_id());
            if (wrapped !== undefined) {
                monitor.removeWindow(wrapped);
                break;
            }
        }
        if (wrapped === undefined) {
            wrapped = new WindowWrapper(window, this.handleWindowMinimized);
            wrapped.connectWindowSignals(this);
        }
        let new_mon = this._monitors.get(monitorId);
        new_mon?.addWindow(wrapped)
        this._tileMonitors();
    }

    public handleWindowPositionChanged(winWrap: WindowWrapper): void {
        if (winWrap.getWindowId() === this._grabbedWindowId) {
            const rect = winWrap.getRect();
            // Logger.log("GRABBED WINDOW POSITION CHANGED", rect.x);
            const [mouseX, mouseY, _] = global.get_pointer();
            this._monitors.get(winWrap.getMonitor())?.itemDragged(winWrap, mouseX, mouseY);

            // Log or use the coordinates
            // console.log(`Mouse position: X=${mouseX}, Y=${mouseY}`);

        }
    }


    public handleWindowMinimized(winWrap: WindowWrapper): void {
        Logger.warn("WARNING MINIMIZING WINDOW");
        Logger.log("WARNING MINIMIZED", JSON.stringify(winWrap));
        const monitor_id = winWrap.getWindow().get_monitor()
        Logger.log("WARNING MINIMIZED", monitor_id);
        Logger.warn("WARNING MINIMIZED", this._monitors);

        this._minimizedItems.set(winWrap.getWindowId(), winWrap);
        this._monitors.get(monitor_id)?.removeWindow(winWrap);

        Logger.warn("WARNING MINIMIZED ITEMS", JSON.stringify(this._minimizedItems));
        this._tileMonitors()
    }

    public handleWindowUnminimized(winWrap: WindowWrapper): void {
        Logger.log("WINDOW UNMINIMIZED");
        Logger.log("WINDOW UNMINIMIZED", winWrap == null);
        // Logger.log("WINDOW UNMINIMIZED", winWrap);
        // Logger.log("WINDOW UNMINIMIZED", winWrap.getWindowId());
        this._minimizedItems.delete(winWrap.getWindowId());
        this._addWindowWrapperToMonitor(winWrap);
        this._tileMonitors()
    }


    public handleWindowChangedWorkspace(winWrap: WindowWrapper): void {
        const monitor = winWrap.getWindow().get_monitor();
        this._monitors.get(monitor)?.removeWindow(winWrap);
        this._monitors.get(monitor)?.addWindow(winWrap);
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
        this.addWindowToMonitor(window);
    }


    /**
     * Handle window closed event
     */
    handleWindowClosed(window: WindowWrapper): void {

        const mon_id = window._window.get_monitor();

        this._monitors.get(mon_id)?.removeWindow(window);

        window.disconnectWindowSignals()
        // Remove from managed windows
        this.syncActiveWindow();
        // Retile remaining windows
        this._tileMonitors();
    }


    public addWindowToMonitor(window: Meta.Window) {

        Logger.log("ADDING WINDOW TO MONITOR", window, window);
        var wrapper = new WindowWrapper(window, this.handleWindowMinimized)
        wrapper.connectWindowSignals(this);
        this._addWindowWrapperToMonitor(wrapper);

    }

    _addWindowWrapperToMonitor(winWrap: WindowWrapper) {
        Logger.log("Adding window", JSON.stringify(winWrap));
        Logger.log("Adding window raw", JSON.stringify(winWrap.getWindow()));
        Logger.log("Adding window raw", JSON.stringify(winWrap.getWindow().minimized));
        if (winWrap.getWindow().minimized) {
            this._minimizedItems.set(winWrap.getWindow().get_id(), winWrap);
        } else {
            this._monitors.get(winWrap.getWindow().get_monitor())?.addWindow(winWrap)
        }
    }

    _tileMonitors(): void {

        for (const monitor of this._monitors.values()) {
            monitor.tileWindows()
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
        return null;
    }


}
