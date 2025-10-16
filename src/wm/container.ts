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
    _customSizes: Map<number, number>;  // Maps index to custom width (horizontal) or height (vertical)

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
            const index = this._getIndexOfWindow(win_id)
            this._tiledItems.splice(index, 1);
            // Shift custom sizes after removed index
            this._shiftCustomSizesAfterRemoval(index);
        } else {
            for (const item of this._tiledItems) {
                if (item instanceof WindowContainer) {
                    item.removeWindow(win_id);
                }
            }
        }
        this.tileWindows()
    }

    _shiftCustomSizesAfterRemoval(removedIndex: number): void {
        Logger.log(`=== _shiftCustomSizesAfterRemoval called ===`);
        Logger.log(`Removed index: ${removedIndex}`);
        Logger.log(`Total items after removal: ${this._tiledItems.length}`);
        Logger.log(`Custom sizes Map size: ${this._customSizes.size}`);

        // Convert Map to readable string
        let customSizesStr = "{ ";
        this._customSizes.forEach((size, index) => {
            customSizesStr += `${index}: ${size}px, `;
        });
        customSizesStr += "}";
        Logger.log(`Custom sizes before shift: ${customSizesStr}`);

        // Calculate the removed window's size (could be custom or flexible)
        let removedSize = this._customSizes.get(removedIndex);

        if (removedSize === undefined) {
            // Window didn't have custom size, calculate its flexible size
            // Count items BEFORE removal (add 1 to current length)
            const numItemsBeforeRemoval = this._tiledItems.length + 1;
            let totalCustomSize = 0;
            let numFlexibleItemsBeforeRemoval = 0;

            this._customSizes.forEach((size, index) => {
                totalCustomSize += size;
                // Don't count this in flexible if it's the removed index
            });
            numFlexibleItemsBeforeRemoval = numItemsBeforeRemoval - this._customSizes.size;

            const containerSize = this._orientation === Orientation.HORIZONTAL ? this._workArea.width : this._workArea.height;
            const remainingSize = containerSize - totalCustomSize;
            removedSize = numFlexibleItemsBeforeRemoval > 0 ? Math.floor(remainingSize / numFlexibleItemsBeforeRemoval) : 0;

            Logger.log(`Removed window was flexible, calculated size: ${removedSize}px (${numFlexibleItemsBeforeRemoval} flexible windows before removal)`);
        } else {
            Logger.log(`Removed window had custom size: ${removedSize}px`);
        }

        // Rebuild the custom sizes map with shifted indices
        const newCustomSizes = new Map<number, number>();
        this._customSizes.forEach((size, index) => {
            if (index < removedIndex) {
                // Keep indices before removal
                Logger.log(`Keeping index ${index} with size ${size}`);
                newCustomSizes.set(index, size);
            } else if (index > removedIndex) {
                // Shift down indices after removal
                Logger.log(`Shifting index ${index} -> ${index - 1} with size ${size}`);
                newCustomSizes.set(index - 1, size);
            }
            // Skip the removed index
        });

        Logger.log(`New custom sizes Map size after shift: ${newCustomSizes.size}`);
        let afterShiftStr = "{ ";
        newCustomSizes.forEach((size, index) => {
            afterShiftStr += `${index}: ${size}px, `;
        });
        afterShiftStr += "}";
        Logger.log(`Custom sizes after index shift: ${afterShiftStr}`);

        // Distribute removed window's size among remaining custom-sized windows only
        // Flexible windows will naturally absorb their share through the bounds calculation
        const remainingWindowCount = this._tiledItems.length;
        const numCustomWindows = newCustomSizes.size;

        if (removedSize > 0 && remainingWindowCount > 0 && numCustomWindows > 0) {
            const sizePerCustomWindow = Math.floor(removedSize / numCustomWindows);

            Logger.log(`Distributing ${removedSize}px among ${numCustomWindows} custom-sized windows (${sizePerCustomWindow}px each)`);
            Logger.log(`Flexible windows will naturally absorb remaining space`);

            // Add proportional size only to windows that already have custom sizes
            newCustomSizes.forEach((size, index) => {
                const newSize = size + sizePerCustomWindow;
                Logger.log(`Index ${index}: ${size}px + ${sizePerCustomWindow}px = ${newSize}px`);
                newCustomSizes.set(index, newSize);
            });
        } else {
            Logger.log(`Not distributing space - removedSize: ${removedSize}, remainingWindows: ${remainingWindowCount}, customWindows: ${numCustomWindows}`);
        }

        let finalStr = "{ ";
        newCustomSizes.forEach((size, index) => {
            finalStr += `${index}: ${size}px, `;
        });
        finalStr += "}";
        Logger.log(`Final custom sizes: ${finalStr}`);

        this._customSizes = newCustomSizes;
        Logger.log(`=== _shiftCustomSizesAfterRemoval complete ===`);
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

    tileWindows(skipRetry: boolean = false) {
        Logger.log("TILING WINDOWS IN CONTAINER")
        Logger.log("WorkArea", this._workArea);
        this._tileItems(skipRetry)

        return true
    }

    _tileItems(skipRetry: boolean = false) {
        if (this._tiledItems.length === 0) {
            return;
        }
        const bounds = this.getBounds();
        this._tiledItems.forEach((item, index) => {
            const rect = bounds[index];
            if (item instanceof WindowContainer) {
                item.move(rect);
            } else {
                item.safelyResizeWindow(rect, 2, skipRetry);
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

        this._tiledItems.forEach((item, index) => {
            if (this._customSizes.has(index)) {
                totalCustomHeight += this._customSizes.get(index)!;
            } else {
                numFlexibleItems++;
            }
        });

        // Ensure custom sizes don't exceed container height
        if (totalCustomHeight > this._workArea.height) {
            Logger.warn("Custom heights exceed container, resetting all sizes");
            this._customSizes.clear();
            totalCustomHeight = 0;
            numFlexibleItems = this._tiledItems.length;
        }

        const remainingHeight = this._workArea.height - totalCustomHeight;
        const flexHeight = numFlexibleItems > 0 ? Math.floor(remainingHeight / numFlexibleItems) : 0;

        // Build the bounds array
        let currentY = this._workArea.y;
        return this._tiledItems.map((item, index) => {
            let height = flexHeight;
            if (this._customSizes.has(index)) {
                height = this._customSizes.get(index)!;
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

        this._tiledItems.forEach((item, index) => {
            if (this._customSizes.has(index)) {
                totalCustomWidth += this._customSizes.get(index)!;
            } else {
                numFlexibleItems++;
            }
        });

        // Ensure custom sizes don't exceed container width
        if (totalCustomWidth > this._workArea.width) {
            Logger.warn("Custom widths exceed container, resetting all sizes");
            this._customSizes.clear();
            totalCustomWidth = 0;
            numFlexibleItems = this._tiledItems.length;
        }

        const remainingWidth = this._workArea.width - totalCustomWidth;
        const flexWidth = numFlexibleItems > 0 ? Math.floor(remainingWidth / numFlexibleItems) : 0;

        // Build the bounds array
        let currentX = this._workArea.x;
        return this._tiledItems.map((item, index) => {
            let width = flexWidth;
            if (this._customSizes.has(index)) {
                width = this._customSizes.get(index)!;
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
        let new_index = original_index;
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

        // Find the index of the window
        const index = this._getIndexOfWindow(win_id);
        if (index === -1) {
            Logger.error("Window not found in container during resize");
            return;
        }

        const rect = window.getRect();
        if (this._orientation === Orientation.HORIZONTAL) {
            this._customSizes.set(index, rect.width);
            Logger.log(`Window at index ${index} manually resized to width: ${rect.width}`);
        } else {
            this._customSizes.set(index, rect.height);
            Logger.log(`Window at index ${index} manually resized to height: ${rect.height}`);
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

    windowResizing(win_id: number, resizeOp: Meta.GrabOp): void {
        const window = this.getWindow(win_id);
        if (!window) {
            // Check nested containers
            for (const item of this._tiledItems) {
                if (item instanceof WindowContainer) {
                    item.windowResizing(win_id, resizeOp);
                }
            }
            return;
        }

        // Check if the resize direction matches the container orientation
        const isHorizontalResize = resizeOp === Meta.GrabOp.RESIZING_E || resizeOp === Meta.GrabOp.RESIZING_W;
        const isVerticalResize = resizeOp === Meta.GrabOp.RESIZING_N || resizeOp === Meta.GrabOp.RESIZING_S;

        if ((this._orientation === Orientation.HORIZONTAL && !isHorizontalResize) ||
            (this._orientation === Orientation.VERTICAL && !isVerticalResize)) {
            // Resize direction doesn't match container orientation, ignore
            return;
        }

        // Find the index of the window
        const index = this._getIndexOfWindow(win_id);
        if (index === -1) {
            return;
        }

        // Get the new size
        const rect = window.getRect();
        const newSize = this._orientation === Orientation.HORIZONTAL ? rect.width : rect.height;
        const oldSize = this._customSizes.get(index);

        if (oldSize === undefined) {
            // First time resizing this window, just set the size
            this._customSizes.set(index, newSize);
            this.tileWindows(true);
            return;
        }

        // Calculate the delta (how much the window changed)
        const delta = newSize - oldSize;

        // If delta is 0, the window didn't actually resize (hit its minimum)
        if (delta === 0) {
            return;
        }

        // Determine which adjacent window to adjust based on resize direction
        let adjacentIndex = -1;
        if (resizeOp === Meta.GrabOp.RESIZING_E || resizeOp === Meta.GrabOp.RESIZING_S) {
            // Resizing right/down edge - adjust the next window
            adjacentIndex = index + 1;
        } else if (resizeOp === Meta.GrabOp.RESIZING_W || resizeOp === Meta.GrabOp.RESIZING_N) {
            // Resizing left/up edge - adjust the previous window
            adjacentIndex = index - 1;
        }

        // Update current window size
        this._customSizes.set(index, newSize);

        // Adjust adjacent window only if it has a custom size
        // When both windows have custom sizes, always apply opposite delta to maintain total width
        let oldAdjacentSize: number | undefined = undefined;
        if (adjacentIndex >= 0 && adjacentIndex < this._tiledItems.length &&
            this._customSizes.has(adjacentIndex)) {
            const adjacentItem = this._tiledItems[adjacentIndex];
            if (adjacentItem instanceof WindowWrapper) {
                oldAdjacentSize = this._customSizes.get(adjacentIndex)!;
                const newAdjacentSize = oldAdjacentSize - delta;

                // Check if adjacent window allows resize
                if (!adjacentItem.getWindow().allows_resize()) {
                    Logger.log("Adjacent window doesn't allow resize, reverting");
                    this._customSizes.set(index, oldSize);
                } else {
                    // Always apply the opposite delta to the adjacent window
                    // This keeps the total width constant
                    this._customSizes.set(adjacentIndex, newAdjacentSize);
                }
            }
        }

        // Call tileWindows during resize to update all window positions
        // Skip retry logic during active resize to avoid jitter
        this.tileWindows(true);
    }


}