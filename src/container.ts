import {WindowWrapper} from "./window.js";
import {Logger} from "./utils/logger.js";
import Mtk from "@girs/mtk-16";
import Meta from "gi://Meta";
import GLib from "gi://GLib";
import queueEvent from "./utils/events.js";
import {Rect} from "./utils/rect.js";


export default class WindowContainer {

    _id: number;
    _windows: Map<number, WindowWrapper>;
    _minimizedWindows: Map<number, WindowWrapper>;
    _workArea: Rect;

    constructor(monitorId: number, workspaceArea: Rect) {
        this._windows = new Map<number, WindowWrapper>();
        this._minimizedWindows = new Map<number, WindowWrapper>();
        const workspace = global.workspace_manager.get_active_workspace();
        this._id = monitorId;
        const _workArea = workspace.get_work_area_for_monitor(
            this._id
        );
    }

    addWindow(winWrap: WindowWrapper): void {
        // Add window to managed windows
        this._windows.set(winWrap.getWindowId(), winWrap);
        queueEvent({
            name: "tiling-windows",
            callback: () => {
                this._tileWindows();
            }
        }, 100)
    }

    getWindow(win_id: number): WindowWrapper | undefined {
        return this._windows.get(win_id)
    }

    removeWindow(win_id: number): void {
        this._windows.delete(win_id)
        // TODO: Should there be re-tiling in this function?
        this._tileWindows()
    }

    minimizeWindow(winWrap: WindowWrapper): void {
        this._windows.delete(winWrap.getWindowId())
        this._minimizedWindows.set(winWrap.getWindowId(), winWrap)
    }

    unminimizeWindow(winWrap: WindowWrapper): void {
        if (this._minimizedWindows.has(winWrap.getWindowId())) {
            this._windows.set(winWrap.getWindowId(), winWrap);
            this._minimizedWindows.delete(winWrap.getWindowId());
        }
    }

    disconnectSignals(): void {
        this._windows.forEach((window) => {
                window.disconnectWindowSignals();
            }
        )
    }

    removeAllWindows(): void {
        this._windows.clear()
    }

    _tileWindows() {
        Logger.log("TILING WINDOWS ON MONITOR", this._id)
        const workspace = global.workspace_manager.get_active_workspace();
        const workArea = workspace.get_work_area_for_monitor(
            this._id
        );

        Logger.log("Workspace", workspace);
        Logger.log("WorkArea", workArea);

        // Get all windows for current workspace

        let windows = this._getTilableWindows(workspace)

        if (windows.length !== 0) {
            this._tileHorizontally(windows, workArea)
        }
        return true
    }

    _getTilableWindows(workspace: Meta.Workspace): WindowWrapper[] {

        return Array.from(this._windows.values())
            .filter(({_window}) => {
                Logger.log("TILING WINDOW:", _window.get_id())
                return _window.get_workspace() === workspace;
            })
            .map(x => x);
    }

    _tileHorizontally(windows: (WindowWrapper)[], workArea: Mtk.Rectangle) {
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
                window.safelyResizeWindow(rect);
            }
        });
    }

}