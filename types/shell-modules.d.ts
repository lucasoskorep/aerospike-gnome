/**
 * Ambient declarations for the GNOME Shell JavaScript modules this extension
 * imports.
 *
 * Shell's JavaScript API has no `.gir`, so generated `@girs/*` types do not
 * cover it. Upstream maintains those types in `@girs/gnome-shell`, but its
 * GNOME 51 support (51.0.0-alpha.1) is unpublished on npm, and v50 depends on
 * St-18/Meta-18 types that conflict with the -51 packages this project uses.
 * Only the symbols actually imported here are declared; extend as needed.
 *
 * @see https://gitlab.gnome.org/GNOME/gnome-shell/-/tree/main/js/ui
 */

declare module "resource:///org/gnome/shell/extensions/extension.js" {
    import type Gio from "@girs/gio-2.0";

    /** Parsed contents of the extension's `metadata.json`. */
    export interface ExtensionMetadata {
        uuid: string;
        name: string;
        description: string;
        "shell-version"?: string[];
        "settings-schema"?: string;
        "gettext-domain"?: string;
        url?: string;
        [key: string]: unknown;
    }

    /**
     * Base class for an extension's `extension.js` default export.
     *
     * GNOME Shell 51 requires `disable()` to stay synchronous; returning a
     * promise now throws.
     */
    export class Extension {
        constructor(metadata: ExtensionMetadata);

        readonly metadata: ExtensionMetadata;
        readonly uuid: string;
        readonly path: string;

        /** Returns a {@link Gio.Settings} for the extension's schema. */
        getSettings(schema?: string | null, subdir?: string | null): Gio.Settings;

        /** Marks the extension's settings as translatable. */
        translateConfig(): void;

        /** Opens the extension's preferences dialog, if it has one. */
        openPreferences(): void;

        enable(): void;
        disable(): void;
    }
}

declare module "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js" {
    import type Gio from "@girs/gio-2.0";
    import type Adw from "@girs/adw-1";

    /** Marks a string for translation and returns the translation. */
    export function gettext(str: string): string;

    /** Pluralised form of {@link gettext}. */
    export function ngettext(fid: string, fidPlural: string, n: number): string;

    /** Context-sensitive form of {@link gettext}. */
    export function pgettext(context: string, str: string): string;

    /** Base class for an extension's `prefs.js` default export. */
    export class ExtensionPreferences {
        readonly metadata: Record<string, unknown>;
        readonly uuid: string;
        readonly path: string;

        /** Returns a {@link Gio.Settings} for the extension's schema. */
        getSettings(schema?: string | null, subdir?: string | null): Gio.Settings;

        /** Marks the extension's settings as translatable. */
        translateConfig(): void;

        /** Called by the shell to populate the preferences window. */
        fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> | void;
    }
}

declare module "resource:///org/gnome/shell/ui/main.js" {
    import type Gio from "@girs/gio-2.0";
    import type Meta from "@girs/meta-51";
    import type Shell from "@girs/shell-51";
    import type St from "@girs/st-51";

    /** Window management helpers exposed to extensions. */
    export interface ShellWM {
        /**
         * Registers a keybinding from an extension's schema and returns its id.
         */
        addKeybinding(
            name: string,
            settings: Gio.Settings,
            flags: Meta.KeyBindingFlags,
            mode: Shell.ActionMode,
            handler: () => void,
        ): number;

        /** Removes a keybinding previously added by this extension. */
        removeKeybinding(name: string): boolean;
    }

    /** The shell's layout manager. */
    export interface LayoutManager {
        /** Actor holding all non-window UI. */
        readonly uiGroup: St.Widget;
        /** Actor holding the window group. */
        readonly windowGroup: St.Widget;
        readonly panelBox: St.BoxLayout;
        readonly monitorManager: Meta.MonitorManager;
        readonly nMonitors: number;
    }

    /** The overview (window overview + search). */
    export interface Overview extends St.Widget {
        connect(signal: "showing" | "hiding" | "show-overview", callback: () => void): number;
    }

    export const wm: ShellWM;
    export const layoutManager: LayoutManager;
    export const overview: Overview;

    /** Shows a notification in the message tray. */
    export function notify(message: string): void;
}
