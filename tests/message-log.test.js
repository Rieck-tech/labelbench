import { describe, it, expect } from 'vitest';
import { emptyMessageLog, updateMessageLog, clearMessageLog } from '../src/lib/message-log.js';

const at = (minute) => new Date(Date.UTC(2026, 9, 9, 15, minute));

describe('message log', () => {
    it('starts empty', () => {
        expect(emptyMessageLog()).toEqual({ current: '', entries: [] });
    });

    it('records a new message once, however many updates repeat it', () => {
        let log = emptyMessageLog();
        log = updateMessageLog(log, 'Cover open.', at(1));
        log = updateMessageLog(log, 'Cover open.', at(2));
        expect(log.current).toBe('Cover open.');
        expect(log.entries).toEqual([{ text: 'Cover open.', time: at(1) }]);
    });

    it('keeps the message after the printer clears it', () => {
        let log = updateMessageLog(emptyMessageLog(), 'Cover open.', at(1));
        log = updateMessageLog(log, '', at(2));
        expect(log.current).toBe('');
        expect(log.entries).toHaveLength(1);
    });

    it('records the same message again when it comes back later, newest first', () => {
        let log = updateMessageLog(emptyMessageLog(), 'Cover open.', at(1));
        log = updateMessageLog(log, '', at(2));
        log = updateMessageLog(log, 'Out of labels.', at(3));
        log = updateMessageLog(log, 'Cover open.', at(4));
        expect(log.entries.map((e) => e.text)).toEqual(['Cover open.', 'Out of labels.', 'Cover open.']);
    });

    it('keeps the 20 most recent messages', () => {
        let log = emptyMessageLog();
        for (let i = 0; i < 25; i++) log = updateMessageLog(log, `Message ${i}.`, at(i));
        expect(log.entries).toHaveLength(20);
        expect(log.entries[0].text).toBe('Message 24.');
    });

    it('clears the history but remembers what is showing now', () => {
        let log = updateMessageLog(emptyMessageLog(), 'Cover open.', at(1));
        log = clearMessageLog(log);
        expect(log).toEqual({ current: 'Cover open.', entries: [] });
        // ...so the same, still-active message isn't recorded again on the next update.
        expect(updateMessageLog(log, 'Cover open.', at(2)).entries).toEqual([]);
    });
});
