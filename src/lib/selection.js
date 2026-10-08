/**
 * Parse a row range like "1-3, 5, 8-" into sorted, zero-based row indexes.
 * Row numbers in the text are one-based, as shown in the table.
 */
export function parseRowRange(text, rowCount) {
    const picked = new Set();

    for (const part of String(text).split(',')) {
        const match = part.trim().match(/^(\d*)\s*([-–]?)\s*(\d*)$/);
        if (!match || (match[1] === '' && match[3] === '')) continue;

        const [, startText, dash, endText] = match;
        const start = startText ? Number(startText) : 1;
        const end = dash ? (endText ? Number(endText) : rowCount) : start;

        for (let n = Math.max(1, start); n <= Math.min(end, rowCount); n++) picked.add(n - 1);
    }

    return [...picked].sort((a, b) => a - b);
}

/** How many labels to print for a row. */
function copiesFor(row, { copies = 1, copiesColumn }) {
    if (!copiesColumn) return copies;
    const value = Number(String(row[copiesColumn] ?? '').replace(',', '.').trim());
    return Number.isFinite(value) && String(row[copiesColumn]).trim() !== '' ? Math.max(0, Math.floor(value)) : 1;
}

/**
 * Build the list of labels to print, in order.
 * Each item is { rowIndex, row }. With collate, copies are printed in rounds:
 * A, B, C, A, B, C instead of A, A, B, B, C, C.
 */
export function buildPrintQueue(rows, selectedIndexes, options = {}) {
    const items = selectedIndexes.map((rowIndex) => ({
        rowIndex,
        row: rows[rowIndex],
        count: copiesFor(rows[rowIndex], options),
    }));

    const queue = [];
    if (options.collate) {
        const rounds = Math.max(0, ...items.map((item) => item.count));
        for (let round = 0; round < rounds; round++) {
            for (const item of items) if (item.count > round) queue.push({ rowIndex: item.rowIndex, row: item.row });
        }
    } else {
        for (const item of items) {
            for (let i = 0; i < item.count; i++) queue.push({ rowIndex: item.rowIndex, row: item.row });
        }
    }
    return queue;
}

/** Split a list into batches of at most `size` items. */
export function chunk(list, size) {
    const batches = [];
    for (let i = 0; i < list.length; i += size) batches.push(list.slice(i, i + size));
    return batches;
}
