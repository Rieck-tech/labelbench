import { describe, it, expect } from 'vitest';
import { cellToString, sheetToTable } from '../src/lib/cells.js';

describe('cellToString', () => {
    it('returns an empty string for empty cells', () => {
        expect(cellToString(null)).toBe('');
        expect(cellToString(undefined)).toBe('');
    });

    it('keeps text and turns numbers into text', () => {
        expect(cellToString('Cables')).toBe('Cables');
        expect(cellToString(42)).toBe('42');
        expect(cellToString(0.5)).toBe('0.5');
    });

    it('formats dates as YYYY-MM-DD, and keeps the time when there is one', () => {
        expect(cellToString(new Date(Date.UTC(2026, 9, 8)))).toBe('2026-10-08');
        expect(cellToString(new Date(Date.UTC(2026, 9, 8, 14, 30)))).toBe('2026-10-08 14:30');
    });

    it('uses the result of formulas', () => {
        expect(cellToString({ formula: 'A1&B1', result: 'AB' })).toBe('AB');
    });

    it('joins rich text runs', () => {
        expect(cellToString({ richText: [{ text: 'Swi' }, { text: 'tch' }] })).toBe('Switch');
    });

    it('uses the visible text of hyperlinks', () => {
        expect(cellToString({ text: 'Nettside', hyperlink: 'https://example.com' })).toBe('Nettside');
    });

    it('shows errors as their error code', () => {
        expect(cellToString({ error: '#N/A' })).toBe('#N/A');
    });
});

describe('sheetToTable', () => {
    it('uses the first non-empty row as headers', () => {
        const values = [
            [],
            ['Name', 'Qty'],
            ['Cables', 10],
            ['Adapters', 25],
        ];
        expect(sheetToTable(values)).toEqual({
            headers: ['Name', 'Qty'],
            rows: [
                { Name: 'Cables', Qty: '10' },
                { Name: 'Adapters', Qty: '25' },
            ],
        });
    });

    it('skips empty rows and names blank headers', () => {
        const values = [['Name', null], ['Cables', 'x'], [null, null], ['Adapters', 'y']];
        expect(sheetToTable(values)).toEqual({
            headers: ['Name', 'Column 2'],
            rows: [
                { Name: 'Cables', 'Column 2': 'x' },
                { Name: 'Adapters', 'Column 2': 'y' },
            ],
        });
    });
});
