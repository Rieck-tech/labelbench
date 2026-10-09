/**
 * Whether printing over Bluetooth can work here:
 *   'ok'           ready to connect
 *   'unsupported'  this browser (or an insecure page) has no Web Bluetooth
 *   'off'          the browser could, but Bluetooth is turned off or the computer has none
 */
export function bluetoothStatus({ secure, hasApi, available }) {
    if (!secure || !hasApi) return 'unsupported';
    return available ? 'ok' : 'off';
}
