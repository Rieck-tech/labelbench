import { describe, it, expect } from 'vitest';
import { batteryBars } from '../src/lib/battery.js';

describe('batteryBars', () => {
    it('matches the four lights on the printer for the levels the SDK reports', () => {
        // The SDK turns the printer's levels High, MediumAbove, Medium and Low into these.
        expect(batteryBars(100)).toEqual({ bars: 4, low: false });
        expect(batteryBars(75)).toEqual({ bars: 3, low: false });
        expect(batteryBars(50)).toEqual({ bars: 2, low: false });
        expect(batteryBars(11)).toEqual({ bars: 1, low: true });
    });

    it('shows at least one bar, marked low, for anything below Low', () => {
        expect(batteryBars(9)).toEqual({ bars: 1, low: true });
        expect(batteryBars(2)).toEqual({ bars: 1, low: true });
    });

    it('rounds real percentages up to the next bar, for printers that report them', () => {
        expect(batteryBars(60)).toEqual({ bars: 3, low: false });
        expect(batteryBars(26)).toEqual({ bars: 2, low: false });
        expect(batteryBars(20)).toEqual({ bars: 1, low: false });
    });

    it('is null when the battery is not known', () => {
        expect(batteryBars(null)).toBeNull();
        expect(batteryBars(undefined)).toBeNull();
    });
});
