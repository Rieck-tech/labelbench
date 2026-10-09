import { describe, it, expect } from 'vitest';
import { connectionOutcome } from '../src/lib/connection.js';

describe('connectionOutcome', () => {
    it('is connected when the printer connected', () => {
        expect(connectionOutcome({ connected: true, problem: null, elapsedMs: 9000, desktop: true })).toBe('connected');
    });

    it('is a quiet cancel when the person closed the picker', () => {
        // Brady's SDK reports a cancelled picker as a connection error, in this exact wording.
        const problem = 'Connection to your printer failed. NotFoundError: User cancelled the requestDevice() chooser.';
        expect(connectionOutcome({ connected: false, problem, elapsedMs: 8000, desktop: true })).toBe('cancelled');
        expect(connectionOutcome({ connected: false, problem, elapsedMs: 300, desktop: false })).toBe('cancelled');
    });

    it('means Bluetooth is unavailable when the desktop app cancels at once, before anyone could choose', () => {
        // Electron cancels straight away when Bluetooth is off or the app may not use it.
        const problem = 'Connection to your printer failed. NotFoundError: User cancelled the requestDevice() chooser.';
        expect(connectionOutcome({ connected: false, problem, elapsedMs: 120, desktop: true })).toBe('unavailable');
    });

    it('is a failure for any other problem', () => {
        const problem = 'Connection to M511-PGM0001 failed. NetworkError: GATT Server is disconnected.';
        expect(connectionOutcome({ connected: false, problem, elapsedMs: 120, desktop: true })).toBe('failed');
        expect(connectionOutcome({ connected: false, problem: null, elapsedMs: 5000, desktop: false })).toBe('failed');
    });
});
