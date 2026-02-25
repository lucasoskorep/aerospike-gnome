import Meta from 'gi://Meta';
import Clutter from "gi://Clutter";
import {IWindowManager} from "./windowManager.js";
import {Logger} from "../utils/logger.js";
import {Rect} from "../utils/rect.js";
import WindowContainer from "./container.js";
import queueEvent from "../utils/events.js";


type WindowMinimizedHandler = (window: WindowWrapper) => void;
type WindowWorkspaceChangedHandler = (window: WindowWrapper) => void;

export class WindowWrapper {
    private static readonly RESIZE_TOLERANCE = 2;

    readonly _window: Meta.Window;
    readonly _windowMinimizedHandler: WindowMinimizedHandler;
    readonly _signals: number[] = [];
    _parent: WindowContainer | null = null;
    _dragging: boolean = false;

    constructor(
        window: Meta.Window,
        winMinimized: WindowMinimizedHandler
    ) {
        this._window = window;
        this._windowMinimizedHandler = winMinimized;
    }

    getWindow(): Meta.Window {
        return this._window;
    }

    getWindowId(): number {
        return this._window.get_id();
    }

    getWorkspace(): number {
        return this._window.get_workspace().index();
    }

    getMonitor(): number {
        return this._window.get_monitor();
    }

    getRect(): Rect {
        return this._window.get_frame_rect();
    }

    startDragging(): void {
        this._dragging = true;
    }

    stopDragging(): void {
        Logger.log("STOPPED DRAGGING")
        this._dragging = false;
    }

    connectWindowSignals(windowManager: IWindowManager): void {
        const windowId = this._window.get_id();
        this._signals.push(
            this._window.connect('unmanaging', () => {
                Logger.log("REMOVING WINDOW", windowId);
                windowManager.handleWindowClosed(this);
            }),
            this._window.connect('notify::minimized', () => {
                if (this._window.minimized) {
                    Logger.log(`Window minimized: ${windowId}`);
                    windowManager.handleWindowMinimized(this);
                } else {
                    Logger.log(`Window unminimized: ${windowId}`);
                    windowManager.handleWindowUnminimized(this);
                }
            }),
            this._window.connect('notify::maximized-horizontally', () => {
                if (this._window.is_maximized()) {
                    Logger.log(`Window maximized: ${windowId}`);
                } else {
                    Logger.log(`Window unmaximized: ${windowId}`);
                }
            }),
            this._window.connect("workspace-changed", () => {
                Logger.log("WORKSPACE CHANGED FOR WINDOW", this._window.get_id());
                windowManager.handleWindowChangedWorkspace(this);
            }),
            this._window.connect("position-changed", () => {
                windowManager.handleWindowPositionChanged(this);
            }),
            this._window.connect("size-changed", () => {
                windowManager.handleWindowPositionChanged(this);
            }),
        );
    }

    disconnectWindowSignals(): void {
        if (this._signals) {
            this._signals.forEach(signal => {
                try {
                    if (this._window != null) {
                        this._window.disconnect(signal);
                    }
                } catch (e) {
                    Logger.warn("error disconnecting signal", signal, e);
                }
            });
        }
    }

    safelyResizeWindow(rect: Rect, _retry: number = 3): void {
        if (this._dragging) {
            Logger.info("STOPPED RESIZE BECAUSE ITEM IS BEING DRAGGED");
            return;
        }

        const actor = this._window.get_compositor_private() as Clutter.Actor | null;
        if (!actor) {
            Logger.log("No actor available, can't resize safely yet");
            return;
        }

        actor.remove_all_transitions();
        this._window.move_resize_frame(true, rect.x, rect.y, rect.width, rect.height);

        const new_rect = this._window.get_frame_rect();
        const mismatch =
            Math.abs(new_rect.x      - rect.x)      > WindowWrapper.RESIZE_TOLERANCE ||
            Math.abs(new_rect.y      - rect.y)      > WindowWrapper.RESIZE_TOLERANCE ||
            Math.abs(new_rect.width  - rect.width)  > WindowWrapper.RESIZE_TOLERANCE ||
            Math.abs(new_rect.height - rect.height) > WindowWrapper.RESIZE_TOLERANCE;

        if (_retry > 0 && mismatch) {
            Logger.warn("RESIZE MISMATCH, retrying",
                `want(${rect.x},${rect.y},${rect.width},${rect.height})`,
                `got(${new_rect.x},${new_rect.y},${new_rect.width},${new_rect.height})`);
            queueEvent({
                name: `delayed_resize_${this.getWindowId()}`,
                callback: () => this.safelyResizeWindow(rect, _retry - 1),
            }, 50);
        }
    }
}
