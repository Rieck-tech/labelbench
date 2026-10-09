// What happened when the person tried to connect a printer.
//
// Brady's SDK doesn't tell a closed picker apart from a failure: both come back as a
// "connection error" text. A closed picker reads "NotFoundError: User cancelled the
// requestDevice() chooser". In the desktop app, Electron gives the same answer at once when
// Bluetooth is off or the app isn't allowed to use it, before any picker could appear.

// Faster than anyone could open the picker, read it and close it again.
const INSTANT_MS = 1000;

const CANCELLED = /NotFoundError|cancell?ed the requestDevice/i;

/**
 * 'connected', 'cancelled' (closed the picker; say nothing), 'unavailable' (the desktop app
 * couldn't use Bluetooth) or 'failed'.
 */
export function connectionOutcome({ connected, problem, elapsedMs, desktop }) {
    if (connected) return 'connected';
    if (problem && CANCELLED.test(problem)) {
        return desktop && elapsedMs < INSTANT_MS ? 'unavailable' : 'cancelled';
    }
    return 'failed';
}
