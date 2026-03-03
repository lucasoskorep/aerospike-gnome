import {WindowWrapper} from "./window.js";
import {Logger} from "../utils/logger.js";
import queueEvent from "../utils/events.js";
import {Rect} from "../utils/rect.js";
import {TabBar, TAB_BAR_HEIGHT} from "./tabBar.js";

export enum Layout {
    ACC_HORIZONTAL = 0,
    ACC_VERTICAL = 1,
    TABBED = 2,
}

export enum Direction {
    LEFT  = 'left',
    RIGHT = 'right',
    UP    = 'up',
    DOWN  = 'down',
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
    _orientation: Layout = Layout.ACC_HORIZONTAL;
    _workArea: Rect;

    // -- Accordion Mode States

    _splitRatios: number[];

    // -- Tabbed mode state -----------------------------------------------------
    _activeTabIndex: number = 0;
    _tabBar: TabBar | null = null;

    constructor(workspaceArea: Rect) {
        this._tiledItems = [];
        this._tiledWindowLookup = new Map<number, WindowWrapper>();
        this._workArea = workspaceArea;
        this._splitRatios = [];
    }

    // --- Helpers ----------------------------------------------------------------

    private _resetRatios(): void {
        this._splitRatios = equalRatios(this._tiledItems.length);
    }

    /**
     * Proportionally shrink existing ratios to carve out space for a new item
     * at the given index. If no index is supplied the ratio is appended at the end.
     */
    private _addRatioForNewWindow(index?: number): void {
        const n = this._tiledItems.length;
        if (n <= 1) {
            this._splitRatios = [1.0];
            return;
        }
        const newRatio = 1 / n;
        const scale = 1 - newRatio;
        const scaled = this._splitRatios.map(r => r * scale);
        const partialSum = scaled.reduce((a, b) => a + b, 0) + newRatio;
        scaled[scaled.length - 1] += (1.0 - partialSum);

        const insertAt = index ?? scaled.length;
        scaled.splice(insertAt, 0, newRatio);
        this._splitRatios = scaled;
    }

    private _totalDimension(): number {
        return this._orientation === Layout.ACC_HORIZONTAL
            ? this._workArea.width
            : this._workArea.height;
    }

    isTabbed(): boolean {
        return this._orientation === Layout.TABBED;
    }

    // --- Public API -------------------------------------------------------------

    move(rect: Rect): void {
        this._workArea = rect;
        this.drawWindows();
    }

    toggleOrientation(): void {
        if (this._orientation === Layout.TABBED) {
            // Tabbed → Horizontal: restore accordion mode
            this.setAccordion(Layout.ACC_HORIZONTAL);
        } else {
            this._orientation = this._orientation === Layout.ACC_HORIZONTAL
                ? Layout.ACC_VERTICAL
                : Layout.ACC_HORIZONTAL;
            Logger.info(`Container orientation toggled to ${Layout[this._orientation]}`);
            this.drawWindows();
        }
    }

    /**
     * Switch this container to tabbed mode.
     */
    setTabbed(): void {
        if (this._orientation === Layout.TABBED) return;

        Logger.info("Container switching to TABBED mode");
        this._orientation = Layout.TABBED;

        // Clamp active tab index
        if (this._activeTabIndex < 0 || this._activeTabIndex >= this._tiledItems.length) {
            this._activeTabIndex = 0;
        }

        // Create tab bar
        this._tabBar = new TabBar((index) => {
            this.setActiveTab(index);
        });

        this.drawWindows();
    }

    /**
     * Switch this container back to accordion (H or V) mode.
     */
    setAccordion(orientation: Layout.ACC_HORIZONTAL | Layout.ACC_VERTICAL): void {
        if (this._orientation !== Layout.TABBED) {
            // Already accordion — just set the orientation
            this._orientation = orientation;
            this.drawWindows();
            return;
        }

        Logger.info(`Container switching from TABBED to ${Layout[orientation]}`);
        this._orientation = orientation;

        // Destroy tab bar
        if (this._tabBar) {
            this._tabBar.destroy();
            this._tabBar = null;
        }

        // Show all windows (they may have been hidden in tabbed mode)
        this._showAllWindows();

        this.drawWindows();
    }

    /**
     * Set the active tab by index. Shows that window, hides others, updates tab bar.
     */
    setActiveTab(index: number): void {
        if (!this.isTabbed()) return;
        if (index < 0 || index >= this._tiledItems.length) return;

        this._activeTabIndex = index;
        Logger.info(`Active tab set to ${index}`);

        this._applyTabVisibility();
        this._updateTabBar();

        // Tile to resize the active window to the content area
        this.drawWindows();
    }

    getActiveTabIndex(): number {
        return this._activeTabIndex;
    }

