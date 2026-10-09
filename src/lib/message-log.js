// A short history of the printer's messages. The printer often reports something for only a
// moment (a cut error, an open cover) before going back to normal, so keep what it said.
//
// `current` is the message showing right now ('' when all is well); `entries` are the
// messages seen, newest first, each recorded once when it appears.

const MAX_ENTRIES = 20;

export function emptyMessageLog() {
    return { current: '', entries: [] };
}

/** The log after the printer reports `text` ('' for no message) at `time`. */
export function updateMessageLog(log, text, time) {
    if (text === log.current) return log;
    const entries = text ? [{ text, time }, ...log.entries].slice(0, MAX_ENTRIES) : log.entries;
    return { current: text, entries };
}

export function clearMessageLog(log) {
    return { current: log.current, entries: [] };
}
