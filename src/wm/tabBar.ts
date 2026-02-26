import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Logger} from "../utils/logger.js";
import {WindowWrapper} from "./window.js";
import {Rect} from "../utils/rect.js";

export const TAB_BAR_HEIGHT = 24;

type TabClickedCallback = (index: number) => void;

export class TabBar {
    private _bar: St.BoxLayout;
    private _buttons: St.Button[] = [];
    private _activeIndex: number = 0;
    private _onTabClicked: TabClickedCallback;
    private _visible: boolean = false;

    constructor(onTabClicked: TabClickedCallback) {
        this._onTabClicked = onTabClicked;
        this._bar = new St.BoxLayout({
            style_class: 'aerospike-tab-bar',
            vertical: false,
            reactive: true,
            can_focus: false,
            track_hover: false,
        });
    }

    /**
     * Rebuild all tab buttons from the current list of window items.
     */
    rebuild(items: WindowWrapper[], activeIndex: number): void {
        // Remove old buttons
        this._bar.destroy_all_children();
        this._buttons = [];

        items.forEach((item, index) => {
            const button = new St.Button({
                style_class: 'aerospike-tab',
                reactive: true,
                can_focus: false,
                track_hover: true,
                x_expand: true,
                child: new St.Label({
                    text: item.getTabLabel(),
                    style_class: 'aerospike-tab-label',
                    y_align: Clutter.ActorAlign.CENTER,
                    x_align: Clutter.ActorAlign.CENTER,
                    x_expand: true,
                }),
            });

            button.connect('clicked', () => {
                this._onTabClicked(index);
            });

            this._bar.add_child(button);
            this._buttons.push(button);
        });

        this.setActive(activeIndex);
    }

    /**
     * Update just the title text of a single tab (e.g. when a window title changes).
     */
    updateTabTitle(index: number, title: string): void {
        if (index < 0 || index >= this._buttons.length) return;
        const label = this._buttons[index].get_child() as St.Label;
        if (label) label.set_text(title);
    }

    /**
     * Highlight the active tab and dim the rest.
     */
    setActive(index: number): void {
        this._activeIndex = index;
        this._buttons.forEach((btn, i) => {
            if (i === index) {
                btn.add_style_class_name('aerospike-tab-active');
            } else {
                btn.remove_style_class_name('aerospike-tab-active');
            }
        });
    }

    /**
     * Position and size the tab bar at the given screen rect.
     */
    setPosition(rect: Rect): void {
        this._bar.set_position(rect.x, rect.y);
        this._bar.set_size(rect.width, rect.height);
    }

    show(): void {
        if (this._visible) return;
        this._visible = true;
        Main.layoutManager.uiGroup.add_child(this._bar);
        this._bar.show();
        Logger.log("TabBar shown");
    }

    hide(): void {
        if (!this._visible) return;
        this._visible = false;
        this._bar.hide();
        if (this._bar.get_parent()) {
            Main.layoutManager.uiGroup.remove_child(this._bar);
        }
        Logger.log("TabBar hidden");
    }

    destroy(): void {
        this.hide();
        this._bar.destroy_all_children();
        this._buttons = [];
        this._bar.destroy();
        Logger.log("TabBar destroyed");
    }

    isVisible(): boolean {
        return this._visible;
    }
}