    /**
     * If the given window is a tab in this container, make it the active tab.
     * Returns true if the window was found and activated.
     */
    focusWindowTab(windowId: number): boolean {
        if (!this.isTabbed()) return false;

        const index = this._getIndexOfWindow(windowId);
        if (index !== -1 && index !== this._activeTabIndex) {
            this.setActiveTab(index);
            return true;
        }
        return index !== -1;
    }

    hideTabBar(): void {
        this._tabBar?.hide();
    }

    showTabBar(): void {
        if (this.isTabbed() && this._tabBar) {
            this._tabBar.show();
        }
    }

    /**
     * Add a window to this container.
     * If `index` is omitted the window is appended at the end.
     * A negative index (e.g. -1) is treated as "append at end".
     */
    addWindow(winWrap: WindowWrapper, index?: number): void {
        const insertAt = (index === undefined || index < 0)
            ? this._tiledItems.length
            : Math.min(index, this._tiledItems.length);

        this._tiledItems.splice(insertAt, 0, winWrap);
        this._tiledWindowLookup.set(winWrap.getWindowId(), winWrap);
        this._addRatioForNewWindow(insertAt);

        if (this.isTabbed()) {
            // TODO: make it so that when tabs are added they are made the current active tab
            this._applyTabVisibility();
            this._updateTabBar();
        }

        queueEvent({
            name: "tiling-windows",
            callback: () => this.drawWindows(),
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
            const index = this._getIndexOfWindow(win_id);
            this._tiledWindowLookup.delete(win_id);
            if (index !== -1) {
                // If removing the window that was hidden in tabbed mode,
                // make sure to show it first so it doesn't stay invisible
                const item = this._tiledItems[index];
                if (item instanceof WindowWrapper) {
                    item.showWindow();
                }
                this._tiledItems.splice(index, 1);
            }
            this._resetRatios();

            if (this.isTabbed()) {
                if (this._tiledItems.length === 0) {
                    this._activeTabIndex = 0;
                } else if (this._activeTabIndex >= this._tiledItems.length) {
                    this._activeTabIndex = this._tiledItems.length - 1;
                }
                this._applyTabVisibility();
                this._updateTabBar();
            }
        } else {
            for (const item of this._tiledItems) {
                if (item instanceof WindowContainer) {
                    item.removeWindow(win_id);
                }
            }
        }
        this.drawWindows();
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
        // tabbed mode hides all windows - this ensures they are available before removal
        this._showAllWindows();

        if (this._tabBar) {
            this._tabBar.destroy();
            this._tabBar = null;
        }

        this._tiledItems = [];
        this._tiledWindowLookup.clear();
        this._splitRatios = [];
        this._activeTabIndex = 0;
    }

    drawWindows(): void {
        Logger.log("TILING WINDOWS IN CONTAINER");
        Logger.log("WorkArea", this._workArea);

        if (this.isTabbed()) {
            this._tileTab();
        } else {
            this._tileAccordion();
        }
    }

    _tileAccordion() {
        if (this._tiledItems.length === 0) return;

        const bounds = this.getBounds();
        Logger.info(`_tileAccordion: ratios=[${this._splitRatios.map(r => r.toFixed(3)).join(', ')}] bounds=[${bounds.map(b => `(${b.x},${b.y},${b.width},${b.height})`).join(', ')}]`);
        this._tiledItems.forEach((item, index) => {
            const rect = bounds[index];
            if (item instanceof WindowContainer) {
                item.move(rect);
            } else {
                Logger.info(`_tileAccordion: window[${index}] id=${item.getWindowId()} dragging=${item._dragging} → rect=(${rect.x},${rect.y},${rect.width},${rect.height})`);
                item.safelyResizeWindow(rect);
            }
        });
    }

    private _tileTab(): void {
        if (this._tiledItems.length === 0) return;

        const tabBarRect: Rect = {
            x: this._workArea.x,
            y: this._workArea.y,
            width: this._workArea.width,
            height: TAB_BAR_HEIGHT,
        };

        const contentRect: Rect = {
            x: this._workArea.x,
            y: this._workArea.y + TAB_BAR_HEIGHT,
            width: this._workArea.width,
            height: this._workArea.height - TAB_BAR_HEIGHT,
        };

        // Position and show the tab bar
        if (this._tabBar) {
            this._tabBar.setPosition(tabBarRect);
            if (!this._tabBar.isVisible()) {
                this._rebuildAndShowTabBar();
            }
        }

        this._applyTabVisibility();

        const activeItem = this._tiledItems[this._activeTabIndex];
        if (activeItem) {
            if (activeItem instanceof WindowContainer) {
                activeItem.move(contentRect);
            } else {
                Logger.info(`_tileTabbed: active tab[${this._activeTabIndex}] id=${activeItem.getWindowId()} → rect=(${contentRect.x},${contentRect.y},${contentRect.width},${contentRect.height})`);
                activeItem.safelyResizeWindow(contentRect);
            }
        }
    }

    /**
     * Show the active tab window, hide all others.
     */
    private _applyTabVisibility(): void {
        this._tiledItems.forEach((item, index) => {
            if (item instanceof WindowWrapper) {
                if (index === this._activeTabIndex) {
                    item.showWindow();
                } else {
                    item.hideWindow();
                }
            }
        });
    }

    /**
     * Show all windows (used when leaving tabbed mode).
     */
    private _showAllWindows(): void {
        this._tiledItems.forEach((item) => {
            if (item instanceof WindowWrapper) {
                item.showWindow();
            }
        });
    }

    /**
     * Rebuild the tab bar buttons and show it.
     */
    private _rebuildAndShowTabBar(): void {
        if (!this._tabBar) return;

        const windowItems = this._tiledItems.filter(
            (item): item is WindowWrapper => item instanceof WindowWrapper
        );

        this._tabBar.rebuild(windowItems, this._activeTabIndex);
        this._tabBar.show();
    }

    /**
     * Public entry point to refresh tab titles (e.g. when a window title changes).
     */
    refreshTabTitles(): void {
        this._updateTabBar();
    }

    /**
     * Update tab bar state (active highlight, titles) without a full rebuild.
     */
    private _updateTabBar(): void {
        if (!this._tabBar) return;

        // Rebuild is cheap — just recreate buttons from the current items
        const windowItems = this._tiledItems.filter(
            (item): item is WindowWrapper => item instanceof WindowWrapper
        );

        this._tabBar.rebuild(windowItems, this._activeTabIndex);
    }

    getBounds(): Rect[] {
        if (this._orientation === Layout.TABBED) {
            // In tabbed mode, all items share the same content rect
            const contentRect: Rect = {
                x: this._workArea.x,
                y: this._workArea.y + TAB_BAR_HEIGHT,
                width: this._workArea.width,
                height: this._workArea.height - TAB_BAR_HEIGHT,
            };
            return this._tiledItems.map(() => contentRect);
        }

        return this._orientation === Layout.ACC_HORIZONTAL
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
                ? {x: this._workArea.x + offset, y: this._workArea.y, width: size, height: this._workArea.height}
                : {x: this._workArea.x, y: this._workArea.y + offset, width: this._workArea.width, height: size};
        });
    }

    adjustBoundary(boundaryIndex: number, deltaPixels: number): boolean {
        // No boundary adjustment in tabbed mode
        if (this.isTabbed()) return false;

        if (boundaryIndex < 0 || boundaryIndex >= this._tiledItems.length - 1) {
            Logger.warn(`adjustBoundary: invalid boundaryIndex ${boundaryIndex}`);
            return false;
        }

        const totalDim = this._totalDimension();
        if (totalDim === 0) return false;

        const ratioDelta = deltaPixels / totalDim;
        const newLeft = this._splitRatios[boundaryIndex] + ratioDelta;
        const newRight = this._splitRatios[boundaryIndex + 1] - ratioDelta;

        if (newLeft <= 0 || newRight <= 0) {
            Logger.log(`adjustBoundary: clamped — newLeft=${newLeft.toFixed(3)}, newRight=${newRight.toFixed(3)}`);
            return false;
        }

        this._splitRatios[boundaryIndex] = newLeft;
        this._splitRatios[boundaryIndex + 1] = newRight;

        Logger.info(`adjustBoundary: boundary=${boundaryIndex} ratios=[${this._splitRatios.map(r => r.toFixed(3)).join(', ')}]`);
        return true;
    }

    // --- Container Lookup --------------------------------------------------------

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
        // In tabbed mode, dragging reorders tabs but doesn't change layout
        if (this.isTabbed()) {
            // Don't reorder during tabbed mode — tabs have a fixed visual layout
            return;
        }

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
            this.drawWindows();
        }
    }

    resetRatios(): void {
        this._resetRatios();
        this.drawWindows();
    }

    // --- Directional Move (swap) ------------------------------------------------

    /**
     * Swap the window at `windowId` with its neighbour in the given direction.
     * Returns true if the swap occurred, false if the window is already at the edge
     * or the direction is perpendicular to the container axis.
     */
    swapWindowInDirection(windowId: number, direction: Direction): boolean {
        const currentIndex = this._getIndexOfWindow(windowId);
        if (currentIndex === -1) return false;

        if (this.isTabbed()) {
            // Tabbed: left/up = swap toward start, right/down = swap toward end
            const delta = (direction === Direction.LEFT || direction === Direction.UP) ? -1 : 1;
            const newIndex = currentIndex + delta;
            if (newIndex < 0 || newIndex >= this._tiledItems.length) return false;

            this._swapItems(currentIndex, newIndex);
            this._activeTabIndex = newIndex;
            this._updateTabBar();
            this.drawWindows();
            return true;
        }

        // Accordion mode — only swap along the container's axis
        const isAlongAxis =
            (this._orientation === Layout.ACC_HORIZONTAL && (direction === Direction.LEFT || direction === Direction.RIGHT)) ||
            (this._orientation === Layout.ACC_VERTICAL   && (direction === Direction.UP   || direction === Direction.DOWN));

        if (!isAlongAxis) return false;

        const delta = (direction === Direction.LEFT || direction === Direction.UP) ? -1 : 1;
        const newIndex = currentIndex + delta;
        if (newIndex < 0 || newIndex >= this._tiledItems.length) return false;

        this._swapItems(currentIndex, newIndex);
        this.drawWindows();
        return true;
    }

    /**
     * Swap two items in `_tiledItems` and their corresponding split ratios.
     */
    private _swapItems(indexA: number, indexB: number): void {
        [this._tiledItems[indexA], this._tiledItems[indexB]] =
            [this._tiledItems[indexB], this._tiledItems[indexA]];
        [this._splitRatios[indexA], this._splitRatios[indexB]] =
            [this._splitRatios[indexB], this._splitRatios[indexA]];
    }

    // --- Directional Navigation ------------------------------------------------

    /**
     * Given a window inside this container and a direction, return the window ID
     * that should receive focus, or null if the edge of the container is reached.
     *
     * Behaviour by layout mode:
     *  - ACC_HORIZONTAL: left/right moves to the prev/next item; up/down → null
     *  - ACC_VERTICAL:   up/down   moves to the prev/next item; left/right → null
     *  - TABBED:         left/right moves to the prev/next tab;  up/down → null
     */
    getAdjacentWindowId(windowId: number, direction: Direction): number | null {
        const currentIndex = this._getIndexOfWindow(windowId);
        if (currentIndex === -1) return null;

        if (this.isTabbed()) {
            // Tabbed: left/right cycle through tabs
            if (direction === Direction.LEFT || direction === Direction.UP) {
                const newIndex = currentIndex - 1;
                if (newIndex < 0) return null;
                return this._windowIdAtIndex(newIndex);
            }
            if (direction === Direction.RIGHT || direction === Direction.DOWN) {
                const newIndex = currentIndex + 1;
                if (newIndex >= this._tiledItems.length) return null;
                return this._windowIdAtIndex(newIndex);
            }
            return null;
        }

        // Accordion mode – only navigate along the container's axis
        const isAlongAxis =
            (this._orientation === Layout.ACC_HORIZONTAL && (direction === Direction.LEFT || direction === Direction.RIGHT)) ||
            (this._orientation === Layout.ACC_VERTICAL   && (direction === Direction.UP   || direction === Direction.DOWN));

        if (!isAlongAxis) return null;

        const delta = (direction === Direction.LEFT || direction === Direction.UP) ? -1 : 1;
        const newIndex = currentIndex + delta;
        if (newIndex < 0 || newIndex >= this._tiledItems.length) return null;

        return this._windowIdAtIndex(newIndex);
    }

    /**
     * Return the "representative" window ID for the item at `index`.
     * If the item is a WindowWrapper, return its ID directly.
     * If it's a nested WindowContainer, return the first (or last) leaf window.
     */
    private _windowIdAtIndex(index: number): number | null {
        const item = this._tiledItems[index];
        if (!item) return null;

        if (item instanceof WindowWrapper) {
            return item.getWindowId();
        }
        if (item instanceof WindowContainer) {
            return item._firstLeafWindowId();
        }
        return null;
    }

    /**
     * Return the window ID of the first leaf window in this container (depth-first).
     */
    _firstLeafWindowId(): number | null {
        for (const item of this._tiledItems) {
            if (item instanceof WindowWrapper) return item.getWindowId();
            if (item instanceof WindowContainer) {
                const id = item._firstLeafWindowId();
                if (id !== null) return id;
            }
        }
        return null;
    }

    /**
     * Return the window ID of the last leaf window in this container (depth-first from end).
     */
    _lastLeafWindowId(): number | null {
        for (let i = this._tiledItems.length - 1; i >= 0; i--) {
            const item = this._tiledItems[i];
            if (item instanceof WindowWrapper) return item.getWindowId();
            if (item instanceof WindowContainer) {
                const id = item._lastLeafWindowId();
                if (id !== null) return id;
            }
        }
        return null;
    }
}
