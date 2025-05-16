import {WindowWrapper} from "./window.js";
import {Logger} from "./utils/logger.js";
import Meta from "gi://Meta";
import queueEvent from "./utils/events.js";
import {Rect} from "./utils/rect.js";

enum Orientation {
    HORIZONTAL = 0,
    VERTICAL = 1,
}


export default class WindowContainer {

    _id: number;
    _items: Map<number, WindowWrapper | WindowContainer>;
    _minimizedItems: Map<number, WindowWrapper>;
    _workspace: number;
    _orientation: Orientation = Orientation.HORIZONTAL;
    _workArea: Rect;

    constructor(monitorId: number, workspaceArea: Rect, workspace: number) {
        this._id = monitorId;
        this._workspace = workspace;
        this._items = new Map<number, WindowWrapper>();
        this._minimizedItems = new Map<number, WindowWrapper>();
        this._workArea = workspaceArea;
    }

    getWorkspace(): number {
        return this._workspace;
    }

    move(rect: Rect): void {
        this._workArea = rect;
        this._tileWindows();
    }

    addWindow(winWrap: WindowWrapper): void {
        // Add window to managed windows
        if (!winWrap.getWindow().minimized) {
            this._items.set(winWrap.getWindowId(), winWrap);
            queueEvent({
                name: "tiling-windows",
                callback: () => {
                    this._tileWindows();
                }
            }, 100)
        } else {
            this._minimizedItems.set(winWrap.getWindowId(), winWrap);
        }
    }

    getWindow(win_id: number): WindowWrapper | WindowContainer | undefined {
        return this._items.get(win_id)
    }

    removeWindow(win_id: number): void {
        this._items.delete(win_id)
        this._tileWindows()
    }

    minimizeWindow(winWrap: WindowWrapper): void {
        this._items.delete(winWrap.getWindowId())
        this._minimizedItems.set(winWrap.getWindowId(), winWrap)
    }

    unminimizeWindow(winWrap: WindowWrapper): void {
        if (this._minimizedItems.has(winWrap.getWindowId())) {
            this._items.set(winWrap.getWindowId(), winWrap);
            this._minimizedItems.delete(winWrap.getWindowId());
        }
    }

    disconnectSignals(): void {
        this._items.forEach((item) => {
                if (item instanceof WindowContainer) {
                    item.disconnectSignals()
                } else {
                    item.disconnectWindowSignals();
                }
            }
        )
    }

    removeAllWindows(): void {
        this._items.clear()
    }

    _tileWindows() {
        Logger.log("TILING WINDOWS ON MONITOR", this._id)

        Logger.log("Workspace", this._workspace);
        Logger.log("WorkArea", this._workArea);

        // Get all windows for current workspace
        let tilable = this._getTilableItems();

        if (tilable.length !== 0) {
            this._tileHorizontally(tilable, )
        }
        return true
    }

    _getTilableItems(): (WindowWrapper|WindowContainer)[] {
        return Array.from(this._items.values())
    }


    _tileItems(windows: (WindowWrapper|WindowContainer)[]) {
        if (windows.length === 0){
            return;
        }
        if (this._orientation === Orientation.HORIZONTAL) {
            this._tileHorizontally(windows);
        } else {
            this._tileVertically(windows);
        }
    }

    _tileVertically(items: (WindowWrapper|WindowContainer)[]) {
        const containerHeight = Math.floor(this._workArea.height / items.length);

        items.forEach((item, index) => {
            const y = this._workArea.y + (index * containerHeight);
            const rect = {
                x: this._workArea.x,
                y: y,
                width: this._workArea.width,
                height: containerHeight
            };
            if (item != null) {
                if (item instanceof WindowContainer) {
                    item.move(rect)
                } else {
                    item.safelyResizeWindow(rect);
                }
            }
        });
    }

    _tileHorizontally(windows: (WindowWrapper|WindowContainer)[]) {
        const windowWidth = Math.floor(this._workArea.width / windows.length);

        windows.forEach((item, index) => {
            const x = this._workArea.x + (index * windowWidth);
            const rect = {
                x: x,
                y: this._workArea.y,
                width: windowWidth,
                height: this._workArea.height
            };
            if (item != null) {
                if (item instanceof WindowContainer) {
                    item.move(rect)
                } else {
                    item.safelyResizeWindow(rect);
                }
            }
        });
    }

}