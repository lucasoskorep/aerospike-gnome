import {WindowWrapper} from "./window.js";
import {Logger} from "../utils/logger.js";
import queueEvent from "../utils/events.js";
import {Rect} from "../utils/rect.js";

enum Orientation {
    HORIZONTAL = 0,
    VERTICAL = 1,
}

// Returns equal ratios summing exactly to 1.0, with float drift absorbed by the last slot.
function equalRatios(n: number): number[] {
    if (n <= 0) return [];
    const base = 1 / n;
    const ratios = Array(n).fill(base);
    const sumExceptLast = ratios.slice(0, -1).reduce((a, b) => a + b, 0);
    ratios[n - 1] = 1 - sumExceptLast;
    return ratios;
}

export default class WindowContainer {

    _tiledItems: (WindowWrapper | WindowContainer)[];
    _tiledWindowLookup: Map<number, WindowWrapper>;
    _orientation: Orientation = Orientation.HORIZONTAL;
    _workArea: Rect;
    _splitRatios: number[];

    constructor(workspaceArea: Rect) {
        this._tiledItems = [];
        this._tiledWindowLookup = new Map<number, WindowWrapper>();
        this._workArea = workspaceArea;
        this._splitRatios = [];
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    private _resetRatios(): void {
        this._splitRatios = equalRatios(this._tiledItems.length);
    }

    private _addRatioForNewWindow(): void {
        const n = this._tiledItems.length;
        if (n <= 1) {
            this._splitRatios = [1.0];
            return;
        }
        const newRatio = 1 / n;
        const scale    = 1 - newRatio;
        const scaled   = this._splitRatios.map(r => r * scale);
        const partialSum = scaled.reduce((a, b) => a + b, 0) + newRatio;
        scaled[scaled.length - 1] += (1.0 - partialSum);
        this._splitRatios = [...scaled, newRatio];
    }

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
        this._addRatioForNewWindow();
        queueEvent({
            name: "tiling-windows",
            callback: () => this.tileWindows(),
        }, 100);
    }

    getWindow(win_id: number): WindowWrapper | undefined {
        if (this._tiledWindowLookup.has(win_id)) {
            return this._tiledWindowLookup.get(win_id);
        }
        for (const item of this._tiledItems) {
            if (item instanceof WindowContainer) {
                const win = item.getWindow(win_id);
                if (win) return win;
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
            // Get index before deleting from lookup to avoid race condition
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

    tileWindows(): void {
        Logger.log("TILING WINDOWS IN CONTAINER");
        Logger.log("WorkArea", this._workArea);
        this._tileItems();
    }

    _tileItems() {
        if (this._tiledItems.length === 0) return;

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
        return this._orientation === Orientation.HORIZONTAL
            ? this._computeBounds('horizontal')
            : this._computeBounds('vertical');
    }

    private _computeBounds(axis: 'horizontal' | 'vertical'): Rect[] {
        const isHorizontal = axis === 'horizontal';
        const total = isHorizontal ? this._workArea.width : this._workArea.height;
        let used = 0;

        return this._tiledItems.map((_, index) => {
            const offset = used;
            const size = index === this._tiledItems.length - 1
                ? total - used
                : Math.floor(this._splitRatios[index] * total);
            used += size;

            return isHorizontal
                ? { x: this._workArea.x + offset, y: this._workArea.y, width: size, height: this._workArea.height }
                : { x: this._workArea.x, y: this._workArea.y + offset, width: this._workArea.width, height: size };
        });
    }

    // ─── Boundary Adjustment ─────────────────────────────────────────────────────

    adjustBoundary(boundaryIndex: number, deltaPixels: number): boolean {
        if (boundaryIndex < 0 || boundaryIndex >= this._tiledItems.length - 1) {
            Logger.warn(`adjustBoundary: invalid boundaryIndex ${boundaryIndex}`);
            return false;
        }

        const totalDim = this._totalDimension();
        if (totalDim === 0) return false;

        const ratioDelta = deltaPixels / totalDim;
        const newLeft    = this._splitRatios[boundaryIndex]     + ratioDelta;
        const newRight   = this._splitRatios[boundaryIndex + 1] - ratioDelta;

        if (newLeft <= 0 || newRight <= 0) {
            Logger.log(`adjustBoundary: clamped — newLeft=${newLeft.toFixed(3)}, newRight=${newRight.toFixed(3)}`);
            return false;
        }

        this._splitRatios[boundaryIndex]     = newLeft;
        this._splitRatios[boundaryIndex + 1] = newRight;

        Logger.info(`adjustBoundary: boundary=${boundaryIndex} ratios=[${this._splitRatios.map(r => r.toFixed(3)).join(', ')}]`);
        return true;
    }

    // ─── Container Lookup ────────────────────────────────────────────────────────

    getContainerForWindow(win_id: number): WindowContainer | null {
        for (const item of this._tiledItems) {
            if (item instanceof WindowWrapper && item.getWindowId() === win_id) {
                return this;
            }
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
                if (container.getIndexOfItemNested(item) !== -1) return i;
            } else if (container.getWindowId() === item.getWindowId()) {
                return i;
            }
        }
        return -1;
    }

    // TODO: update this to work with nested containers - all other logic should already be working
    itemDragged(item: WindowWrapper, x: number, y: number): void {
        const original_index = this.getIndexOfItemNested(item);

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
            Logger.info(`itemDragged: swapped slots ${original_index}<->${new_index}, ratios=[${this._splitRatios.map(r => r.toFixed(3)).join(', ')}]`);
            [this._tiledItems[original_index], this._tiledItems[new_index]] =
                [this._tiledItems[new_index], this._tiledItems[original_index]];
            this.tileWindows();
        }
    }

    resetRatios(): void {
        this._resetRatios();
        this.tileWindows();
    }
}
