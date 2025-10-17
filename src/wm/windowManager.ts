import Meta from "gi://Meta";
// import Gio from "gi://Gio";
// import GLib from "gi://GLib";

import {WindowWrapper} from './window.js';
import * as Main from "resource:///org/gnome/shell/ui/main.js";
// import Mtk from "@girs/mtk-16";
import {Logger} from "../utils/logger.js";
import Monitor from "./monitor.js";
import WindowContainer from "./container.js";


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
    _changingGrabbedMonitor: boolean = false;

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

        // Sync the initially focused window
        this.syncActiveWindow();
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
            global.display.connect('notify::focus-window', () => {
                this.syncActiveWindow();
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
        if (op === Meta.GrabOp.MOVING_UNCONSTRAINED){

        }
        Logger.log("Grab Op Start", op);
        Logger.log(display, window, op)
        Logger.log(window.get_monitor())
        this._getWrappedWindow(window)?.startDragging();
        this._grabbedWindowMonitor = window.get_monitor();
        this._grabbedWindowId = window.get_id();
    }

    handleGrabOpEnd(display: Meta.Display, window: Meta.Window, op: Meta.GrabOp): void {
        Logger.log("Grab Op End ", op);
        Logger.log("primary display", display.get_primary_monitor())
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
            wrapped = new WindowWrapper(window, this.handleWindowMinimized);
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
        var wrapper = new WindowWrapper(window, this.handleWindowMinimized)
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
        const focusWindow = global.display.focus_window;
        if (focusWindow) {
            this._activeWindowId = focusWindow.get_id();
            Logger.debug(`Active window changed to: ${this._activeWindowId} (${focusWindow.get_title()})`);
        } else {
            this._activeWindowId = null;
            Logger.debug('No active window');
        }
        return this._activeWindowId;
    }

    /**
     * Toggles the orientation of the active container (the container holding the active window)
     */
    public toggleActiveContainerOrientation(): void {
        if (this._activeWindowId === null) {
            Logger.warn("No active window, cannot toggle container orientation");
            return;
        }

        // Find the active window's container
        const activeContainer = this._findActiveContainer();
        if (activeContainer) {
            activeContainer.toggleOrientation();
        } else {
            Logger.warn("Could not find container for active window");
        }
    }

    /**
     * Finds the container that directly contains the active window
     * @returns The container holding the active window, or null if not found
     */
    private _findActiveContainer(): WindowContainer | null {
        if (this._activeWindowId === null) {
            return null;
        }

        for (const monitor of this._monitors.values()) {
            const activeWorkspaceIndex = global.workspace_manager.get_active_workspace().index();
            const workspace = monitor._workspaces[activeWorkspaceIndex];

            // Check if the window is directly in the workspace container
            const windowWrapper = workspace.getWindow(this._activeWindowId);
            if (windowWrapper) {
                // Try to find the parent container
                const container = this._findContainerHoldingWindow(workspace, this._activeWindowId);
                return container;
            }
        }

        return null;
    }

    /**
     * Recursively finds the container that directly contains a specific window
     * @param container The container to search
     * @param windowId The window ID to find
     * @returns The container that directly contains the window, or null if not found
     */
    private _findContainerHoldingWindow(container: WindowContainer, windowId: number): WindowContainer | null {
        // Check if this container directly contains the window
        for (const item of container._tiledItems) {
            if (item instanceof WindowContainer) {
                // Recursively search nested containers
                const result = this._findContainerHoldingWindow(item, windowId);
                if (result) {
                    return result;
                }
            } else if (item.getWindowId() === windowId) {
                // Found it! Return this container as it directly holds the window
                return container;
            }
        }

        return null;
    }

    /**
     * Prints the tree structure of all monitors, workspaces, containers, and windows to the logs
     */
    public printTreeStructure(): void {
        Logger.info("=".repeat(80));
        Logger.info("WINDOW TREE STRUCTURE");
        Logger.info("=".repeat(80));
        Logger.info(`Active Window ID: ${this._activeWindowId ?? 'none'}`);
        Logger.info("=".repeat(80));

        const activeWorkspaceIndex = global.workspace_manager.get_active_workspace().index();

        this._monitors.forEach((monitor: Monitor, monitorId: number) => {
            const isActiveMonitor = this._activeWindowId !== null &&
                                   monitor.getWindow(this._activeWindowId) !== undefined;
            const monitorMarker = isActiveMonitor ? ' *' : '';

            Logger.info(`Monitor ${monitorId}${monitorMarker}:`);
            Logger.info(`  Work Area: x=${monitor._workArea.x}, y=${monitor._workArea.y}, w=${monitor._workArea.width}, h=${monitor._workArea.height}`);

            monitor._workspaces.forEach((workspace, workspaceIndex) => {
                const isActiveWorkspace = workspaceIndex === activeWorkspaceIndex;
                const workspaceMarker = isActiveWorkspace && isActiveMonitor ? ' *' : '';

                Logger.info(`  Workspace ${workspaceIndex}${workspaceMarker}:`);
                Logger.info(`    Orientation: ${workspace._orientation === 0 ? 'HORIZONTAL' : 'VERTICAL'}`);
                Logger.info(`    Items: ${workspace._tiledItems.length}`);

                this._printContainerTree(workspace, 4);
            });
        });

        Logger.info("=".repeat(80));
    }

    /**
     * Recursively prints the container tree structure
     * @param container The container to print
     * @param indentLevel The indentation level (number of spaces)
     */
    private _printContainerTree(container: any, indentLevel: number): void {
        const indent = " ".repeat(indentLevel);

        container._tiledItems.forEach((item: any, index: number) => {
            if (item instanceof WindowContainer) {
                // Check if this container contains the active window
                const containsActiveWindow = this._activeWindowId !== null &&
                                            item.getWindow(this._activeWindowId) !== undefined;
                const containerMarker = containsActiveWindow ? ' *' : '';

                Logger.info(`${indent}[${index}] Container (${item._orientation === 0 ? 'HORIZONTAL' : 'VERTICAL'})${containerMarker}:`);
                Logger.info(`${indent}    Items: ${item._tiledItems.length}`);
                Logger.info(`${indent}    Work Area: x=${item._workArea.x}, y=${item._workArea.y}, w=${item._workArea.width}, h=${item._workArea.height}`);
                this._printContainerTree(item, indentLevel + 4);
            } else {
                const window = item.getWindow();
                const isActiveWindow = this._activeWindowId === item.getWindowId();
                const windowMarker = isActiveWindow ? ' *' : '';

                Logger.info(`${indent}[${index}] Window ID: ${item.getWindowId()}${windowMarker}`);
                Logger.info(`${indent}    Title: "${window.get_title()}"`);
                Logger.info(`${indent}    Class: ${window.get_wm_class()}`);
                const rect = item.getRect();
                Logger.info(`${indent}    Rect: x=${rect.x}, y=${rect.y}, w=${rect.width}, h=${rect.height}`);
            }
        });
    }


}
