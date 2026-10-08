/**
 * ExcelJS stores a row's values with a leading empty slot (Excel columns start at 1).
 * This returns plain arrays of cell values, one per row, without that slot,
 * keeping empty rows so row numbers line up with Excel.
 */
export function worksheetValues(worksheet) {
    const values = [];
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        const cells = Array.isArray(row.values) ? row.values.slice(1) : [];
        values[rowNumber - 1] = Array.from(cells, (cell) => cell ?? null);
    });
    return Array.from(values, (cells) => cells ?? []);
}

/** Read an .xlsx file (as an ArrayBuffer) using the ExcelJS browser build on window.ExcelJS. */
export async function readXlsx(buffer, ExcelJS = globalThis.ExcelJS) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    const sheet = book.worksheets.find((ws) => ws.actualRowCount > 0) ?? book.worksheets[0];
    return { sheetName: sheet?.name ?? '', values: sheet ? worksheetValues(sheet) : [] };
}
