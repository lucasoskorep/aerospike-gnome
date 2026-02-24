import GLib from "gi://GLib";


export type QueuedEvent = {
    name: string;
    callback: () => void;
}

// Pending events indexed by name so that duplicate events collapse into one.
// Only the most-recently-queued callback for a given name is kept.
const pendingEvents: Map<string, QueuedEvent> = new Map();

export default function queueEvent(event: QueuedEvent, interval = 200) {
    // Overwrite any earlier pending event with the same name — the latest
    // callback is always the most up-to-date one.
    pendingEvents.set(event.name, event);

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
        const e = pendingEvents.get(event.name);
        if (e && e === event) {
            // Only fire if this is still the current callback for this name
            // (a newer call may have replaced it).
            pendingEvents.delete(event.name);
            e.callback();
        }
        return GLib.SOURCE_REMOVE;
    });
}
