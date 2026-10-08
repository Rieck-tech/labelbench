import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { sheetToTable } from '../src/lib/cells.js';
import { worksheetValues } from '../src/lib/xlsx.js';

describe('reading a real .xlsx file', () => {
    it('reads headers, text, numbers, dates and formulas from the first sheet', async () => {
        const book = new ExcelJS.Workbook();
        const sheet = book.addWorksheet('Etiketter');
        sheet.addRow(['Navn', 'Antall', 'Dato', 'Kode']);
        sheet.addRow(['Skøyter', 2, new Date(Date.UTC(2026, 9, 8)), { formula: '"LBL-"&B2', result: 'LBL-2' }]);
        const buffer = await book.xlsx.writeBuffer();

        const readBack = new ExcelJS.Workbook();
        await readBack.xlsx.load(buffer);
        const table = sheetToTable(worksheetValues(readBack.worksheets[0]));

        expect(table).toEqual({
            headers: ['Navn', 'Antall', 'Dato', 'Kode'],
            rows: [{ Navn: 'Skøyter', Antall: '2', Dato: '2026-10-08', Kode: 'LBL-2' }],
        });
    });
});
