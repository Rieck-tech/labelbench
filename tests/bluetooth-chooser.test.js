import { describe, it, expect, vi } from 'vitest';
import { createBluetoothChooser, toChoices } from '../electron/bluetooth-chooser.js';

function setup() {
    const view = { show: vi.fn(), update: vi.fn(), close: vi.fn() };
    const chooser = createBluetoothChooser(view);
    return { view, chooser };
}

describe('toChoices', () => {
    it('sorts by name, removes duplicates and names unnamed devices', () => {
        const devices = [
            { deviceId: 'b', deviceName: 'M511-PGM5112' },
            { deviceId: 'a', deviceName: 'M211-0001' },
            { deviceId: 'b', deviceName: 'M511-PGM5112' },
            { deviceId: 'c', deviceName: '' },
        ];
        expect(toChoices(devices)).toEqual([
            { id: 'a', name: 'M211-0001' },
            { id: 'b', name: 'M511-PGM5112' },
            { id: 'c', name: 'Unnamed printer' },
        ]);
    });
});

describe('createBluetoothChooser', () => {
    it('shows the picker on the first scan result and updates it on later ones', () => {
        const { view, chooser } = setup();
        chooser.request([], vi.fn());
        chooser.request([{ deviceId: 'a', deviceName: 'M511-1' }], vi.fn());

        expect(view.show).toHaveBeenCalledTimes(1);
        expect(view.show).toHaveBeenCalledWith([]);
        expect(view.update).toHaveBeenLastCalledWith([{ id: 'a', name: 'M511-1' }]);
        expect(chooser.isOpen()).toBe(true);
    });

    it('answers the latest callback once with the chosen device, then closes', () => {
        const { view, chooser } = setup();
        const first = vi.fn();
        const latest = vi.fn();
        chooser.request([{ deviceId: 'a', deviceName: 'M511-1' }], first);
        chooser.request([{ deviceId: 'a', deviceName: 'M511-1' }], latest);

        chooser.choose('a');
        chooser.choose('a');

        expect(first).not.toHaveBeenCalled();
        expect(latest).toHaveBeenCalledTimes(1);
        expect(latest).toHaveBeenCalledWith('a');
        expect(view.close).toHaveBeenCalledTimes(1);
        expect(chooser.isOpen()).toBe(false);
    });

    it('ignores a device that is not in the list', () => {
        const { chooser } = setup();
        const callback = vi.fn();
        chooser.request([{ deviceId: 'a', deviceName: 'M511-1' }], callback);

        chooser.choose('somewhere-else');

        expect(callback).not.toHaveBeenCalled();
        expect(chooser.isOpen()).toBe(true);
    });

    it('cancels with an empty id, which tells Chromium nothing was picked', () => {
        const { view, chooser } = setup();
        const callback = vi.fn();
        chooser.request([], callback);

        chooser.cancel();
        chooser.cancel();

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith('');
        expect(view.close).toHaveBeenCalledTimes(1);
    });

    it('opens again for the next connection attempt', () => {
        const { view, chooser } = setup();
        chooser.request([], vi.fn());
        chooser.cancel();
        chooser.request([], vi.fn());

        expect(view.show).toHaveBeenCalledTimes(2);
    });
});
