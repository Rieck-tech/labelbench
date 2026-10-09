// Keeps track of one Bluetooth device request in the desktop app.
//
// A web page asks for a printer with navigator.bluetooth.requestDevice(). Chrome shows its
// own picker for that, but Electron doesn't: it fires 'select-bluetooth-device' again and
// again while it scans, each time with the full list so far and a callback. The app has to
// show its own picker and answer the latest callback exactly once, with the chosen device id,
// or with '' to cancel.
//
// This module holds that state and nothing else, so it can be tested without Electron.
// `view` draws the picker: show(choices), update(choices), close().

/**
 * Turn Electron's device list into sorted, unique { id, name } choices.
 *
 * Brady printer names include the serial number, so one name is one printer. A printer that
 * changes its Bluetooth address appears again under a new id, and the old entry is stale.
 * Of entries with the same name, keep the one seen most recently: `firstSeen` maps each id to
 * when it first appeared (higher is newer); without it, later in the list counts as newer.
 */
export function toChoices(devices, firstSeen = new Map()) {
    const byKey = new Map();
    devices.forEach((device, index) => {
        const id = device.deviceId;
        const name = device.deviceName || '';
        const key = name ? `name:${name}` : `id:${id}`;
        const age = firstSeen.get(id) ?? index;
        const current = byKey.get(key);
        if (current && current.id === id) return;
        if (!current || age > current.age) byKey.set(key, { id, name: name || 'Unnamed printer', age });
    });
    return [...byKey.values()]
        .map(({ id, name }) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function createBluetoothChooser(view) {
    let pending = null;
    let choices = [];
    // When each device id was first reported, to tell a printer's new address from its old one.
    let firstSeen = new Map();

    function finish(id) {
        const callback = pending;
        pending = null;
        choices = [];
        firstSeen = new Map();
        view.close();
        callback(id);
    }

    return {
        isOpen: () => pending !== null,

        /** Called for every 'select-bluetooth-device' event. */
        request(devices, callback) {
            const wasOpen = pending !== null;
            pending = callback;
            for (const device of devices) {
                if (!firstSeen.has(device.deviceId)) firstSeen.set(device.deviceId, firstSeen.size);
            }
            choices = toChoices(devices, firstSeen);
            if (wasOpen) view.update(choices);
            else view.show(choices);
        },

        choose(id) {
            if (pending && choices.some((choice) => choice.id === id)) finish(id);
        },

        cancel() {
            if (pending) finish('');
        },
    };
}
