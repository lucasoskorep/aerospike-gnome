import {WindowWrapper} from "./window.js";
import {Logger} from "./utils/logger.js";
import Mtk from "@girs/mtk-16";
import Meta from "gi://Meta";


export default class MonitorManager {

    _id: number;
    _windows: Map<number, WindowWrapper>;
    _minimized: Map<number, WindowWrapper>;


    constructor(monitorId: number) {
        this._windows = new Map<number, WindowWrapper>();
        this._minimized = new Map<number, WindowWrapper>();

        this._id = monitorId;
    }

    addWindow(winWrap: WindowWrapper): void {
        // Add window to managed windows
        this._windows.set(winWrap.getWindowId(), winWrap);
        this._tileWindows();
    }

    getWindow(win_id: number): WindowWrapper | undefined {
        return this._windows.get(win_id)
    }

    removeWindow(win_id: number): void {
        this._windows.delete(win_id)
        this._tileWindows()
    }

    minimizeWindow(winWrap: WindowWrapper): void {
        this._windows.delete(winWrap.getWindowId())
        this._minimized.set(winWrap.getWindowId(), winWrap)
    }

    unminimizeWindow(winWrap: WindowWrapper): void {
        if (this._minimized.has(winWrap.getWindowId())) {
            this._windows.set(winWrap.getWindowId(), winWrap);
            this._minimized.delete(winWrap.getWindowId());
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