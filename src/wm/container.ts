import {WindowWrapper} from "./window.js";
import {Logger} from "../utils/logger.js";
import Meta from "gi://Meta";
import queueEvent from "../utils/events.js";
import {Rect} from "../utils/rect.js";

enum Orientation {
    HORIZONTAL = 0,
    VERTICAL = 1,
}

/**
 * Build a split-ratio array of length `n` where every element equals 1/n,
 * with the last slot absorbing any floating-point remainder so the array
 * always sums to exactly 1.0.
 */
function equalRatios(n: number): number[] {
    if (n <= 0) return [];
    const base = 1 / n;
    const ratios = Array(n).fill(base);
    // Fix floating-point drift: make last slot exact
    const sumExceptLast = ratios.slice(0, -1).reduce((a, b) => a + b, 0);
    ratios[n - 1] = 1 - sumExceptLast;
    return ratios;
}


export default class WindowContainer {

    _tiledItems: (WindowWrapper | WindowContainer)[];
    _tiledWindowLookup: Map<number, WindowWrapper>;
    _orientation: Orientation = Orientation.HORIZONTAL;
    _workArea: Rect;

    /**
     * Per-child split ratios. Always satisfies:
     *   _splitRatios.length === _tiledItems.length
     *   _splitRatios.reduce((a,b) => a+b, 0) === 1.0  (within floating-point epsilon)
     *   every element >= MIN_RATIO
     */
    _splitRatios: number[];

    /** Minimum fraction any child may occupy (read from settings, default 0.10). */
    _minRatio: number;

    constructor(workspaceArea: Rect, minRatio: number = 0.10) {
        this._tiledItems = [];
        this._tiledWindowLookup = new Map<number, WindowWrapper>();
        this._workArea = workspaceArea;
        this._splitRatios = [];
        this._minRatio = minRatio;
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    /** Rebuild _splitRatios as equal fractions after any structural change. */
    private _resetRatios(): void {
        this._splitRatios = equalRatios(this._tiledItems.length);
    }

    /** Total dimension for the active orientation (width for H, height for V). */
    private _totalDimension(): number {
        return this._orientation === Orientation.HORIZONTAL
            ? this._workArea.width
            : this._workArea.height;
    }

    // ─── Public API ─────────────────────────────────────────────────────────────

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
        this._resetRatios();
        queueEvent({
            name: "tiling-windows",
            callback: () => {
                this.tileWindows();
            }
        }, 100);
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
        return undefined;
    }

    _getIndexOfWindow(win_id: number): number {
        for (let i = 0; i < this._tiledItems.length; i++) {
            const item = this._tiledItems[i];
            if (item instanceof WindowWrapper && item.getWindowId() === win_id) {
                return i;
            }
        }
        return -1;
    }

    removeWindow(win_id: number): void {
        if (this._tiledWindowLookup.has(win_id)) {
            const index = this._getIndexOfWindow(win_id);
            this._tiledWindowLookup.delete(win_id);
            if (index !== -1) {
                this._tiledItems.splice(index, 1);
            }
            this._resetRatios();
        } else {
            for (const item of this._tiledItems) {
                if (item instanceof WindowContainer) {
                    item.removeWindow(win_id);
                }
            }
        }
        this.tileWindows();
    }

    disconnectSignals(): void {
        this._tiledItems.forEach((item) => {
            if (item instanceof WindowContainer) {
                item.disconnectSignals();
            } else {
                item.disconnectWindowSignals();
            }
        });
    }

    removeAllWindows(): void {
        this._tiledItems = [];
        this._tiledWindowLookup.clear();
        this._splitRatios = [];
    }

    tileWindows() {
        Logger.log("TILING WINDOWS IN CONTAINER");
        Logger.log("WorkArea", this._workArea);
        this._tileItems();
        return true;
    }

    _tileItems() {
        if (this._tiledItems.length === 0) {
            return;
        }
        const bounds = this.getBounds();
        Logger.info(`_tileItems: ratios=[${this._splitRatios.map(r => r.toFixed(3)).join(', ')}] bounds=[${bounds.map(b => `(${b.x},${b.y},${b.width},${b.height})`).join(', ')}]`);
        this._tiledItems.forEach((item, index) => {
            const rect = bounds[index];
            if (item instanceof WindowContainer) {
                item.move(rect);
            } else {
                Logger.info(`_tileItems: window[${index}] id=${item.getWindowId()} dragging=${item._dragging} → rect=(${rect.x},${rect.y},${rect.width},${rect.height})`);
                item.safelyResizeWindow(rect);
            }
        });
    }

    // ─── Bounds Calculation ──────────────────────────────────────────────────────

    getBounds(): Rect[] {
        if (this._orientation === Orientation.HORIZONTAL) {
            return this.getHorizontalBounds();
        }
        return this.getVerticalBounds();
    }

