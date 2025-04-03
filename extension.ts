import GLib from 'gi://GLib';
import St from 'gi://St';
import Meta from 'gi://Meta';
import {Extension, ExtensionMetadata} from 'resource:///org/gnome/shell/extensions/extension.js';
import type Mtk from '@girs/mtk-16';
// import Gio from 'gi://Gio';
// import cairo from "cairo";
// import Shell from 'gi://Shell';
// import * as Main from 'resource:///org/gnome/shell/ui/main.js';

type WinWrapper = {
    window: Meta.Window | null;
    signals: Signal[] | null;
}

type Signal = {
    name: string;
    id: number;
}

export default class aerospike extends Extension {

    borderActor: St.Widget | null;
    focusWindowSignals: any[];
    lastFocusedWindow: Meta.Window | null;
    _focusSignal: number | null;
    _windowCreateId: number | null;
    _windows: Map<number, WinWrapper>;
    _activeWindowId: number | null;

    constructor(metadata: ExtensionMetadata) {
        super(metadata);
        // Initialize instance variables
        this.borderActor = null;
        this.focusWindowSignals = [];
        this.lastFocusedWindow = null;
        this._focusSignal = null;
        this._windowCreateId = null;
        this._windows = new Map<number, WinWrapper>();
        this._activeWindowId = null;

    }

    enable() {
        console.log("STARTING AEROSPIKE!")

        // this._captureExistingWindows();
        // Connect window signals
        this._windowCreateId = global.display.connect(
            'window-created',
            (display, window) => {
                this.handleWindowCreated(window);
            }
        );
    }

    handleWindowCreated(window: Meta.Window) {
        console.log("WINDOW CREATED", window);
        if (!this._isWindowTileable(window)) {
            return;
        }
        console.log("WINDOW IS TILABLE");
        const actor = window.get_compositor_private();
        if (!actor) {
            return;
        }


        this._addWindow(window);
    }

    // _captureExistingWindows() {
    //     console.log("CAPTURING WINDOWS")
    //     const workspace = global.workspace_manager.get_active_workspace();
    //     const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace);
    //     console.log("WINDOWS", windows);
    //     windows.forEach(window => {
    //         if (this._isWindowTileable(window)) {
    //             this._addWindow(window);
    //         }
    //     });
    //
    //     // this._tileWindows();
    // }

