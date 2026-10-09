// A thin wrapper around Brady's Web SDK, so the rest of the app doesn't need to
// know its details. The SDK talks to the printer over Bluetooth Low Energy.
//
// About async: most SDK calls return a Promise, because talking to the printer takes
// time. `await` simply waits for the answer before going on to the next line.

import BradySdk from 'brady-web-sdk';
import { bluetoothStatus } from './lib/bluetooth-status.js';

const OWNERSHIP_KEY = 'labelbench:printer-id';

function loadId() {
    try {
        return localStorage.getItem(OWNERSHIP_KEY);
    } catch {
        return null;
    }
}

function saveId(id) {
    try {
        if (id) localStorage.setItem(OWNERSHIP_KEY, id);
    } catch {
        // Not being able to remember the printer is fine; it just asks again next time.
    }
}

/**
 * Create the printer connection. `onChange` is called with a fresh status snapshot
 * whenever the printer reports something new (battery, cartridge, errors, ...).
 */
export function createPrinter(onChange) {
    // The second argument turns off Brady's analytics, which would need the internet.
    const sdk = new BradySdk(() => onChange(snapshot()), false);

    function snapshot() {
        const connected = sdk.isConnected();
        return {
            connected,
            name: connected ? sdk.printerName : null,
            model: connected ? sdk.printerModel : null,
            supplyName: connected ? sdk.supplyName : null,
            supplyRemaining: connected ? sdk.supplyRemainingPercentage : null,
            supplyDimensions: connected ? sdk.supplyDimensions : null,
            zoneDimensions: connected ? sdk.zoneDimensions : null,
            dieCut: connected ? sdk.mediaIsDieCut : null,
            dpi: (connected && sdk.dotsPerInch) || 300,
            // The SDK says 0 % until the printer first reports its battery, so 0 means "not known yet".
            battery: connected && sdk.batteryLevelPercentage > 0 ? sdk.batteryLevelPercentage : null,
            charging: connected ? sdk.isAcConnected : null,
            messageTitle: connected ? sdk.messageTitle : null,
            message: connected ? sdk.message : null,
            messageRemedy: connected ? sdk.messageRemedy : null,
        };
    }

    return {
        snapshot,

        /** 'ok', 'unsupported' (no Web Bluetooth in this browser) or 'off' (no Bluetooth on the computer). */
        async bluetoothStatus() {
            const hasApi = Boolean(navigator.bluetooth);
            let available = false;
            if (window.isSecureContext && hasApi) {
                try {
                    available = await sdk.isSupportedBrowser();
                } catch {
                    available = false;
                }
            }
            return bluetoothStatus({ secure: window.isSecureContext, hasApi, available });
        },

        /** Show the browser's Bluetooth picker and connect to the chosen printer. */
        async connect() {
            const id = await sdk.showDiscoveredBleDevices(loadId());
            if (id && typeof id === 'string') saveId(id);
            const connected = sdk.isConnected();
            onChange(snapshot());
            return connected ? null : sdk.getConnectionErrorMessage() || 'The printer did not connect.';
        },

        async disconnect() {
            await sdk.disconnect();
            onChange(snapshot());
        },

        feed: () => sdk.feed(),
        cut: () => sdk.cut(),

        /**
         * Print a list of <img> elements as one print job.
         * Returns true when the printer accepted the job.
         */
        async printImages(images, { cutOption }) {
            sdk.setCopies(1);
            sdk.setCollate(false);
            sdk.setCutOption(cutOption);
            return await sdk.printBitmaps(images);
        },
    };
}
