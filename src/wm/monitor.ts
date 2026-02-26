import {WindowWrapper} from "./window.js";
import {Rect} from "../utils/rect.js";
import {Logger} from "../utils/logger.js";

import WindowContainer from "./container.js";

export default class Monitor {

    _id: number;
    _workArea: Rect;
    _workspaces: WindowContainer[] = [];

    constructor(monitorId: number) {
        this._id = monitorId;
        const workspace = global.workspace_manager.get_active_workspace();
        this._workArea = workspace.get_work_area_for_monitor(this._id);
        Logger.log("CREATING MONITOR", monitorId);
        Logger.log("WorkArea", this._workArea.x, this._workArea.y, this._workArea.width, this._workArea.height);
        const workspaceCount = global.workspace_manager.get_n_workspaces();
        Logger.log("Workspace Count", workspaceCount);
        for (let i = 0; i < workspaceCount; i++) {
            this._workspaces.push(new WindowContainer(this._workArea));
        }
    }

    disconnectSignals() {
        for (const container of this._workspaces) {
            container.disconnectSignals();
        }
    }

    removeAllWindows(): void {
        for (const container of this._workspaces) {
            container.removeAllWindows();
        }
    }

    getWindow(windowId: number): WindowWrapper | undefined {
        for (const container of this._workspaces) {
            const win = container.getWindow(windowId);
            if (win) return win;
        }
        return undefined;
    }

    removeWindow(winWrap: WindowWrapper) {
        const windowId = winWrap.getWindowId();
        for (const container of this._workspaces) {
            if (container.getWindow(windowId)) {
                container.removeWindow(windowId);
            }
        }
    }

    addWindow(winWrap: WindowWrapper) {
        const window_workspace = winWrap.getWindow().get_workspace().index();
        this._workspaces[window_workspace].addWindow(winWrap);
    }

    tileWindows(): void {
        const activeWorkspace = global.workspace_manager.get_active_workspace();
        this._workArea = activeWorkspace.get_work_area_for_monitor(this._id);
        // move() calls tileWindows() internally
        this._workspaces[activeWorkspace.index()].move(this._workArea);
    }

    removeWorkspace(workspaceId: number): void {
        this._workspaces.splice(workspaceId, 1);
    }

    addWorkspace(): void {
        this._workspaces.push(new WindowContainer(this._workArea));
    }

    hideTabBars(): void {
        for (const container of this._workspaces) {
            container.hideTabBar();
        }
    }

    showTabBars(): void {
        for (const container of this._workspaces) {
            container.showTabBar();
        }
    }

    itemDragged(item: WindowWrapper, x: number, y: number): void {
        this._workspaces[item.getWorkspace()].itemDragged(item, x, y);
    }
}
