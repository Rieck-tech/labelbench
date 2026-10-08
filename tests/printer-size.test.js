import { describe, it, expect } from 'vitest';
import { labelSizeFromPrinter, sameSize } from '../src/lib/printer-size.js';

// What Brady's SDK reports for an M4-91 self-laminating cartridge:
// the whole label is 1 × 1.5 in, but only a 1 × 0.5 in zone at the top is printable.
// Zone sizes come from Brady's parts database, in 1/10 000 inch.
const selfLaminating = {
    supplyName: 'M4-91-427',
    supplyDimensions: '1 x 1.5',
    zoneDimensions: [
        { ID: '', Name: '', Type: 'Printable', Width: '10000', Height: '5000', OffsetX: '0', OffsetY: '0', Rotation: '' },
    ],
};

describe('labelSizeFromPrinter', () => {
    it('uses the printable zone, not the whole label', () => {
        expect(labelSizeFromPrinter(selfLaminating)).toEqual({
            widthMm: 25.4,
            heightMm: 12.7,
            source: 'printable area',
        });
    });

    it('puts the longer side as the length', () => {
        const printer = { zoneDimensions: [{ Type: 'Printable', Width: '5000', Height: '20000' }] };
        expect(labelSizeFromPrinter(printer)).toMatchObject({ widthMm: 50.8, heightMm: 12.7 });
    });

    it('skips zones that are not printable', () => {
        const printer = {
            zoneDimensions: [
                { Type: 'SelfLaminated', Width: '10000', Height: '10000' },
                { Type: 'Printable', Width: '10000', Height: '5000' },
            ],
        };
        expect(labelSizeFromPrinter(printer)).toMatchObject({ widthMm: 25.4, heightMm: 12.7 });
    });

    it('accepts numeric zone sizes, as decoded straight from the printer', () => {
        const printer = { zoneDimensions: [{ Type: 'Printable', Width: 15000, Height: 10000 }] };
        expect(labelSizeFromPrinter(printer)).toMatchObject({ widthMm: 38.1, heightMm: 25.4 });
    });

    it('falls back to the whole label, in inches, when there is no printable zone', () => {
        const printer = { supplyDimensions: '1.5 x 1', zoneDimensions: [] };
        expect(labelSizeFromPrinter(printer)).toEqual({ widthMm: 38.1, heightMm: 25.4, source: 'label' });
    });

    it('gives only the height for continuous tape, which has no fixed length', () => {
        const printer = { supplyDimensions: '1.5 x 0', zoneDimensions: [] };
        expect(labelSizeFromPrinter(printer)).toEqual({ widthMm: null, heightMm: 38.1, source: 'tape width' });
    });

    it('returns null when the printer reports nothing usable', () => {
        expect(labelSizeFromPrinter({})).toBeNull();
        expect(labelSizeFromPrinter({ supplyDimensions: '', zoneDimensions: [] })).toBeNull();
        expect(labelSizeFromPrinter(null)).toBeNull();
    });
});

describe('sameSize', () => {
    it('treats sizes within a tenth of a millimetre as the same', () => {
        expect(sameSize({ widthMm: 25.4, heightMm: 12.7 }, { widthMm: 25.45, heightMm: 12.7 })).toBe(true);
        expect(sameSize({ widthMm: 25.4, heightMm: 12.7 }, { widthMm: 38.1, heightMm: 25.4 })).toBe(false);
    });

    it('only compares the height when the printer has no length', () => {
        expect(sameSize({ widthMm: 80, heightMm: 38.1 }, { widthMm: null, heightMm: 38.1 })).toBe(true);
    });
});
