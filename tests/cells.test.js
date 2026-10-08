import { describe, it, expect } from 'vitest';
import { cellToString, sheetToTable } from '../src/lib/cells.js';

describe('cellToString', () => {
    it('returns an empty string for empty cells', () => {
        expect(cellToString(null)).toBe('');
        expect(cellToString(undefined)).toBe('');
    });

    it('keeps text and turns numbers into text', () => {
        expect(cellToString('Skruer')).toBe('Skruer');
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
        expect(cellToString({ richText: [{ text: 'Kjøk' }, { text: 'ken' }] })).toBe('Kjøkken');
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
            ['Navn', 'Antall'],
            ['Skruer', 10],
            ['Plugger', 25],
        ];
        expect(sheetToTable(values)).toEqual({
            headers: ['Navn', 'Antall'],
            rows: [
                { Navn: 'Skruer', Antall: '10' },
                { Navn: 'Plugger', Antall: '25' },
            ],
        });
    });

    it('skips empty rows and names blank headers', () => {
        const values = [['Navn', null], ['Skruer', 'x'], [null, null], ['Plugger', 'y']];
        expect(sheetToTable(values)).toEqual({
            headers: ['Navn', 'Column 2'],
            rows: [
                { Navn: 'Skruer', 'Column 2': 'x' },
                { Navn: 'Plugger', 'Column 2': 'y' },
            ],
        });
    });
});
