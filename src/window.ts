import Meta from 'gi://Meta';
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";
import {IWindowManager} from "./windowManager.js";
import {Logger} from "./utils/logger.js";

export type Signal = {
    name: string;
    id: number;
}

export class WindowWrapper {
    _window: Meta.Window;
    _signals: Signal[];

    constructor(window: Meta.Window) {
        this._window = window;
        this._signals = [];
    }

    connectWindowSignals(
        windowManager: IWindowManager,
    ): void {

        const windowId = this._window.get_id();


        // Handle window destruction
        const destroyId = this._window.connect('unmanaging', () => {
            Logger.log("REMOVING WINDOW", windowId);
            windowManager.handleWindowClosed(windowId)
        });
        this._signals.push({name: 'unmanaging', id: destroyId});

        // Handle focus changes
        const focusId = this._window.connect('notify::has-focus', () => {
            if (this._window.has_focus()) {
                windowManager._activeWindowId = windowId;
            }
        });
        this._signals.push({name: 'notify::has-focus', id: focusId});

        // Track window movement using position-changed signal
        let lastPositionChangeTime = 0;
        let dragInProgress = false;
        
        // const positionChangedId = this._window.connect('position-changed', window => {
        //     Logger.log("position-changed", window.get_id());
        //     Logger.log(window.get_monitor())
        //     // const currentTime = Date.now();
        //     // const [x, y, _] = global.get_pointer();
        //     //
        //     // // If this is the first move or it's been a while since the last move, consider it the start of a drag
        //     // if (!dragInProgress) {
        //     //     dragInProgress = true;
        //     //     Logger.log(`Window drag started for window ${windowId}. Mouse position: ${x}, ${y}`);
        //     // }
        //     //
        //     // // Update the time of the last position change
        //     // lastPositionChangeTime = currentTime;
        //     //
        //     // // Set a timeout to detect when dragging stops (when position changes stop coming in)
        //     // GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
        //     //     const timeSinceLastMove = Date.now() - lastPositionChangeTime;
        //     //     // If it's been more than 200ms since the last move and we were dragging, consider the drag ended
        //     //     if (timeSinceLastMove >= 200 && dragInProgress) {
        //     //         dragInProgress = false;
        //     //         const [endX, endY, _] = global.get_pointer();
        //     //         Logger.log(`Window drag ended for window ${windowId}. Mouse position: ${endX}, ${endY}`);
        //     //     }
        //     //     return GLib.SOURCE_REMOVE; // Remove the timeout
        //     // });
        // });
        // this._signals.push({name: 'position-changed', id: positionChangedId});

        // Handle minimization
        const minimizeId = this._window.connect('notify::minimized', () => {
            if (this._window.minimized) {
                Logger.log(`Window minimized: ${windowId}`);
                // Remove window from managed windows temporarily
                // windowManager.removeFromTree(this._window);
                // If this was the active window, find a new one
                windowManager.syncActiveWindow()
                // Retile remaining windows
                windowManager._tileWindows();

            } else if (!this._window.minimized) {
                Logger.log(`Window unminimized: ${windowId}`);
                windowManager.addWindow(this._window);

            }
        });
        this._signals.push({name: 'notify::minimized', id: minimizeId});

        // Handle maximization
        const maximizeId = this._window.connect('notify::maximized-horizontally', () => {
            if (this._window.get_maximized()) {
                Logger.log(`Window maximized: ${windowId}`);
            } else {
                Logger.log(`Window unmaximized: ${windowId}`);
            }
        });
        this._signals.push({name: 'notify::maximized-horizontally', id: maximizeId});
    }

    disconnectWindowSignals(): void {

        // Disconnect signals
        if (this._signals) {
            this._signals.forEach(signal => {
                try {
                    if (this._window != null) {
                        this._window.disconnect(signal.id);
                    }
                } catch (e) {
                    // Window might already be gone
                }
            });
        }
    }

    resizeWindow(x: number, y: number, width: number, height: number) {
        // First, ensure window is not maximized or fullscreen
        if (this._window.get_maximized()) {
            Logger.log("WINDOW MAXIMIZED")
            this._window.unmaximize(Meta.MaximizeFlags.BOTH);
        }

        if (this._window.is_fullscreen()) {
            Logger.log("WINDOW IS FULLSCREEN")
            this._window.unmake_fullscreen();
        }
        Logger.log("WINDOW", this._window.get_window_type(), this._window.allows_move());
        Logger.log("MONITOR INFO", getUsableMonitorSpace(this._window));
        Logger.log("NEW_SIZE", x, y, width, height);
        // win.move_resize_frame(false, 50, 50, 300, 300);
        this._window.move_resize_frame(false, x, y, width, height);
        Logger.log("RESIZED WINDOW", this._window.get_frame_rect().height, this._window.get_frame_rect().width, this._window.get_frame_rect().x, this._window.get_frame_rect().y);
    }

    safelyResizeWindow(x: number, y: number, width: number, height: number): void {
        Logger.log("SAFELY RESIZE", x, y, width, height);
        const actor = this._window.get_compositor_private();

        if (!actor) {
            Logger.log("No actor available, can't resize safely yet");
            return;
        }

// Set a flag to track if the resize has been done
        let resizeDone = false;

// Connect to the first-frame signal
        const id = actor.connect('first-frame', () => {
            // Disconnect the signal handler
            actor.disconnect(id);

            if (!resizeDone) {
                resizeDone = true;

                // Add a small delay
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                    try {
                        this.resizeWindow(x, y, width, height);
                    } catch (e) {
                        console.error("Error resizing window:", e);
                    }
                    return GLib.SOURCE_REMOVE;
                });
            }
        });

// Fallback timeout in case the first-frame signal doesn't fire
// (for windows that are already mapped)
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            if (!resizeDone) {
                resizeDone = true;
                try {
                    this.resizeWindow(x, y, width, height);
                } catch (e) {
                    console.error("Error resizing window (fallback):", e);
                }
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    // if (!this._window) return;
    // this._window.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
    // this._window.unmaximize(Meta.MaximizeFlags.VERTICAL);
    // this._window.unmaximize(Meta.MaximizeFlags.BOTH);
    //
    // let windowActor = this._window.get_compositor_private() as Clutter.Actor;
    // if (!windowActor) return;
    // windowActor.remove_all_transitions();
    //
    // this._window.move_frame(true, x, y);
    // this._window.move_resize_frame(true, x, y, width, height);


}

function getUsableMonitorSpace(window: Meta.Window) {
    // Get the current workspace
    const workspace = window.get_workspace();

    // Get the monitor index that this window is on
    const monitorIndex = window.get_monitor();

    // Get the work area
    const workArea = workspace.get_work_area_for_monitor(monitorIndex);

    return {
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height
    };
}