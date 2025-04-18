import GLib from 'gi://GLib';
import St from 'gi://St';
import Meta from 'gi://Meta';
import {Extension, ExtensionMetadata} from 'resource:///org/gnome/shell/extensions/extension.js';
import Mtk from "@girs/mtk-16";

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

import { WindowTree, WindowNode, createWindowNode, addNodeChild, removeNode, findNodeByWindowId, calculateLayout } from './src/winGroup.js';

type Signal = {
    name: string;
    id: number;
}

type WinWrapper = {
    window: Meta.Window | null;
    signals: Signal[] | null;
}

type WorkspaceMonitorKey = `${number}-${number}`; // format: "workspace-monitor"

type DraggedWindowInfo = {
    id: number;
    originalMonitor: number;
    originalWorkspace: number;
}

export default class aerospike extends Extension {
    settings: Gio.Settings;
    keyBindings: Map<string, number>;
    borderActor: St.Widget | null;
    focusWindowSignals: any[];
    lastFocusedWindow: Meta.Window | null;
    _focusSignal: number | null;
    _windowCreateId: number | null;
    _windows: Map<number, WinWrapper>;
    _windowTrees: Map<WorkspaceMonitorKey, WindowTree>;
    _activeWindowId: number | null;
    _windowDragBeginId: number | null;
    _windowDragEndId: number | null;
    _draggedWindowInfo: DraggedWindowInfo | null;
    _workspaceChangedId: number | null;

    constructor(metadata: ExtensionMetadata) {
        super(metadata);
        this.settings = this.getSettings('org.gnome.shell.extensions.aerospike');
        this.keyBindings = new Map();
        // Initialize instance variables
        this.borderActor = null;
        this.focusWindowSignals = [];
        this.lastFocusedWindow = null;
        this._focusSignal = null;
        this._windowCreateId = null;
        this._windows = new Map<number, WinWrapper>();
        this._windowTrees = new Map<WorkspaceMonitorKey, WindowTree>();
        this._activeWindowId = null;
        this._windowDragBeginId = null;
        this._windowDragEndId = null;
        this._draggedWindowInfo = null;
        this._workspaceChangedId = null;
    }

    enable() {
        try {
            console.log("STARTING AEROSPIKE!");
            
            // Initialize data structures
            this._windows = new Map<number, WinWrapper>();
            this._windowTrees = new Map<WorkspaceMonitorKey, WindowTree>();
            this._activeWindowId = null;
            this._draggedWindowInfo = null;
            
            // Connect to window creation
            this._windowCreateId = global.display.connect(
                'window-created',
                (display, window) => {
                    try {
                        this.handleWindowCreated(window);
                    } catch (e) {
                        console.error("Error handling window creation:", e);
                    }
                }
            );

            // Connect to window drag operations
            this._connectDraggingSignals();
            
            // Connect to workspace change signals
            this._workspaceChangedId = global.workspace_manager.connect(
                'workspace-switched',
                (_workspaceManager, _oldWorkspaceIndex, _newWorkspaceIndex) => {
                    try {
                        this._refreshActiveWorkspace();
                    } catch (e) {
                        console.error("Error refreshing workspace:", e);
                    }
                }
            );
            
            // Setup keybindings
            this.bindSettings();
            
            // Capture existing windows - do this last
            this._captureExistingWindows();
            
            console.log("AEROSPIKE STARTED SUCCESSFULLY");
        } catch (e) {
            console.error("Error enabling Aerospike:", e);
            // Perform cleanup if something failed
            this.disable();
        }
    }

    _connectDraggingSignals() {
        // Handle window drag begin
        this._windowDragBeginId = global.display.connect(
            'grab-op-begin',
            (_display, window, op) => {
                if (window && (op === Meta.GrabOp.MOVING || op === Meta.GrabOp.KEYBOARD_MOVING)) {
                    this._handleDragBegin(window);
                }
            }
        );
        
        // Handle window drag end
        this._windowDragEndId = global.display.connect(
            'grab-op-end',
            (_display, window, op) => {
                if (window && (op === Meta.GrabOp.MOVING || op === Meta.GrabOp.KEYBOARD_MOVING)) {
                    this._handleDragEnd(window);
                }
            }
        );
    }