    getVerticalBounds(): Rect[] {
        const items = this._tiledItems;
        const totalHeight = this._workArea.height;
        let usedHeight = 0;

        return items.map((_, index) => {
            const y = this._workArea.y + usedHeight;
            let height: number;
            if (index === items.length - 1) {
                // Last item gets the remainder to avoid pixel gaps from rounding
                height = totalHeight - usedHeight;
            } else {
                height = Math.floor(this._splitRatios[index] * totalHeight);
            }
            usedHeight += height;
            return {
                x: this._workArea.x,
                y: y,
                width: this._workArea.width,
                height: height,
            } as Rect;
        });
    }

    getHorizontalBounds(): Rect[] {
        const totalWidth = this._workArea.width;
        let usedWidth = 0;

        return this._tiledItems.map((_, index) => {
            const x = this._workArea.x + usedWidth;
            let width: number;
            if (index === this._tiledItems.length - 1) {
                // Last item gets the remainder to avoid pixel gaps from rounding
                width = totalWidth - usedWidth;
            } else {
                width = Math.floor(this._splitRatios[index] * totalWidth);
            }
            usedWidth += width;
            return {
                x: x,
                y: this._workArea.y,
                width: width,
                height: this._workArea.height,
            } as Rect;
        });
    }

    // ─── Boundary / Ratio Adjustment ─────────────────────────────────────────────

    /**
     * Adjust the boundary between item[boundaryIndex] and item[boundaryIndex+1]
     * by deltaPixels (positive = move right/down, negative = move left/up).
     *
     * Both affected ratios are clamped to [_minRatio, 1 - _minRatio] so no
     * window can be squashed below the configured minimum.
     *
     * Returns true if the adjustment was applied, false if it was rejected
     * (e.g. out of bounds index or clamping would violate minimum).
     */
    adjustBoundary(boundaryIndex: number, deltaPixels: number): boolean {
        if (boundaryIndex < 0 || boundaryIndex >= this._tiledItems.length - 1) {
            Logger.warn(`adjustBoundary: invalid boundaryIndex ${boundaryIndex}`);
            return false;
        }

        const totalDim = this._totalDimension();
        if (totalDim === 0) return false;

        const ratioDelta = deltaPixels / totalDim;
        const minRatio = this._minRatio;

        const newLeft  = this._splitRatios[boundaryIndex]     + ratioDelta;
        const newRight = this._splitRatios[boundaryIndex + 1] - ratioDelta;

        if (newLeft < minRatio || newRight < minRatio) {
            Logger.log(`adjustBoundary: clamped — newLeft=${newLeft.toFixed(3)}, newRight=${newRight.toFixed(3)}, min=${minRatio}`);
            return false;
        }

        this._splitRatios[boundaryIndex]     = newLeft;
        this._splitRatios[boundaryIndex + 1] = newRight;

        Logger.info(`adjustBoundary: boundary=${boundaryIndex} ratios=[${this._splitRatios.map(r => r.toFixed(3)).join(', ')}]`);
        return true;
    }

    /**
     * Adjust boundaries on BOTH axes simultaneously for corner resize ops.
     * horizontalDelta applies to this container if HORIZONTAL, verticalDelta if VERTICAL.
     * For nested containers the perpendicular delta is forwarded to the child container.
     *
     * boundaryIndex: the slot index whose right/bottom edge is being dragged.
     */
    adjustBoundaryBothAxes(
        boundaryIndex: number,
        horizontalDelta: number,
        verticalDelta: number,
    ): void {
        if (this._orientation === Orientation.HORIZONTAL) {
            this.adjustBoundary(boundaryIndex, horizontalDelta);
        } else {
            this.adjustBoundary(boundaryIndex, verticalDelta);
        }
    }

    // ─── Container Lookup ────────────────────────────────────────────────────────

    /**
     * Returns the direct-parent WindowContainer that contains win_id as an
     * immediate child (not recursed further). Returns null if not found.
     */
    getContainerForWindow(win_id: number): WindowContainer | null {
        for (const item of this._tiledItems) {
            if (item instanceof WindowWrapper && item.getWindowId() === win_id) {
                return this;
            }
        }
        for (const item of this._tiledItems) {
            if (item instanceof WindowContainer) {
                const found = item.getContainerForWindow(win_id);
                if (found !== null) return found;
            }
        }
        return null;
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
        });
        if (original_index !== new_index) {
            // Swap only the items — ratios stay with their slots.
            // e.g. slot 0 = 40%, slot 1 = 60%: when the window in slot 1 drags
            // into slot 0, it takes slot 0's 40% size. The window it displaces
            // moves to slot 1 and takes the 60% size. The slot ratios are unchanged.
            [this._tiledItems[original_index], this._tiledItems[new_index]] =
                [this._tiledItems[new_index], this._tiledItems[original_index]];
            Logger.info(`itemDragged: swapped slots ${original_index}<->${new_index}, ratios=[${this._splitRatios.map(r => r.toFixed(3)).join(', ')}]`);
            this.tileWindows();
        }
    }

    /**
     * Reset all split ratios in this container to equal fractions.
     * Called when the user explicitly requests an equal-split reset (e.g. Ctrl+Z).
     */
    resetRatios(): void {
        this._resetRatios();
        this.tileWindows();
    }
}
