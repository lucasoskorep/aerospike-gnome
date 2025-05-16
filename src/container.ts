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
    _tiledItems: (WindowWrapper | WindowContainer)[];
    _tiledWindowLookup: Map<number, WindowWrapper>;
    _workspace: number;
    _orientation: Orientation = Orientation.HORIZONTAL;
    _workArea: Rect;

    constructor(monitorId: number, workspaceArea: Rect, workspace: number) {
        this._id = monitorId;
        this._workspace = workspace;
        this._tiledItems = [];
        this._tiledWindowLookup = new Map<number, WindowWrapper>();
        this._workArea = workspaceArea;
    }

    getWorkspace(): number {
        return this._workspace;
    }

    move(rect: Rect): void {
        this._workArea = rect;
        this.tileWindows();
    }

    addWindow(winWrap: WindowWrapper): void {
        // Add window to managed windows
        this._tiledItems.push(winWrap);
        this._tiledWindowLookup.set(winWrap.getWindowId(), winWrap);
        queueEvent({
            name: "tiling-windows",
            callback: () => {
                this.tileWindows();
            }
        }, 100)

    }

    getWindow(win_id: number): WindowWrapper | undefined {
        if (this._tiledWindowLookup.has(win_id)) {
            return this._tiledWindowLookup.get(win_id);
        }
        for (const item of this._tiledItems) {
            if (item instanceof WindowContainer) {
                const win = item.getWindow(win_id);
                if (win) {
                    return win;
                }
            } else if (item.getWindowId() === win_id) {
                return item;
            }
        }
        return undefined
    }

    _getIndexOfWindow(win_id: number) {
        for (let i = 0; i < this._tiledItems.length; i++) {
            const item = this._tiledItems[i];
            if (item instanceof WindowWrapper && item.getWindowId() === win_id) {
                return i;
            }
        }
        return -1
    }

    removeWindow(win_id: number): void {
        if (this._tiledWindowLookup.has(win_id)) {
            this._tiledWindowLookup.delete(win_id);
            const index = this._getIndexOfWindow(win_id)
            this._tiledItems.splice(index, 1);
        } else {
            for (const item of this._tiledItems) {
                if (item instanceof WindowContainer) {
                    item.removeWindow(win_id);
                }
            }
        }
        this.tileWindows()
    }

    disconnectSignals(): void {
        this._tiledItems.forEach((item) => {
                if (item instanceof WindowContainer) {
                    item.disconnectSignals()
                } else {
                    item.disconnectWindowSignals();
                }
            }
        )
    }

    removeAllWindows(): void {
        this._tiledItems = []
        this._tiledWindowLookup.clear()
    }

    tileWindows() {
        Logger.log("TILING WINDOWS ON MONITOR", this._id)

        Logger.log("Workspace", this._workspace);
        Logger.log("WorkArea", this._workArea);

        // Get all windows for current workspace
        let tilable = this._getTilableItems();

        if (tilable.length !== 0) {
            this._tileItems(tilable)
        }
        return true
    }

    _getTilableItems(): (WindowWrapper | WindowContainer)[] {
        return Array.from(this._tiledItems.values())
    }

    _tileItems(windows: (WindowWrapper | WindowContainer)[]) {
        if (windows.length === 0) {
            return;
        }
        if (this._orientation === Orientation.HORIZONTAL) {
            this._tileHorizontally(windows);
        } else {
            this._tileVertically(windows);
        }
    }

    _tileVertically(items: (WindowWrapper | WindowContainer)[]) {
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

    _tileHorizontally(windows: (WindowWrapper | WindowContainer)[]) {
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