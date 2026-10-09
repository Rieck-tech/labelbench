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

/** Turn Electron's device list into sorted, unique { id, name } choices. */
export function toChoices(devices) {
    const byId = new Map();
    for (const device of devices) {
        if (!byId.has(device.deviceId)) {
            byId.set(device.deviceId, { id: device.deviceId, name: device.deviceName || 'Unnamed printer' });
        }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function createBluetoothChooser(view) {
    let pending = null;
    let choices = [];

    function finish(id) {
        const callback = pending;
        pending = null;
        choices = [];
        view.close();
        callback(id);
    }

    return {
        isOpen: () => pending !== null,

        /** Called for every 'select-bluetooth-device' event. */
        request(devices, callback) {
            const wasOpen = pending !== null;
            pending = callback;
            choices = toChoices(devices);
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
