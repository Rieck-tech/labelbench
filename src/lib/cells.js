import { cleanHeaders, recordsToRows } from './csv.js';

const pad = (n) => String(n).padStart(2, '0');

/**
 * Turn an Excel cell value (as ExcelJS returns it) into the text shown on a label.
 * ExcelJS gives dates as UTC Date objects holding the time shown in Excel.
 */
export function cellToString(value) {
    if (value === null || value === undefined) return '';

    if (value instanceof Date) {
        const date = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
        const hasTime = value.getUTCHours() !== 0 || value.getUTCMinutes() !== 0;
        return hasTime ? `${date} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}` : date;
    }

    if (typeof value === 'object') {
        if ('result' in value) return cellToString(value.result);
        if (Array.isArray(value.richText)) return value.richText.map((run) => run.text).join('');
        if ('error' in value) return String(value.error);
        if ('text' in value) return cellToString(value.text);
        return '';
    }

    return String(value);
}

/**
 * Turn a sheet's rows of cell values into { headers, rows }.
 * The first row with any content is used as the header row.
 */
export function sheetToTable(values) {
    const records = values.map((cells) => (cells ?? []).map(cellToString));
    const headerIndex = records.findIndex((cells) => cells.some((c) => c.trim() !== ''));
    if (headerIndex === -1) return { headers: [], rows: [] };

    const width = Math.max(...records.map((cells) => cells.length));
    const headerCells = Array.from({ length: width }, (_, i) => records[headerIndex][i] ?? '');
    const headers = cleanHeaders(headerCells);
    return { headers, rows: recordsToRows(headers, records.slice(headerIndex + 1)) };
}
