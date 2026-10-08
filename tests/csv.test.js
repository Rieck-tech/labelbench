import { describe, it, expect } from 'vitest';
import { parseCsv, detectDelimiter } from '../src/lib/csv.js';

describe('detectDelimiter', () => {
    it('picks comma for comma-separated data', () => {
        expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    });

    it('picks semicolon, which Norwegian Excel uses', () => {
        expect(detectDelimiter('navn;antall\nSkruer;10')).toBe(';');
    });

    it('picks tab for tab-separated data', () => {
        expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    });

    it('ignores delimiters inside quotes', () => {
        expect(detectDelimiter('"a,b,c";d\n"1,2,3";4')).toBe(';');
    });
});

describe('parseCsv', () => {
    it('returns headers and rows as objects keyed by header', () => {
        const result = parseCsv('id,title\n1,Kjøkken\n2,Bod');
        expect(result.headers).toEqual(['id', 'title']);
        expect(result.rows).toEqual([
            { id: '1', title: 'Kjøkken' },
            { id: '2', title: 'Bod' },
        ]);
    });

    it('handles quoted fields with commas, quotes and newlines', () => {
        const result = parseCsv('a,b\n"Kabler, ladere","Han sa ""hei""\nogså"');
        expect(result.rows[0]).toEqual({ a: 'Kabler, ladere', b: 'Han sa "hei"\nogså' });
    });

    it('handles CRLF line endings and a UTF-8 BOM', () => {
        const result = parseCsv('﻿id;navn\r\n1;Skuff\r\n');
        expect(result.headers).toEqual(['id', 'navn']);
        expect(result.rows).toEqual([{ id: '1', navn: 'Skuff' }]);
    });

    it('skips completely empty lines', () => {
        const result = parseCsv('a,b\n1,2\n\n,\n3,4\n');
        expect(result.rows).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }]);
    });

    it('trims header names and fills in blank or duplicate ones', () => {
        const result = parseCsv(' navn ,,navn\nx,y,z');
        expect(result.headers).toEqual(['navn', 'Column 2', 'navn (2)']);
        expect(result.rows[0]).toEqual({ navn: 'x', 'Column 2': 'y', 'navn (2)': 'z' });
    });

    it('fills missing trailing cells with empty strings', () => {
        const result = parseCsv('a,b,c\n1');
        expect(result.rows[0]).toEqual({ a: '1', b: '', c: '' });
    });

    it('parses the sample file used in the README', () => {
        const text = 'id,title,subtitle\n6,Garasje – Kasse 2,"Kabler, ladere og adaptere"';
        expect(parseCsv(text).rows[0].subtitle).toBe('Kabler, ladere og adaptere');
    });

    it('returns no headers and no rows for empty input', () => {
        expect(parseCsv('')).toEqual({ headers: [], rows: [] });
    });
});
