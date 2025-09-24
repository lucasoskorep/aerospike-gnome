import {WindowWrapper} from "./window.js";
import {Rect} from "../utils/rect.js";
import queueEvent from "../utils/events.js";
import {Logger} from "../utils/logger.js";
import Meta from "gi://Meta";
import Mtk from "@girs/mtk-17";

import WindowContainer from "./container.js";
import Window = Meta.Window;

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
        const workspaceCount = global.workspace_manager.get_n_workspaces()
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
            if (win) {
                return win;
            }
        }
        return undefined;
    }

    removeWindow(winWrap: WindowWrapper) {
        const windowId = winWrap.getWindowId();
        for (const container of this._workspaces) {
            const win = container.getWindow(windowId);
            if (win) {
                container.removeWindow(windowId);
            }
        }
    }

    addWindow(winWrap: WindowWrapper) {
        const window_workspace = winWrap.getWindow().get_workspace().index();
        this._workspaces[window_workspace].addWindow(winWrap);
    }

    tileWindows(): void {
        this._workArea = global.workspace_manager.get_active_workspace().get_work_area_for_monitor(this._id);
        const activeWorkspace = global.workspace_manager.get_active_workspace();
        this._workspaces[activeWorkspace.index()].move(this._workArea);
        this._workspaces[activeWorkspace.index()].tileWindows()
    }

    removeWorkspace(workspaceId: number): void {
        this._workspaces.splice(workspaceId, 1);
    }

    addWorkspace(): void {
        this._workspaces.push(new WindowContainer(this._workArea));
    }

    itemDragged(item: WindowWrapper, x: number, y: number): void {
        this._workspaces[item.getWorkspace()].itemDragged(item, x, y);
    }

}