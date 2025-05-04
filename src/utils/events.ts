import GLib from "gi://GLib";


export type QueuedEvent = {
    name: string;
    callback: () => void;
}

const queuedEvents: QueuedEvent[] = [];

export default function queueEvent(event: QueuedEvent, interval = 200) {
    queuedEvents.push(event);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
        const e = queuedEvents.pop()
        if (e) {
            e.callback();
        }
        return queuedEvents.length !== 0;
    });
}