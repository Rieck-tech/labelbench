// Labelbench as a desktop app.
//
// The app is the same web page as `npm start` serves. Electron brings its own Chromium,
// so Bluetooth works without the user installing Chrome or Edge, and nothing else is
// needed on the computer. This file:
//   1. starts the local server from server.mjs (localhost counts as a secure page, which
//      Web Bluetooth needs),
//   2. opens the page in a window,
//   3. shows a printer picker when the page asks for a Bluetooth device, because Electron
//      has no built-in picker.

import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server.mjs';
import { createBluetoothChooser } from './bluetooth-chooser.js';

// A different port from `npm start` (5511), so both can run at once. Saved designs are kept
// per address, so the app always tries this port first and only moves if it is taken.
const DESKTOP_PORT = 5512;

const here = (file) => fileURLToPath(new URL(file, import.meta.url));

// Chromium on Linux only offers Web Bluetooth with this switch.
if (process.platform === 'linux') {
    app.commandLine.appendSwitch('enable-experimental-web-platform-features');
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    let mainWindow = null;

    app.on('second-instance', () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    });

    app.whenReady().then(async () => {
        let url;
        try {
            ({ url } = await startServer({ port: DESKTOP_PORT, fallback: true }));
        } catch (error) {
            dialog.showErrorBox('Labelbench could not start', error.message);
            app.quit();
            return;
        }

        lockDownSession();
        mainWindow = createMainWindow(url);
        mainWindow.on('closed', () => {
            mainWindow = null;
        });
    });

    // The server lives inside the app, so closing the window ends both.
    app.on('window-all-closed', () => app.quit());
}

function createMainWindow(url) {
    const window = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        title: 'Labelbench',
        backgroundColor: '#eef1f0',
        show: false,
        webPreferences: {
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });

    window.once('ready-to-show', () => window.show());
    keepInsideApp(window, url);
    handleBluetooth(window);
    window.loadURL(url);
    return window;
}

/** Links to other sites open in the normal browser; the window itself never leaves the app. */
function keepInsideApp(window, appUrl) {
    const isApp = (target) => target.startsWith(appUrl);
    const openOutside = (target) => {
        if (/^https?:\/\//.test(target)) shell.openExternal(target);
    };

    window.webContents.setWindowOpenHandler(({ url }) => {
        openOutside(url);
        return { action: 'deny' };
    });

    window.webContents.on('will-navigate', (event, target) => {
        if (isApp(target)) return;
        event.preventDefault();
        openOutside(target);
    });
}

/** The page needs no browser permissions (camera, location, notifications...), so refuse them all. */
function lockDownSession() {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

    // Some Bluetooth printers ask to be paired on Windows and Linux. Ask the user before agreeing.
    session.defaultSession.setBluetoothPairingHandler((details, callback) => {
        if (details.pairingKind === 'providePin') {
            dialog.showErrorBox(
                'Pairing needs a PIN',
                'This printer wants a PIN to pair. Pair it in your computer\'s Bluetooth settings first, then connect again.',
            );
            callback({ confirmed: false });
            return;
        }

        const pin = details.pairingKind === 'confirmPin' ? `\n\nCheck that the printer shows this PIN: ${details.pin}` : '';
        dialog
            .showMessageBox({
                type: 'question',
                buttons: ['Pair', 'Cancel'],
                defaultId: 0,
                cancelId: 1,
                message: 'Pair with this printer?',
                detail: `The printer asked to pair with this computer.${pin}`,
            })
            .then(({ response }) => callback({ confirmed: response === 0 }));
    });
}

function handleBluetooth(parent) {
    let picker = null;

    const chooser = createBluetoothChooser({
        show(choices) {
            const window = new BrowserWindow({
                parent,
                modal: true,
                width: 380,
                height: 420,
                resizable: false,
                minimizable: false,
                maximizable: false,
                title: 'Connect a printer',
                show: false,
                webPreferences: {
                    preload: here('./picker-preload.cjs'),
                    contextIsolation: true,
                    sandbox: true,
                    nodeIntegration: false,
                },
            });
            picker = window;
            window.setMenu(null);
            window.once('ready-to-show', () => window.show());
            // Closing the picker window counts as Cancel. The event can arrive late, so only
            // act if this is still the current picker and not one already finished.
            window.on('closed', () => {
                if (picker !== window) return;
                picker = null;
                chooser.cancel();
            });
            window.webContents.once('did-finish-load', () => {
                if (!window.isDestroyed()) window.webContents.send('picker:choices', choices);
            });
            window.loadFile(here('./picker.html'));
        },

        update(choices) {
            if (picker && !picker.isDestroyed() && !picker.webContents.isLoading()) {
                picker.webContents.send('picker:choices', choices);
            }
        },

        close() {
            const closing = picker;
            picker = null;
            closing?.destroy();
        },
    });

    // Fired repeatedly while Chromium scans, each time with every printer found so far.
    parent.webContents.on('select-bluetooth-device', (event, devices, callback) => {
        event.preventDefault();
        chooser.request(devices, callback);
    });

    const fromPicker = (event) => picker && event.sender === picker.webContents;
    ipcMain.on('picker:choose', (event, id) => {
        if (fromPicker(event)) chooser.choose(id);
    });
    ipcMain.on('picker:cancel', (event) => {
        if (fromPicker(event)) chooser.cancel();
    });
}
