import GLib from "gi://GLib";

export type QueuedEvent = {
    name: string;
    callback: () => void;
}

const pendingEvents: Map<string, QueuedEvent> = new Map();

export default function queueEvent(event: QueuedEvent, interval = 200) {
    pendingEvents.set(event.name, event);

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
        const e = pendingEvents.get(event.name);
        if (e && e === event) {
            pendingEvents.delete(event.name);
            e.callback();
        }
        return GLib.SOURCE_REMOVE;
    });
}
