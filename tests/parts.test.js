import { describe, it, expect } from 'vitest';
import { fillParts, columnsIn, normalizeParts } from '../src/lib/parts.js';

const row = { Shelf: 'B', Room: 'Bod', 'Antall {stk}': '10' };

describe('fillParts', () => {
    it('joins fixed text and column values in order', () => {
        const parts = [{ text: 'Shelf ' }, { column: 'Shelf' }, { text: ' – ' }, { column: 'Room' }];
        expect(fillParts(parts, row)).toBe('Shelf B – Bod');
    });

    it('handles any column name, including braces and pipes', () => {
        expect(fillParts([{ column: 'Antall {stk}' }, { text: ' stk' }], row)).toBe('10 stk');
    });

    it('uses the same column more than once', () => {
        expect(fillParts([{ column: 'Room' }, { text: '/' }, { column: 'Room' }], row)).toBe('Bod/Bod');
    });

    it('fills missing columns with nothing', () => {
        expect(fillParts([{ text: '[' }, { column: 'Nope' }, { text: ']' }], row)).toBe('[]');
    });

    it('treats a missing list as empty', () => {
        expect(fillParts(undefined, row)).toBe('');
    });
});

describe('columnsIn', () => {
    it('lists the columns used, once each, in order', () => {
        const parts = [{ column: 'Room' }, { text: ' ' }, { column: 'Shelf' }, { column: 'Room' }];
        expect(columnsIn(parts)).toEqual(['Room', 'Shelf']);
    });
});

describe('normalizeParts', () => {
    it('merges neighbouring text and drops empty text', () => {
        const parts = [{ text: 'Sh' }, { text: 'elf ' }, { text: '' }, { column: 'Shelf' }, { text: '' }];
        expect(normalizeParts(parts)).toEqual([{ text: 'Shelf ' }, { column: 'Shelf' }]);
    });

    it('drops anything that is neither text nor a column', () => {
        expect(normalizeParts([{ column: '' }, { foo: 1 }, null, { text: 'x' }])).toEqual([{ text: 'x' }]);
    });
});
