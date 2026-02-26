import Meta from "gi://Meta";
import Gio from "gi://Gio";

import {WindowWrapper} from './window.js';
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {Logger} from "../utils/logger.js";
import Monitor from "./monitor.js";
import WindowContainer, {Layout} from "./container.js";
import {Rect} from "../utils/rect.js";


export interface IWindowManager {
    _activeWindowId: number | null;

    handleWindowClosed(winWrap: WindowWrapper): void;

    handleWindowMinimized(winWrap: WindowWrapper): void;

    handleWindowUnminimized(winWrap: WindowWrapper): void;

    handleWindowChangedWorkspace(winWrap: WindowWrapper): void;

    handleWindowPositionChanged(winWrap: WindowWrapper): void;

    syncActiveWindow(): number | null;
}


const _UNUSED_MONITOR_ID = -1;
const _UNUSED_WINDOW_ID  = -1;

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

    // -- Resize-drag tracking --------------------------------------------------
    _isResizeDrag: boolean = false;
    _resizeDragWindowId: number = _UNUSED_WINDOW_ID;
    _resizeDragOp: Meta.GrabOp = Meta.GrabOp.NONE;
    _resizeDragLastMouseX: number = 0;
    _resizeDragLastMouseY: number = 0;
    _isTiling: boolean = false;

    private readonly _settings: Gio.Settings;

    constructor(settings: Gio.Settings) {
        this._settings = settings;
    }

    public enable(): void {
        Logger.log("Starting Aerospike Window Manager");
        this.instantiateDisplaySignals();

        const mon_count = global.display.get_n_monitors();
        for (let i = 0; i < mon_count; i++) {
            this._monitors.set(i, new Monitor(i));
        }

        this.captureExistingWindows();
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
        );

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
                Logger.log("HIDING OVERVIEW")
                this._showingOverview = false;
                this._tileMonitors();
                for (const monitor of this._monitors.values()) {
                    monitor.showTabBars();
                }
            }),
            Main.overview.connect("showing", () => {
                this._showingOverview = true;
                Logger.log("SHOWING OVERVIEW");
                for (const monitor of this._monitors.values()) {
                    monitor.hideTabBars();
                }
            }),
        ];
    }

    public disable(): void {
        Logger.log("DISABLED AEROSPIKE WINDOW MANAGER!")
        this.disconnectSignals();
        this.removeAllWindows();
    }

    removeAllWindows(): void {
        this.disconnectMinimizedSignals();
        this._minimizedItems.clear();
        this._monitors.forEach((monitor: Monitor) => {
            monitor.removeAllWindows();
        })
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

    _isResizeOp(op: Meta.GrabOp): boolean {
        return op === Meta.GrabOp.RESIZING_E  ||
               op === Meta.GrabOp.RESIZING_W  ||
               op === Meta.GrabOp.RESIZING_N  ||
               op === Meta.GrabOp.RESIZING_S  ||
               op === Meta.GrabOp.RESIZING_NE ||
               op === Meta.GrabOp.RESIZING_NW ||
               op === Meta.GrabOp.RESIZING_SE ||
               op === Meta.GrabOp.RESIZING_SW;
    }

    handleGrabOpBegin(display: Meta.Display, window: Meta.Window, op: Meta.GrabOp): void {
        Logger.log("Grab Op Start", op);

        if (this._isResizeOp(op)) {
            Logger.log("Resize drag begin, op=", op);
            this._isResizeDrag = true;
            this._resizeDragWindowId = window.get_id();
            this._resizeDragOp = op;
            const [startMouseX, startMouseY] = global.get_pointer();
            this._resizeDragLastMouseX = startMouseX;
            this._resizeDragLastMouseY = startMouseY;
            this._getWrappedWindow(window)?.startDragging();
        } else {
            this._getWrappedWindow(window)?.startDragging();
            this._grabbedWindowMonitor = window.get_monitor();
            this._grabbedWindowId = window.get_id();
        }
    }

    handleGrabOpEnd(display: Meta.Display, window: Meta.Window, op: Meta.GrabOp): void {
        Logger.log("Grab Op End ", op);

        if (this._isResizeDrag) {
            Logger.log("Resize drag end, op=", op);
            this._isResizeDrag = false;
            this._resizeDragWindowId = _UNUSED_WINDOW_ID;
            this._resizeDragLastMouseX = 0;
            this._resizeDragLastMouseY = 0;
            this._resizeDragOp = Meta.GrabOp.NONE;
            this._getWrappedWindow(window)?.stopDragging();
            this._tileMonitors();
        } else {
            this._grabbedWindowId = _UNUSED_WINDOW_ID;
            this._getWrappedWindow(window)?.stopDragging();
            this._tileMonitors();
            Logger.info("monitor_start and monitor_end", this._grabbedWindowMonitor, window.get_monitor());
        }
    }

    _getWrappedWindow(window: Meta.Window): WindowWrapper | undefined {
        let wrapped: WindowWrapper | undefined = undefined;
        for (const monitor of this._monitors.values()) {
            wrapped = monitor.getWindow(window.get_id());
            if (wrapped !== undefined) break;
        }
        return wrapped;
    }

    _getAndRemoveWrappedWindow(window: Meta.Window): WindowWrapper | undefined {
        let wrapped: WindowWrapper | undefined = undefined;
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
            wrapped = new WindowWrapper(window, (winWrap) => this.handleWindowMinimized(winWrap));
            wrapped.connectWindowSignals(this);
        }
        let new_mon = this._monitors.get(monitorId);
        new_mon?.addWindow(wrapped)
        this._grabbedWindowMonitor = monitorId;
    }

    public handleWindowPositionChanged(winWrap: WindowWrapper): void {
        if (this._isTiling || this._changingGrabbedMonitor) return;

        if (this._isResizeDrag && winWrap.getWindowId() === this._resizeDragWindowId) {
            this._handleResizeDragUpdate(winWrap);
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
            if (monitorIndex === -1) return;

            if (monitorIndex !== this._grabbedWindowMonitor) {
                this._changingGrabbedMonitor = true;
                this._moveWindowToMonitor(winWrap.getWindow(), monitorIndex);
                this._changingGrabbedMonitor = false;
            }

            this._isTiling = true;
            try {
                this._monitors.get(monitorIndex)?.itemDragged(winWrap, mouseX, mouseY);
            } finally {
                this._isTiling = false;
            }
        }
    }

    private _handleResizeDragUpdate(winWrap: WindowWrapper): void {
        const op    = this._resizeDragOp;
        const winId = winWrap.getWindowId();

        const [mouseX, mouseY] = global.get_pointer();
        const dx = mouseX - this._resizeDragLastMouseX;
        const dy = mouseY - this._resizeDragLastMouseY;

        if (dx === 0 && dy === 0) return;

        this._resizeDragLastMouseX = mouseX;
        this._resizeDragLastMouseY = mouseY;

        const container = this._findContainerForWindowAcrossMonitors(winId);
        if (!container) {
            Logger.warn("_handleResizeDragUpdate: no container found for window", winId);
            return;
        }

        const itemIndex = container._getIndexOfWindow(winId);
        if (itemIndex === -1) return;

        const isHorizontal = container._orientation === Layout.ACC_HORIZONTAL;

        // E/S edge → boundary after the item; W/N edge → boundary before it.
        let adjusted = false;
        if (isHorizontal) {
            if (op === Meta.GrabOp.RESIZING_E || op === Meta.GrabOp.RESIZING_NE || op === Meta.GrabOp.RESIZING_SE) {
                adjusted = container.adjustBoundary(itemIndex, dx);
            } else if (op === Meta.GrabOp.RESIZING_W || op === Meta.GrabOp.RESIZING_NW || op === Meta.GrabOp.RESIZING_SW) {
                adjusted = container.adjustBoundary(itemIndex - 1, dx);
            }
        } else {
            if (op === Meta.GrabOp.RESIZING_S || op === Meta.GrabOp.RESIZING_SE || op === Meta.GrabOp.RESIZING_SW) {
                adjusted = container.adjustBoundary(itemIndex, dy);
            } else if (op === Meta.GrabOp.RESIZING_N || op === Meta.GrabOp.RESIZING_NE || op === Meta.GrabOp.RESIZING_NW) {
                adjusted = container.adjustBoundary(itemIndex - 1, dy);
            }
        }

        if (adjusted) {
            this._isTiling = true;
            try {
                container.drawWindows();
            } finally {
                this._isTiling = false;
            }
        }
    }

    private _findContainerForWindowAcrossMonitors(winId: number): WindowContainer | null {
        const activeWorkspaceIndex = global.workspace_manager.get_active_workspace().index();
        for (const monitor of this._monitors.values()) {
            if (activeWorkspaceIndex >= monitor._workspaces.length) continue;
            const container = monitor._workspaces[activeWorkspaceIndex].getContainerForWindow(winId);
            if (container !== null) return container;
        }
        return null;
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
        if (!this._isWindowTileable(window)) return;
        Logger.log("WINDOW IS TILABLE");
        this.addWindowToMonitor(window);
    }

    handleWindowClosed(window: WindowWrapper): void {
        const mon_id = window._window.get_monitor();
        this._monitors.get(mon_id)?.removeWindow(window);
        window.disconnectWindowSignals()
        this.syncActiveWindow();
        this._tileMonitors();
    }

    public addWindowToMonitor(window: Meta.Window) {
        Logger.log("ADDING WINDOW TO MONITOR", window, window);
        var wrapper = new WindowWrapper(window, (winWrap) => this.handleWindowMinimized(winWrap))
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
        this._isTiling = true;
        try {
            for (const monitor of this._monitors.values()) {
                monitor.tileWindows();
            }
        } catch (e) {
            Logger.error("_tileMonitors FAILED", e);
        } finally {
            this._isTiling = false;
        }
    }

    block_titles = [
        "org.gnome.Shell.Extensions",
    ]

    _isWindowTilingBlocked(window: Meta.Window): boolean {
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
        if (!window || !window.get_compositor_private()) return false;
        if (this._isWindowTilingBlocked(window)) return false;

        const windowType = window.get_window_type();
        Logger.log("WINDOW TILING CHECK",);

        return !window.is_skip_taskbar() &&
            windowType !== Meta.WindowType.DESKTOP &&
            windowType !== Meta.WindowType.DOCK &&
            windowType !== Meta.WindowType.DIALOG &&
            windowType !== Meta.WindowType.MODAL_DIALOG &&
            windowType !== Meta.WindowType.UTILITY &&
            windowType !== Meta.WindowType.MENU;
    }

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

    public toggleActiveContainerOrientation(): void {
        if (this._activeWindowId === null) {
            Logger.warn("No active window, cannot toggle container orientation");
            return;
        }
        const container = this._findContainerForWindowAcrossMonitors(this._activeWindowId);
        if (container) {
            container.toggleOrientation();
        } else {
            Logger.warn("Could not find container for active window");
        }
    }

    public resetActiveContainerRatios(): void {
        if (this._activeWindowId === null) {
            Logger.warn("No active window, cannot reset container ratios");
            return;
        }
        const container = this._findContainerForWindowAcrossMonitors(this._activeWindowId);
        if (container) {
            Logger.info("Resetting container ratios to equal splits");
            container.resetRatios();
        } else {
            Logger.warn("Could not find container for active window");
        }
    }

    public toggleActiveContainerTabbed(): void {
        if (this._activeWindowId === null) {
            Logger.warn("No active window, cannot toggle tabbed mode");
            return;
        }
        const container = this._findContainerForWindowAcrossMonitors(this._activeWindowId);
        if (container) {
            if (container.isTabbed()) {
                container.setAccordion(Layout.ACC_HORIZONTAL);
            } else {
                // Set the active tab to the focused window
                const activeIndex = container._getIndexOfWindow(this._activeWindowId);
                if (activeIndex !== -1) {
                    container._activeTabIndex = activeIndex;
                }
                container.setTabbed();
            }
            this._tileMonitors();
        } else {
            Logger.warn("Could not find container for active window");
        }
    }

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

            Logger.info(`Monitor ${monitorId}${isActiveMonitor ? ' *' : ''}:`);
            Logger.info(`  Work Area: x=${monitor._workArea.x}, y=${monitor._workArea.y}, w=${monitor._workArea.width}, h=${monitor._workArea.height}`);

            monitor._workspaces.forEach((workspace, workspaceIndex) => {
                const isActiveWorkspace = workspaceIndex === activeWorkspaceIndex;
                Logger.info(`  Workspace ${workspaceIndex}${isActiveWorkspace && isActiveMonitor ? ' *' : ''}:`);
                Logger.info(`    Orientation: ${Layout[workspace._orientation]}`);
                Logger.info(`    Items: ${workspace._tiledItems.length}`);
                if (workspace.isTabbed()) {
                    Logger.info(`    Active Tab: ${workspace._activeTabIndex}`);
                }
                this._printContainerTree(workspace, 4);
            });
        });

        Logger.info("=".repeat(80));
    }

    private _printContainerTree(container: WindowContainer, indentLevel: number): void {
        const indent = " ".repeat(indentLevel);

        container._tiledItems.forEach((item, index) => {
            if (item instanceof WindowContainer) {
                const containsActive = this._activeWindowId !== null &&
                                       item.getWindow(this._activeWindowId) !== undefined;
                Logger.info(`${indent}[${index}] Container (${Layout[item._orientation]})${containsActive ? ' *' : ''}:`);
                Logger.info(`${indent}    Items: ${item._tiledItems.length}`);
                Logger.info(`${indent}    Work Area: x=${item._workArea.x}, y=${item._workArea.y}, w=${item._workArea.width}, h=${item._workArea.height}`);
                this._printContainerTree(item, indentLevel + 4);
            } else {
                const window = item.getWindow();
                Logger.info(`${indent}[${index}] Window ID: ${item.getWindowId()}${this._activeWindowId === item.getWindowId() ? ' *' : ''}`);
                Logger.info(`${indent}    Title: "${window.get_title()}"`);
                Logger.info(`${indent}    Class: ${window.get_wm_class()}`);
                const rect = item.getRect();
                Logger.info(`${indent}    Rect: x=${rect.x}, y=${rect.y}, w=${rect.width}, h=${rect.height}`);
            }
        });
    }
}
