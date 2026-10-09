import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { sheetToTable } from '../src/lib/cells.js';
import { worksheetValues } from '../src/lib/xlsx.js';

describe('reading a real .xlsx file', () => {
    it('reads headers, text, numbers, dates and formulas from the first sheet', async () => {
        const book = new ExcelJS.Workbook();
        const sheet = book.addWorksheet('Labels');
        sheet.addRow(['Name', 'Qty', 'Date', 'Code']);
        sheet.addRow(['Router', 2, new Date(Date.UTC(2026, 9, 8)), { formula: '"LBL-"&B2', result: 'LBL-2' }]);
        const buffer = await book.xlsx.writeBuffer();

        const readBack = new ExcelJS.Workbook();
        await readBack.xlsx.load(buffer);
        const table = sheetToTable(worksheetValues(readBack.worksheets[0]));

        expect(table).toEqual({
            headers: ['Name', 'Qty', 'Date', 'Code'],
            rows: [{ Name: 'Router', Qty: '2', Date: '2026-10-08', Code: 'LBL-2' }],
        });
    });
});
