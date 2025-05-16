import {WindowWrapper} from "./window.js";
import {Rect} from "./utils/rect.js";
import queueEvent from "./utils/events.js";
import {Logger} from "./utils/logger.js";
import Meta from "gi://Meta";
import Mtk from "@girs/mtk-16";

import WindowContainer from "./container.js";
import Window = Meta.Window;

export default class Monitor {

    _id: number;
    _workArea: Rect;
    // _activeWorkspace: number;
    // _workspaces: Map<number, WindowContainer>;

    constructor(monitorId: number) {
        this._id = monitorId;
        const workspace = global.workspace_manager.get_active_workspace();
        this._workArea = workspace.get_work_area_for_monitor(this._id);
        // this._activeWorkspace = workspace
        Logger.log("CREATING MONITOR", monitorId);
        const workspaces = global.workspace_manager.get_n_workspaces();
        Logger.log("WORKSPACE COUNT", workspaces);
        // this._rootContainer = new WindowContainer(monitorId, this._workArea, );
    }

    // removeAllWindows(): void {
    //     for (WindowContainer container of this._workspaces.values()) {}
    // }
}