    getUsableMonitorSpace(window: Meta.Window) {
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

    resizeWindow(win: Meta.Window, x:number, y:number, width:number, height:number) {
        // First, ensure window is not maximized or fullscreen
        // if (win.get_maximized()) {
        //     console.log("WINDOW MAXIMIZED")
        //     win.unmaximize(Meta.MaximizeFlags.BOTH);
        // }
        //
        // if (win.is_fullscreen()) {
        //     console.log("WINDOW IS FULLSCREEN")
        //     win.unmake_fullscreen();
        // }
        console.log("WINDOW", win.get_window_type(), win.allows_move());
        console.log("MONITOR INFO", this.getUsableMonitorSpace(win));
        console.log("NEW_SIZE", x, y, width, height);
        win.move_resize_frame(false, 50, 50, 300, 300);
        console.log("RESIZED WINDOW", win.get_frame_rect().height, win.get_frame_rect().width, win.get_frame_rect().x, win.get_frame_rect().y);
    }

    _addWindow(window: Meta.Window) {
        const windowId = window.get_id();

        // Connect to window signals
        const signals: Signal[] = [];
        console.log("ADDING WINDOW", window);
        // const act = window.get_compositor_private();
        // const id = act.connect('first-frame', _ => {
        //     this.resizeWindow(window);
        //     act.disconnect(id);
        // });

        // const destroyId = window.connect('unmanaging', () => {
        //     console.log("REMOVING WINDOW", windowId);
        //     this._handleWindowClosed(windowId);
        // });
        // signals.push({name: 'unmanaging', id: destroyId});

        // const focusId = window.connect('notify::has-focus', () => {
        //     if (window.has_focus()) {
        //         this._activeWindowId = windowId;
        //     }
        // });
        // signals.push({name: 'notify::has-focus', id: focusId});

        // Add window to managed windows
        this._windows.set(windowId, {
            window: window,
            signals: signals
        });

        // If this is the first window, make it the active one
        if (this._windows.size === 1 || window.has_focus()) {
            this._activeWindowId = windowId;
        }

        this._tileWindows();
    }

    _handleWindowClosed(windowId: number) {

        const windowData = this._windows.get(windowId);
        if (!windowData) {
            return;
        }

        // Disconnect signals
        if (windowData.signals) {
            windowData.signals.forEach(signal => {
                try {

                    if (windowData.window != null) {
                        windowData.window.disconnect(signal.id);
                    }
                } catch (e) {
                    // Window might already be gone
                }
            });
        }

        // Remove from managed windows
        this._windows.delete(windowId);

        // If this was the active window, find a new one
        if (this._activeWindowId === windowId && this._windows.size > 0) {
            this._activeWindowId = Array.from(this._windows.keys())[0];
        } else if (this._windows.size === 0) {
            this._activeWindowId = null;
        }

        // Retile remaining windows
        this._tileWindows();
    }


    _tileWindows() {
        console.log("TILING WINDOWS")
        const workspace = global.workspace_manager.get_active_workspace();
        const workArea = workspace.get_work_area_for_monitor(
            global.display.get_primary_monitor()
        );
        console.log("Workspace", workspace);
        console.log("WorkArea", workArea);

        // Get all windows for current workspace
        const windows = Array.from(this._windows.values())
            // .filter(({window}) => {
            //
            //     if (window != null) {
            //         return window.get_workspace() === workspace;
            //     }
            // })
            .map(({window}) => window);

        if (windows.length === 0) {
            return;
        }
        this._tileHorizontally(windows, workArea)

    }

    _tileHorizontally(windows: (Meta.Window | null)[], workArea: Mtk.Rectangle) {
        const windowWidth = Math.floor(workArea.width / windows.length);

        windows.forEach((window, index) => {
            const x = workArea.x + (index * windowWidth);
            const rect = {
                x: x,
                y: workArea.y,
                width: windowWidth,
                height: workArea.height
            };
            if (window != null) {
                this.resizeWindow(window, rect.x, rect.y, rect.width, rect.height);
            }
        });
    }

    _isWindowTileable(window: Meta.Window) {
        if (!window || !window.get_compositor_private()) {
            return false;
        }

        const windowType = window.get_window_type();
        console.log("WINDOW TYPE", windowType);
        // Skip certain types of windows
        return !window.is_skip_taskbar() &&
            windowType !== Meta.WindowType.DESKTOP &&
            windowType !== Meta.WindowType.DOCK &&
            windowType !== Meta.WindowType.DIALOG &&
            windowType !== Meta.WindowType.MODAL_DIALOG &&
            windowType !== Meta.WindowType.UTILITY &&
            windowType !== Meta.WindowType.MENU;
    }

    // _updateBorder(window: Meta.Window) {
    //     console.log("UPDATING THE BORDER")
    //     // Clear the previous border
    //     this._clearBorder();
    //     // Set a new border for the currently focused window
    //     if (window) {
    //         this._setBorder(window);
    //         this.lastFocusedWindow = window;
    //     }
    // }
    //
    // _setBorder(window: Meta.Window) {
    //     console.log("SETTING THE BORDER")
    //     if (!window) return;
    //
    //     const rect = window.get_frame_rect();
    //     if (!rect) return;
    //
    //     // Create a new actor for the border using St.Widget
    //     this.borderActor = new St.Widget({
    //         name: 'active-window-border',
    //         // style_class: 'active-window-border',
    //         reactive: false,
    //         x: rect.x - 1, // Adjust for border width
    //         y: rect.y - 1,
    //         width: rect.width + 2, // Increased to accommodate border
    //         height: rect.height + 2,
    //         // Initial style with default color.ts
    //         // style: `border: 4px solid hsl(${this.hue}, 100%, 50%); border-radius: 5px;`,
    //         // style: `border: 2px solid rgba(0, 0, 0, 0.5); border-radius: 3px;`
    //     });
    //
    //     // Add the border actor to the UI group
    //     global.window_group.add_child(this.borderActor);
    //     // Main.layoutManager.uiGroup.add_child(this.borderActor);
    //
    //     // Listen to window's changes in position and size
    //     this.focusWindowSignals?.push(window.connect('position-changed', () => this._updateBorderPosition(window)));
    //     this.focusWindowSignals?.push(window.connect('size-changed', () => this._updateBorderPosition(window)));
    //     this.focusWindowSignals?.push(window.connect('unmanaged', () => this._clearBorder()));
    //
    //     this._updateBorderPosition(window);
    //
    //     // Start the color.ts cycling
    //     this._startColorCycle();
    // }


    disable() {
        console.log("DISABLED AEROSPIKE!")
        // Disconnect the focus signal and remove any existing borders
        if (this._focusSignal) {
            global.display.disconnect(this._focusSignal);
            this._focusSignal = null;
        }

        // Clear the border on the last focused window if it exists
        // this._clearBorder();
        this.lastFocusedWindow = null;
    }


}