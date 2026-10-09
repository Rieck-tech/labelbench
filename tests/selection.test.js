import { describe, it, expect } from 'vitest';
import { parseRowRange, buildPrintQueue, chunk } from '../src/lib/selection.js';

describe('parseRowRange', () => {
    it('turns "1-3, 5" into zero-based indexes', () => {
        expect(parseRowRange('1-3, 5', 10)).toEqual([0, 1, 2, 4]);
    });

    it('ignores rows beyond the end and sorts and removes duplicates', () => {
        expect(parseRowRange('8-12, 2, 2', 9)).toEqual([1, 7, 8]);
    });

    it('accepts an en dash and open-ended ranges', () => {
        expect(parseRowRange('3–', 5)).toEqual([2, 3, 4]);
        expect(parseRowRange('-2', 5)).toEqual([0, 1]);
    });

    it('returns nothing for garbage', () => {
        expect(parseRowRange('abc', 5)).toEqual([]);
    });
});

describe('buildPrintQueue', () => {
    const rows = [
        { name: 'A', qty: '2' },
        { name: 'B', qty: '0' },
        { name: 'C', qty: 'three' },
    ];

    it('prints each selected row the fixed number of times', () => {
        const queue = buildPrintQueue(rows, [0, 2], { copies: 2 });
        expect(queue.map((item) => item.row.name)).toEqual(['A', 'A', 'C', 'C']);
        expect(queue.map((item) => item.rowIndex)).toEqual([0, 0, 2, 2]);
    });

    it('can take the number of copies from a column, skipping zero', () => {
        const queue = buildPrintQueue(rows, [0, 1], { copiesColumn: 'qty' });
        expect(queue.map((item) => item.row.name)).toEqual(['A', 'A']);
    });

    it('falls back to one copy when the column value is not a number', () => {
        const queue = buildPrintQueue(rows, [2], { copiesColumn: 'qty' });
        expect(queue).toHaveLength(1);
    });

    it('can group copies together or collate them', () => {
        const queue = buildPrintQueue(rows, [0, 2], { copies: 2, collate: true });
        expect(queue.map((item) => item.row.name)).toEqual(['A', 'C', 'A', 'C']);
    });
});

describe('chunk', () => {
    it('splits a list into batches', () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });
});