    _handleDragBegin(window: Meta.Window) {
        try {
            if (!window) {
                console.error("Received null window in _handleDragBegin");
                return;
            }
            
            const workspace = window.get_workspace();
            if (!workspace) {
                console.error("Window has no workspace in _handleDragBegin");
                return;
            }
            
            const id = window.get_id();
            console.log(`Drag begin for window ${id}`);
            
            this._draggedWindowInfo = {
                id: id,
                originalMonitor: window.get_monitor(),
                originalWorkspace: workspace.index()
            };
            
            console.log(`Original location: workspace ${this._draggedWindowInfo.originalWorkspace}, monitor ${this._draggedWindowInfo.originalMonitor}`);
        } catch (e) {
            console.error("Error in _handleDragBegin:", e);
            this._draggedWindowInfo = null;
        }
    }

    _handleDragEnd(window: Meta.Window) {
        try {
            if (!window) {
                console.error("Received null window in _handleDragEnd");
                this._draggedWindowInfo = null;
                return;
            }
            
            if (!this._draggedWindowInfo) {
                console.log("No drag info available, ignoring drag end");
                return;
            }
            
            const workspace = window.get_workspace();
            if (!workspace) {
                console.error("Window has no workspace in _handleDragEnd");
                this._draggedWindowInfo = null;
                return;
            }
            
            const id = window.get_id();
            const newMonitor = window.get_monitor();
            const newWorkspace = workspace.index();
            
            console.log(`Drag end for window ${id}: new location - workspace ${newWorkspace}, monitor ${newMonitor}`);
            
            // Check if monitor or workspace changed
            if (this._draggedWindowInfo.originalMonitor !== newMonitor || 
                this._draggedWindowInfo.originalWorkspace !== newWorkspace) {
                
                console.log(`Window moved from workspace ${this._draggedWindowInfo.originalWorkspace}, monitor ${this._draggedWindowInfo.originalMonitor}`);
                console.log(`to workspace ${newWorkspace}, monitor ${newMonitor}`);
                
                // Remove from old tree
                const oldKey = `${this._draggedWindowInfo.originalWorkspace}-${this._draggedWindowInfo.originalMonitor}` as WorkspaceMonitorKey;
                this._removeWindowFromTree(id, oldKey);
                
                // Add to new tree
                this._addWindowToTree(window, newWorkspace, newMonitor);
                
                // Retile both affected trees with a small delay
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                    try {
                        this._tileWindowsInTree(oldKey);
                        this._tileWindowsInTree(`${newWorkspace}-${newMonitor}` as WorkspaceMonitorKey);
                    } catch (e) {
                        console.error("Error retiling after drag:", e);
                    }
                    return GLib.SOURCE_REMOVE;
                });
            } else {
                console.log("Window position unchanged after drag");
            }
        } catch (e) {
            console.error("Error in _handleDragEnd:", e);
        } finally {
            this._draggedWindowInfo = null;
        }
    }

    _refreshActiveWorkspace() {
        // Refresh all trees in the current workspace
        const workspace = global.workspace_manager.get_active_workspace();
        const workspaceIndex = workspace.index();
        
        // Find all trees in the current workspace
        for (const key of this._windowTrees.keys()) {
            const [wsIndex, _] = key.split('-').map(Number);
            if (wsIndex === workspaceIndex) {
                this._tileWindowsInTree(key as WorkspaceMonitorKey);
            }
        }
    }

    private bindSettings() {
        // Monitor settings changes
        this.settings.connect('changed::keybinding-1', () => {
            log(`Keybinding 1 changed to: ${this.settings.get_strv('keybinding-1')}`);
            this.refreshKeybinding('keybinding-1');
        });

        this.settings.connect('changed::keybinding-2', () => {
            log(`Keybinding 2 changed to: ${this.settings.get_strv('keybinding-2')}`);
            this.refreshKeybinding('keybinding-2');
        });

        this.settings.connect('changed::keybinding-3', () => {
            log(`Keybinding 3 changed to: ${this.settings.get_strv('keybinding-3')}`);
            this.refreshKeybinding('keybinding-3');
        });

        this.settings.connect('changed::keybinding-4', () => {
            log(`Keybinding 4 changed to: ${this.settings.get_strv('keybinding-4')}`);
            this.refreshKeybinding('keybinding-4');
        });

        this.settings.connect('changed::dropdown-option', () => {
            log(`Dropdown option changed to: ${this.settings.get_string('dropdown-option')}`);
        });

        this.settings.connect('changed::color-selection', () => {
            log(`Color selection changed to: ${this.settings.get_string('color-selection')}`);
        });
    }
    
    private refreshKeybinding(settingName: string) {
        if (this.keyBindings.has(settingName)) {
            Main.wm.removeKeybinding(settingName);
            this.keyBindings.delete(settingName);
        }

        switch (settingName) {
            case 'keybinding-1':
                this.bindKeybinding('keybinding-1', () => {
                    log('Keybinding 1 was pressed!');
                });
                break;
            case 'keybinding-2':
                this.bindKeybinding('keybinding-2', () => {
                    log('Keybinding 2 was pressed!');
                });
                break;
            case 'keybinding-3':
                this.bindKeybinding('keybinding-3', () => {
                    log('Keybinding 3 was pressed!');
                });
                break;
            case 'keybinding-4':
                this.bindKeybinding('keybinding-4', () => {
                    log('Keybinding 4 was pressed!');
                });
                break;
        }
    }

    private removeKeybindings() {
        this.keyBindings.forEach((_, key) => {
            Main.wm.removeKeybinding(key);
        });
        this.keyBindings.clear();
    }

    private setupKeybindings() {
        this.bindKeybinding('keybinding-1', () => {
            log('Keybinding 1 was pressed!');
        });

        this.bindKeybinding('keybinding-2', () => {
            log('Keybinding 2 was pressed!');
        });

        this.bindKeybinding('keybinding-3', () => {
            log('Keybinding 3 was pressed!');
        });

        this.bindKeybinding('keybinding-4', () => {
            log('Keybinding 4 was pressed!');
        });
    }

    private bindKeybinding(settingName: string, callback: () => void) {
        const keyBindingSettings = this.settings.get_strv(settingName);

        if (keyBindingSettings.length === 0 || keyBindingSettings[0] === '') {
            return;
        }

        const keyBindingAction = Main.wm.addKeybinding(
            settingName,
            this.settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL,
            callback
        );

        this.keyBindings.set(settingName, keyBindingAction);
    }

    handleWindowCreated(window: Meta.Window) {
        try {
            if (!window) {
                console.error("Received null or undefined window");
                return;
            }
            
            console.log("WINDOW CREATED", window);
            
            if (!this._isWindowTileable(window)) {
                console.log("Window is not tileable, ignoring");
                return;
            }
            
            console.log("WINDOW IS TILABLE");
            
            const actor = window.get_compositor_private();
            if (!actor) {
                console.log("Window has no compositor actor, ignoring");
                return;
            }
            
            // Get workspace safely
            const workspace = window.get_workspace();
            if (!workspace) {
                console.error("Window has no workspace, ignoring");
                return;
            }
            
            // Track window for signal management
            this._addWindow(window);
            
            // Add to appropriate tree
            const workspaceIndex = workspace.index();
            const monitor = window.get_monitor();
            
            console.log(`Adding window to workspace ${workspaceIndex}, monitor ${monitor}`);
            this._addWindowToTree(window, workspaceIndex, monitor);
        } catch (e) {
            console.error("Error in handleWindowCreated:", e);
        }
    }

    _captureExistingWindows() {
        try {
            console.log("CAPTURING WINDOWS");
            
            // Get all workspaces
            const workspaceCount = global.workspace_manager.get_n_workspaces();
            const monitorCount = global.display.get_n_monitors();
            
            console.log(`Found ${workspaceCount} workspaces and ${monitorCount} monitors`);
            
            // Initialize trees for all workspace-monitor combinations
            for (let wsIndex = 0; wsIndex < workspaceCount; wsIndex++) {
                const workspace = global.workspace_manager.get_workspace_by_index(wsIndex);
                if (!workspace) {
                    console.error(`Workspace at index ${wsIndex} not found`);
                    continue;
                }
                
                for (let monIndex = 0; monIndex < monitorCount; monIndex++) {
                    try {
                        // Create empty tree for this workspace-monitor combination
                        this._getWindowTree(wsIndex, monIndex);
                        
                        // Get windows for this workspace
                        const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace);
                        console.log(`Found ${windows.length} windows in workspace ${wsIndex}`);
                        
                        // Add tileable windows to the appropriate tree
                        let addedWindows = 0;
                        for (const window of windows) {
                            try {
                                if (window && this._isWindowTileable(window) && window.get_monitor() === monIndex) {
                                    // Track window for signal management
                                    this._addWindow(window);
                                    
                                    // Add to tree
                                    this._addWindowToTree(window, wsIndex, monIndex);
                                    addedWindows++;
                                }
                            } catch (e) {
                                console.error(`Error processing window in workspace ${wsIndex}, monitor ${monIndex}:`, e);
                            }
                        }
                        
                        console.log(`Added ${addedWindows} windows to workspace ${wsIndex}, monitor ${monIndex}`);
                    } catch (e) {
                        console.error(`Error processing monitor ${monIndex} in workspace ${wsIndex}:`, e);
                    }
                }
            }
            
            // Tile all trees with a slight delay to ensure all windows are ready
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                try {
                    for (const key of this._windowTrees.keys()) {
                        this._tileWindowsInTree(key as WorkspaceMonitorKey);
                    }
                } catch (e) {
                    console.error("Error tiling windows:", e);
                }
                return GLib.SOURCE_REMOVE;
            });
            
            console.log("FINISHED CAPTURING WINDOWS");
        } catch (e) {
            console.error("Error in _captureExistingWindows:", e);
        }
    }
    
    _getWindowTree(workspace: number, monitor: number): WindowTree {
        const key: WorkspaceMonitorKey = `${workspace}-${monitor}` as WorkspaceMonitorKey;
        
        if (!this._windowTrees.has(key)) {
            this._windowTrees.set(key, {
                root: null,
                monitor: monitor,
                workspace: workspace
            });
        }
        
        return this._windowTrees.get(key)!;
    }
    
    _addWindowToTree(window: Meta.Window, workspace: number, monitor: number) {
        const tree = this._getWindowTree(workspace, monitor);
        const windowNode = createWindowNode(window);
        
        if (!tree.root) {
            // First window in this tree
            tree.root = windowNode;
        } else {
            // Add to existing tree
            addNodeChild(tree.root, windowNode);
        }
        
        // Update the layout
        this._tileWindowsInTree(`${workspace}-${monitor}` as WorkspaceMonitorKey);
    }
    
    _removeWindowFromTree(windowId: number, key: WorkspaceMonitorKey) {
        const tree = this._windowTrees.get(key);
        if (!tree) return;
        
        const node = findNodeByWindowId(tree, windowId);
        if (node) {
            removeNode(node, tree);
        }
    }
    
    _tileWindowsInTree(key: WorkspaceMonitorKey) {
        try {
            console.log(`Tiling windows for ${key}`);
            
            const tree = this._windowTrees.get(key);
            if (!tree || !tree.root) {
                console.log(`No tree or empty tree for ${key}`);
                return;
            }
            
            // Get workspace and monitor info
            const [workspaceIndex, monitorIndex] = key.split('-').map(Number);
            
            const workspace = global.workspace_manager.get_workspace_by_index(workspaceIndex);
            if (!workspace) {
                console.error(`Workspace ${workspaceIndex} not found`);
                return;
            }
            
            const workArea = workspace.get_work_area_for_monitor(monitorIndex);
            if (!workArea) {
                console.error(`WorkArea for monitor ${monitorIndex} in workspace ${workspaceIndex} not found`);
                return;
            }
            
            console.log(`Work area for ${key}: ${workArea.x},${workArea.y} ${workArea.width}x${workArea.height}`);
            
            // Calculate layout
            calculateLayout(tree.root, {
                x: workArea.x,
                y: workArea.y,
                width: workArea.width,
                height: workArea.height
            });
            
            // Apply layout to all windows in the tree
            this._applyLayoutToTree(tree.root);
            
            console.log(`Finished tiling windows for ${key}`);
        } catch (e) {
            console.error(`Error tiling windows for ${key}:`, e);
        }
    }
    
    _applyLayoutToTree(node: WindowNode) {
        try {
            // Apply layout to this node
            if (node.window) {
                // Validate window object
                if (!node.window.get_compositor_private) {
                    console.error(`Window at node ${node.windowId} is invalid`);
                    return;
                }
                
                // Check for valid rect dimensions
                if (node.rect.width <= 0 || node.rect.height <= 0) {
                    console.error(`Invalid rect dimensions for window ${node.windowId}: ${node.rect.width}x${node.rect.height}`);
                    return;
                }
                
                // Resize window
                this.safelyResizeWindow(
                    node.window,
                    node.rect.x,
                    node.rect.y,
                    node.rect.width,
                    node.rect.height
                );
            }
            
            // Apply layout to all children
            for (const child of node.children) {
                try {
                    this._applyLayoutToTree(child);
                } catch (e) {
                    console.error(`Error applying layout to child node:`, e);
                }
            }
        } catch (e) {
            console.error(`Error in _applyLayoutToTree:`, e);
        }
    }

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

    // Function to safely resize a window after it's ready
    safelyResizeWindow(win: Meta.Window, x: number, y: number, width: number, height: number): void {
        const actor = win.get_compositor_private();

        if (!actor) {
            console.log("No actor available, can't resize safely yet");
            return;
        }
        
        // Check if the window type needs special handling
        const windowType = win.get_window_type();
        
        // Try immediate resize first for most window types
        if (windowType === Meta.WindowType.NORMAL) {
            // Standard resizing path with safety checks
            this.resizeWindow(win, x, y, width, height);
            
            // Set up a verification check
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                const rect = win.get_frame_rect();
                
                // If window didn't resize well, try again with the first-frame signal
                if (Math.abs(rect.width - width) > 5 || Math.abs(rect.height - height) > 5) {
                    this._setupFirstFrameResize(win, actor, x, y, width, height);
                }
                
                return GLib.SOURCE_REMOVE;
            });
        } else {
            // For non-standard windows, use the original approach
            this._setupFirstFrameResize(win, actor, x, y, width, height);
        }
    }
    
    _setupFirstFrameResize(win: Meta.Window, actor: any, x: number, y: number, width: number, height: number): void {
        // Set a flag to track if the resize has been done
        let resizeDone = false;

        // Connect to the first-frame signal
        const id = actor.connect('first-frame', () => {
            // Disconnect the signal handler
            actor.disconnect(id);

            if (!resizeDone) {
                resizeDone = true;

                // Add a small delay
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                    try {
                        this.resizeWindow(win, x, y, width, height);
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
                    this.resizeWindow(win, x, y, width, height);
                } catch (e) {
                    console.error("Error resizing window (fallback):", e);
                }
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    resizeWindow(win: Meta.Window, x:number, y:number, width:number, height:number) {
        // First, ensure window is not maximized or fullscreen
        const wasMaximized = win.get_maximized();
        const wasFullscreen = win.is_fullscreen();
        
        if (wasMaximized) {
            console.log("WINDOW MAXIMIZED")
            win.unmaximize(Meta.MaximizeFlags.BOTH);
        }

        if (wasFullscreen) {
            console.log("WINDOW IS FULLSCREEN")
            win.unmake_fullscreen();
        }
        
        // Wait for state change to complete if needed
        if (wasMaximized || wasFullscreen) {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._performResize(win, x, y, width, height);
                return GLib.SOURCE_REMOVE;
            });
        } else {
            // Immediate resize if no state change needed
            this._performResize(win, x, y, width, height);
        }
    }
    
    _performResize(win: Meta.Window, x:number, y:number, width:number, height:number) {
        console.log("WINDOW", win.get_window_type(), win.allows_move());
        console.log("MONITOR INFO", this.getUsableMonitorSpace(win));
        console.log("NEW_SIZE", x, y, width, height);
        
        // Perform the actual resize
        win.move_resize_frame(false, x, y, width, height);
        
        // Check result
        const newRect = win.get_frame_rect();
        console.log("RESIZED WINDOW", newRect.height, newRect.width, newRect.x, newRect.y);
        
        // Validate the resize was successful
        if (Math.abs(newRect.x - x) > 5 || Math.abs(newRect.y - y) > 5 || 
            Math.abs(newRect.width - width) > 5 || Math.abs(newRect.height - height) > 5) {
            console.warn(`Resize did not achieve expected dimensions for window ${win.get_id()}`);
            
            // Try a second time if the resize didn't work well
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                win.move_resize_frame(false, x, y, width, height);
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _addWindow(window: Meta.Window) {
        const windowId = window.get_id();

        // Connect to window signals
        const signals: Signal[] = [];
        console.log("ADDING WINDOW", window);

        const destroyId = window.connect('unmanaging', () => {
            console.log("REMOVING WINDOW", windowId);
            this._handleWindowClosed(windowId);
        });
        signals.push({name: 'unmanaging', id: destroyId});

        const focusId = window.connect('notify::has-focus', () => {
            if (window.has_focus()) {
                this._activeWindowId = windowId;
            }
        });
        signals.push({name: 'notify::has-focus', id: focusId});
        
        // Monitor change signal
        const monitorChangedId = window.connect('notify::monitor', () => {
            this._handleWindowMonitorChanged(window);
        });
        signals.push({name: 'notify::monitor', id: monitorChangedId});
        
        // Workspace change signal
        const workspaceChangedId = window.connect('workspace-changed', () => {
            this._handleWindowWorkspaceChanged(window);
        });
        signals.push({name: 'workspace-changed', id: workspaceChangedId});

        // Add window to managed windows
        this._windows.set(windowId, {
            window: window,
            signals: signals
        });

        // If this is the first window, make it the active one
        if (this._windows.size === 1 || window.has_focus()) {
            this._activeWindowId = windowId;
        }
    }
    
    _handleWindowMonitorChanged(window: Meta.Window) {
        const windowId = window.get_id();
        
        // Find which tree this window is in
        for (const [key, tree] of this._windowTrees.entries()) {
            const node = findNodeByWindowId(tree, windowId);
            if (node) {
                // Found the window - get new workspace/monitor
                const newWorkspace = window.get_workspace().index();
                const newMonitor = window.get_monitor();
                const newKey = `${newWorkspace}-${newMonitor}` as WorkspaceMonitorKey;
                
                // Skip if it's already in the right tree
                if (key === newKey) return;
                
                // Remove from old tree
                this._removeWindowFromTree(windowId, key as WorkspaceMonitorKey);
                
                // Add to new tree
                this._addWindowToTree(window, newWorkspace, newMonitor);
                
                // Retile both trees
                this._tileWindowsInTree(key as WorkspaceMonitorKey);
                this._tileWindowsInTree(newKey);
                
                return;
            }
        }
    }
    
    _handleWindowWorkspaceChanged(window: Meta.Window) {
        // Similar to monitor change, but for workspace changes
        this._handleWindowMonitorChanged(window); // This handles both cases
    }

    _handleWindowClosed(windowId: number) {
        print("closing window", windowId);
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

        // Remove from all trees
        for (const key of this._windowTrees.keys()) {
            this._removeWindowFromTree(windowId, key as WorkspaceMonitorKey);
            this._tileWindowsInTree(key as WorkspaceMonitorKey);
        }

        // If this was the active window, find a new one
        if (this._activeWindowId === windowId && this._windows.size > 0) {
            this._activeWindowId = Array.from(this._windows.keys())[0];
        } else if (this._windows.size === 0) {
            this._activeWindowId = null;
        }
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

    disable() {
        console.log("DISABLED AEROSPIKE!")
        
        // Disconnect window creation signal
        if (this._windowCreateId) {
            global.display.disconnect(this._windowCreateId);
            this._windowCreateId = null;
        }
        
        // Disconnect workspace signals
        if (this._workspaceChangedId) {
            global.workspace_manager.disconnect(this._workspaceChangedId);
            this._workspaceChangedId = null;
        }
        
        // Disconnect drag signals
        if (this._windowDragBeginId) {
            global.display.disconnect(this._windowDragBeginId);
            this._windowDragBeginId = null;
        }
        
        if (this._windowDragEndId) {
            global.display.disconnect(this._windowDragEndId);
            this._windowDragEndId = null;
        }
        
        // Disconnect all window signals
        this._windows.forEach((windowData) => {
            if (windowData.signals && windowData.window) {
                windowData.signals.forEach(signal => {
                    try {
                        windowData.window!.disconnect(signal.id);
                    } catch (e) {
                        // Window might already be gone
                    }
                });
            }
        });
        
        // Clear all window data
        this._windows.clear();
        this._windowTrees.clear();
        
        // Remove keybindings
        this.removeKeybindings();
        
        // Reset state
        this._activeWindowId = null;
        this.lastFocusedWindow = null;
        this._draggedWindowInfo = null;
    }
}