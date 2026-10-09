import { describe, it, expect } from 'vitest';
import { bluetoothStatus } from '../src/lib/bluetooth-status.js';

describe('bluetoothStatus', () => {
    it('is ok when the page is secure and Bluetooth is available', () => {
        expect(bluetoothStatus({ secure: true, hasApi: true, available: true })).toBe('ok');
    });

    it('is unsupported when the browser has no Web Bluetooth (Safari, Firefox)', () => {
        expect(bluetoothStatus({ secure: true, hasApi: false, available: false })).toBe('unsupported');
    });

    it('is unsupported on a page that is not secure, since the API is hidden there', () => {
        expect(bluetoothStatus({ secure: false, hasApi: true, available: true })).toBe('unsupported');
    });

    it('is off when the browser could use Bluetooth but the computer has it off or has none', () => {
        expect(bluetoothStatus({ secure: true, hasApi: true, available: false })).toBe('off');
    });
});
