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
    _customSizes: Map<number, number>;

    constructor(workspaceArea: Rect,) {
        this._tiledItems = [];
        this._tiledWindowLookup = new Map<number, WindowWrapper>();
        this._workArea = workspaceArea;
        this._customSizes = new Map<number, number>();
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
            this._customSizes.delete(win_id);  // Clean up custom size when window is removed
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
        // Calculate available height after accounting for custom-sized windows
        let totalCustomHeight = 0;
        let numFlexibleItems = 0;

        this._tiledItems.forEach((item) => {
            if (item instanceof WindowWrapper && this._customSizes.has(item.getWindowId())) {
                totalCustomHeight += this._customSizes.get(item.getWindowId())!;
            } else {
                numFlexibleItems++;
            }
        });

        const remainingHeight = this._workArea.height - totalCustomHeight;
        const flexHeight = numFlexibleItems > 0 ? Math.floor(remainingHeight / numFlexibleItems) : 0;

        // Build the bounds array
        let currentY = this._workArea.y;
        return this._tiledItems.map((item) => {
            let height = flexHeight;
            if (item instanceof WindowWrapper && this._customSizes.has(item.getWindowId())) {
                height = this._customSizes.get(item.getWindowId())!;
            }

            const rect = {
                x: this._workArea.x,
                y: currentY,
                width: this._workArea.width,
                height: height
            } as Rect;
            currentY += height;
            return rect;
        });
    }

    getHorizontalBounds(): Rect[] {
        // Calculate available width after accounting for custom-sized windows
        let totalCustomWidth = 0;
        let numFlexibleItems = 0;

        this._tiledItems.forEach((item) => {
            if (item instanceof WindowWrapper && this._customSizes.has(item.getWindowId())) {
                totalCustomWidth += this._customSizes.get(item.getWindowId())!;
            } else {
                numFlexibleItems++;
            }
        });

        const remainingWidth = this._workArea.width - totalCustomWidth;
        const flexWidth = numFlexibleItems > 0 ? Math.floor(remainingWidth / numFlexibleItems) : 0;

        // Build the bounds array
        let currentX = this._workArea.x;
        return this._tiledItems.map((item) => {
            let width = flexWidth;
            if (item instanceof WindowWrapper && this._customSizes.has(item.getWindowId())) {
                width = this._customSizes.get(item.getWindowId())!;
            }

            const rect = {
                x: currentX,
                y: this._workArea.y,
                width: width,
                height: this._workArea.height
            } as Rect;
            currentX += width;
            return rect;
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

    windowManuallyResized(win_id: number): void {
        const window = this.getWindow(win_id);
        if (!window) {
            // Check nested containers
            for (const item of this._tiledItems) {
                if (item instanceof WindowContainer) {
                    item.windowManuallyResized(win_id);
                }
            }
            return;
        }

        const rect = window.getRect();
        if (this._orientation === Orientation.HORIZONTAL) {
            this._customSizes.set(win_id, rect.width);
            Logger.log(`Window ${win_id} manually resized to width: ${rect.width}`);
        } else {
            this._customSizes.set(win_id, rect.height);
            Logger.log(`Window ${win_id} manually resized to height: ${rect.height}`);
        }
    }

    resetAllWindowSizes(): void {
        Logger.log("Clearing all custom window sizes in container");
        this._customSizes.clear();
        // Also clear nested containers
        for (const item of this._tiledItems) {
            if (item instanceof WindowContainer) {
                item.resetAllWindowSizes();
            }
        }
    }


}