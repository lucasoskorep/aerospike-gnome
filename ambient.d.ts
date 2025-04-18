import "@girs/gjs";
import "@girs/gjs/dom";
import "@girs/gnome-shell/ambient";
import "@girs/gnome-shell/extensions/global";

// Extend Meta.Window with our custom property
declare namespace Meta {
    interface Window {
        _aerospikeData?: any;
    }
}
