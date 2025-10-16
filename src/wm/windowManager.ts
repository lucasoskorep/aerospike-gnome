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

    handleWindowSizeChanged(winWrap: WindowWrapper): void;

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
    _changingGrabbedMonitor: boolean = false;
    _resizingWindow: boolean = false;
    _resizeOp: Meta.GrabOp | null = null;

    _showingOverview: boolean = false;

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
                if (this._showingOverview) {
                    if (this._getWrappedWindow(window) !== undefined) {
                        Logger.log("OVERVIEW - MOVING")
                        this._moveWindowToMonitor(window, monitor)
                    }
                }
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

        // this._windowManagerSignals = [
        //     global.window_manager.connect("show-tile-preview", (_, _metaWindow, _rect, _num) => {
        //         Logger.log("SHOW TITLE PREVIEW!")
        //     }),
        // ];

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
                this._showingOverview = false;
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
                this._showingOverview = true;
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
        Logger.log("Grab Op Start", op);
        Logger.log(display, window, op)
        Logger.log(window.get_monitor())

        const isResizing = this._isResizeOperation(op);
        if (isResizing) {
            this._resizingWindow = true;
            this._resizeOp = op;
        } else {
            this._getWrappedWindow(window)?.startDragging();
        }

        this._grabbedWindowMonitor = window.get_monitor();
        this._grabbedWindowId = window.get_id();
    }

    _isResizeOperation(op: Meta.GrabOp): boolean {
        return op === Meta.GrabOp.RESIZING_E ||
               op === Meta.GrabOp.RESIZING_W ||
               op === Meta.GrabOp.RESIZING_N ||
               op === Meta.GrabOp.RESIZING_S ||
               op === Meta.GrabOp.RESIZING_NE ||
               op === Meta.GrabOp.RESIZING_NW ||
               op === Meta.GrabOp.RESIZING_SE ||
               op === Meta.GrabOp.RESIZING_SW;
    }

    handleGrabOpEnd(display: Meta.Display, window: Meta.Window, op: Meta.GrabOp): void {
        Logger.log("Grab Op End ", op);
        Logger.log("primary display", display.get_primary_monitor())

        // Check if this was a resize operation
        if (this._isResizeOperation(op)) {
            const monitor = this._monitors.get(window.get_monitor());
            if (monitor) {
                monitor.windowManuallyResized(window.get_id());
            }
        }

        this._resizingWindow = false;
        this._resizeOp = null;
        this._grabbedWindowId = _UNUSED_WINDOW_ID;
        this._getWrappedWindow(window)?.stopDragging();
        this._tileMonitors();
        Logger.info("monitor_start and monitor_end", this._grabbedWindowMonitor, window.get_monitor());
    }

    _getWrappedWindow(window: Meta.Window): WindowWrapper | undefined {
        let wrapped = undefined;
        for (const monitor of this._monitors.values()) {
            wrapped = monitor.getWindow(window.get_id());
            if (wrapped !== undefined) {
                break;
            }
        }
        return wrapped;
    }

    _getAndRemoveWrappedWindow(window: Meta.Window): WindowWrapper | undefined {
        let wrapped = undefined;
        for (const monitor of this._monitors.values()) {
            wrapped = monitor.getWindow(window.get_id());
            if (wrapped !== undefined) {
                monitor.removeWindow(wrapped);
                break;
            }
        }
        return wrapped;
    }

    _moveWindowToMonitor(window: Meta.Window, monitorId: number): void {
        let wrapped = this._getAndRemoveWrappedWindow(window);
        if (wrapped === undefined) {
            Logger.error("WINDOW NOT DEFINED")
            wrapped = new WindowWrapper(window, this.handleWindowMinimized.bind(this));
            wrapped.connectWindowSignals(this);
        }
        let new_mon = this._monitors.get(monitorId);
        new_mon?.addWindow(wrapped)
        this._grabbedWindowMonitor = monitorId;
    }

    public handleWindowPositionChanged(winWrap: WindowWrapper): void {
        if (this._changingGrabbedMonitor) {
            return;
        }
        if (winWrap.getWindowId() === this._grabbedWindowId) {
            const [mouseX, mouseY, _] = global.get_pointer();

            let monitorIndex = -1;
            for (let i = 0; i < global.display.get_n_monitors(); i++) {
                const workArea = global.workspace_manager.get_active_workspace().get_work_area_for_monitor(i);
                if (mouseX >= workArea.x && mouseX < workArea.x + workArea.width &&
                    mouseY >= workArea.y && mouseY < workArea.y + workArea.height) {
                    monitorIndex = i;
                    break;
                }
            }
            if (monitorIndex === -1) {
                return
            }

            if (monitorIndex !== this._grabbedWindowMonitor) {
                this._changingGrabbedMonitor = true;
                this._moveWindowToMonitor(winWrap.getWindow(), monitorIndex);
                this._changingGrabbedMonitor = false
            }
            this._monitors.get(monitorIndex)?.itemDragged(winWrap, mouseX, mouseY);
        }
    }

    public handleWindowSizeChanged(winWrap: WindowWrapper): void {
        if (this._resizingWindow && winWrap.getWindowId() === this._grabbedWindowId) {
            // Check if this is a valid resize direction for the container
            const monitor = this._monitors.get(winWrap.getWindow().get_monitor());
            if (monitor && this._resizeOp) {
                monitor.windowResizing(winWrap.getWindowId(), this._resizeOp);
            }
        }
    }


    public handleWindowMinimized(winWrap: WindowWrapper): void {
        const monitor_id = winWrap.getWindow().get_monitor()
        this._minimizedItems.set(winWrap.getWindowId(), winWrap);
        this._monitors.get(monitor_id)?.removeWindow(winWrap);
        this._tileMonitors()
    }

    public handleWindowUnminimized(winWrap: WindowWrapper): void {
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
        const workspace = global.workspace_manager.get_active_workspace();
        const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace);
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
        var wrapper = new WindowWrapper(window, this.handleWindowMinimized.bind(this))
        wrapper.connectWindowSignals(this);
        this._addWindowWrapperToMonitor(wrapper);

    }

    _addWindowWrapperToMonitor(winWrap: WindowWrapper) {
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

    block_titles = [
        "org.gnome.Shell.Extensions",
    ]

    _isWindowTilingBlocked(window: Meta.Window) : boolean {
        Logger.info("title", window.get_title());
        Logger.info("description", window.get_description());
        Logger.info("class", window.get_wm_class());
        Logger.info("class", window.get_wm_class_instance());
        return this.block_titles.some((title) => {
            if (window.get_wm_class() === title) {
                Logger.log("WINDOW BLOCKED FROM TILING", window.get_title());
                return true;
            }
            return false;
        });
    }

    _isWindowTileable(window: Meta.Window) {

        if (!window || !window.get_compositor_private()) {
            return false;
        }
        if (this._isWindowTilingBlocked(window)) {
            return false;
        }
        const windowType = window.get_window_type();
        Logger.log("WINDOW TILING CHECK",);

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

    public resetAllWindowSizes(): void {
        Logger.log("Resetting all custom window sizes");
        this._monitors.forEach((monitor: Monitor) => {
            monitor.resetAllWindowSizes();
        });
        this._tileMonitors();
    }


}
