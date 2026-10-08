/**
 * A small CSV parser that understands what spreadsheet programs actually export:
 * comma, semicolon or tab separators, quoted fields, CRLF line endings and a BOM.
 */

const CANDIDATES = [',', ';', '\t', '|'];

/** Guess the separator by counting candidates (outside quotes) in the first few lines. */
export function detectDelimiter(text) {
    const sample = text.slice(0, 10000);
    const counts = Object.fromEntries(CANDIDATES.map((c) => [c, 0]));
    let inQuotes = false;
    let lines = 0;

    for (const char of sample) {
        if (char === '"') inQuotes = !inQuotes;
        else if (!inQuotes && char === '\n' && ++lines >= 5) break;
        else if (!inQuotes && char in counts) counts[char]++;
    }

    let best = ',';
    for (const c of CANDIDATES) if (counts[c] > counts[best]) best = c;
    return best;
}

/** Split CSV text into an array of rows, each an array of cell strings. */
function splitRecords(text, delimiter) {
    const records = [];
    let record = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (inQuotes) {
            if (char === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                field += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === delimiter) {
            record.push(field);
            field = '';
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n') i++;
            record.push(field);
            records.push(record);
            record = [];
            field = '';
        } else {
            field += char;
        }
    }

    if (field !== '' || record.length > 0) {
        record.push(field);
        records.push(record);
    }
    return records;
}

/** Trim header names, and give blank or repeated ones a unique name. */
export function cleanHeaders(rawHeaders) {
    const seen = new Map();
    return rawHeaders.map((raw, index) => {
        let name = String(raw ?? '').trim() || `Column ${index + 1}`;
        const count = seen.get(name) ?? 0;
        seen.set(name, count + 1);
        if (count > 0) name = `${name} (${count + 1})`;
        return name;
    });
}

/** Turn arrays of cells into objects keyed by header, dropping empty rows. */
export function recordsToRows(headers, records) {
    return records
        .filter((cells) => cells.some((cell) => String(cell).trim() !== ''))
        .map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])));
}

/** Parse CSV text into { headers, rows }, where each row is an object keyed by header. */
export function parseCsv(text) {
    const clean = text.replace(/^﻿/, '');
    if (clean.trim() === '') return { headers: [], rows: [] };

    const records = splitRecords(clean, detectDelimiter(clean));
    const headerIndex = records.findIndex((cells) => cells.some((c) => c.trim() !== ''));
    const headers = cleanHeaders(records[headerIndex]);
    return { headers, rows: recordsToRows(headers, records.slice(headerIndex + 1)) };
}
