/**
 * The text of a label line is a list of parts, in order. Each part is either
 * fixed text, { text: 'Shelf ' }, or a column from the data file, { column: 'Shelf' }.
 * Storing them separately means any column name works, whatever characters it has.
 */

const isText = (part) => part && typeof part.text === 'string';
const isColumn = (part) => part && typeof part.column === 'string' && part.column !== '';

/** Put the row's values into the parts and return the resulting text. */
export function fillParts(parts, row) {
    return (parts ?? []).map((part) => (isColumn(part) ? String(row?.[part.column] ?? '') : isText(part) ? part.text : '')).join('');
}

/** The columns the parts use, each listed once. */
export function columnsIn(parts) {
    return [...new Set((parts ?? []).filter(isColumn).map((part) => part.column))];
}

/** Tidy a list of parts: merge neighbouring text and drop empty or unknown parts. */
export function normalizeParts(parts) {
    const result = [];
    for (const part of parts ?? []) {
        if (isColumn(part)) {
            result.push({ column: part.column });
        } else if (isText(part) && part.text !== '') {
            const last = result[result.length - 1];
            if (last && 'text' in last) last.text += part.text;
            else result.push({ text: part.text });
        }
    }
    return result;
}
