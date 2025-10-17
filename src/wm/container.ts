import {WindowWrapper} from "./window.js";
import {Logger} from "../utils/logger.js";
import Meta from "gi://Meta";
import queueEvent from "../utils/events.js";
import {Rect} from "../utils/rect.js";

enum Orientation {
    HORIZONTAL = 0,
    VERTICAL = 1,
}


export default class WindowContainer {

    _tiledItems: (WindowWrapper | WindowContainer)[];
    _tiledWindowLookup: Map<number, WindowWrapper>;
    _orientation: Orientation = Orientation.HORIZONTAL;
    _workArea: Rect;

    constructor(workspaceArea: Rect,) {
        this._tiledItems = [];
        this._tiledWindowLookup = new Map<number, WindowWrapper>();
        this._workArea = workspaceArea;
    }


    move(rect: Rect): void {
        this._workArea = rect;
        this.tileWindows();
    }

    toggleOrientation(): void {
        this._orientation = this._orientation === Orientation.HORIZONTAL
            ? Orientation.VERTICAL
            : Orientation.HORIZONTAL;
        Logger.info(`Container orientation toggled to ${this._orientation === Orientation.HORIZONTAL ? 'HORIZONTAL' : 'VERTICAL'}`);
        this.tileWindows();
    }

    addWindow(winWrap: WindowWrapper): void {
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
        Logger.log("TILING WINDOWS IN CONTAINER")

        Logger.log("WorkArea", this._workArea);

        this._tileItems()

        return true
    }

    _tileItems() {
        if (this._tiledItems.length === 0) {
            return;
        }
        const bounds = this.getBounds();
        this._tiledItems.forEach((item, index) => {
            const rect = bounds[index];
            if (item instanceof WindowContainer) {
                item.move(rect);
            } else {
                item.safelyResizeWindow(rect);
            }
        })
    }


    getBounds(): Rect[] {
        if (this._orientation === Orientation.HORIZONTAL) {
            return this.getHorizontalBounds();
        }
        return this.getVerticalBounds();
    }

    getVerticalBounds(): Rect[] {
        const items = this._tiledItems
        const containerHeight = Math.floor(this._workArea.height / items.length);
        return items.map((_, index) => {
            const y = this._workArea.y + (index * containerHeight);
            return {
                x: this._workArea.x,
                y: y,
                width: this._workArea.width,
                height: containerHeight
            } as Rect;
        });
    }

    getHorizontalBounds(): Rect[] {
        const windowWidth = Math.floor(this._workArea.width / this._tiledItems.length);

        return this._tiledItems.map((_, index) => {
            const x = this._workArea.x + (index * windowWidth);
            return {
                x: x,
                y: this._workArea.y,
                width: windowWidth,
                height: this._workArea.height
            } as Rect;
        });
    }

    getIndexOfItemNested(item: WindowWrapper): number {
        for (let i = 0; i < this._tiledItems.length; i++) {
            const container = this._tiledItems[i];
            if (container instanceof WindowContainer) {
                const index = container.getIndexOfItemNested(item);
                if (index !== -1) {
                    return i;
                }
            } else if (container.getWindowId() === item.getWindowId()) {
                return i;
            }
        }
        return -1;
    }

    // TODO: update this to work with nested containers - all other logic should already be working
    itemDragged(item: WindowWrapper, x: number, y: number): void {
        let original_index = this.getIndexOfItemNested(item);

        if (original_index === -1) {
            Logger.error("Item not found in container during drag op", item.getWindowId());
            return;
        }
        let new_index = this.getIndexOfItemNested(item);
        this.getBounds().forEach((rect, index) => {
            if (rect.x < x && rect.x + rect.width > x && rect.y < y && rect.y + rect.height > y) {
                new_index = index;
            }
        })
        if (original_index !== new_index) {
            this._tiledItems.splice(original_index, 1);
            this._tiledItems.splice(new_index, 0, item);
            this.tileWindows()
        }

    }


}