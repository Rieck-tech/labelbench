import { fillParts } from './parts.js';

/**
 * Label layout. Everything here is measured in millimetres, and the result is an SVG
 * whose user units are millimetres too. The browser-specific parts (measuring text,
 * drawing barcodes) are passed in as `deps`, so this file can be tested in Node.
 */

export const CODE_TYPES = {
    none: { label: 'None', square: false },
    qrcode: { label: 'QR code', square: true },
    datamatrix: { label: 'Data Matrix', square: true },
    code128: { label: 'Barcode (Code 128)', square: false },
    code39: { label: 'Barcode (Code 39)', square: false },
};

export const FONT_FAMILY = 'Helvetica, Arial, sans-serif';

export function defaultTemplate() {
    return {
        widthMm: 60,
        heightMm: 38.1,
        marginMm: 2,
        lineHeight: 1.15,
        minSizeMm: 2,
        frame: false,
        code: { type: 'qrcode', parts: [{ column: 'code' }], position: 'left', heightPct: 35 },
        lines: [
            { parts: [{ column: 'title' }], sizeMm: 7, bold: true, align: 'left', wrap: true, upper: false },
            { parts: [{ column: 'subtitle' }], sizeMm: 4.5, bold: false, align: 'left', wrap: true, upper: false },
        ],
    };
}

/** Format a number for SVG: at most three decimals, no trailing zeros. */
export const fmt = (n) => String(Math.round(n * 1000) / 1000);

const escapeXml = (text) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ANCHORS = { left: 'start', center: 'middle', right: 'end' };

/** Work out where the code goes and what space is left for text. */
function placeCode(template, codeText) {
    const { widthMm: w, heightMm: h, marginMm: m } = template;
    const content = { x: m, y: m, w: w - 2 * m, h: h - 2 * m };
    const type = template.code?.type ?? 'none';

    if (type === 'none' || codeText === '') return { code: null, textArea: content };

    if (CODE_TYPES[type]?.square) {
        const side = Math.min(content.h, content.w / 2);
        const gap = m;
        const atRight = template.code.position === 'right';
        return {
            code: { x: atRight ? content.x + content.w - side : content.x, y: content.y + (content.h - side) / 2, w: side, h: side, stretch: false },
            textArea: { x: atRight ? content.x : content.x + side + gap, y: content.y, w: content.w - side - gap, h: content.h },
        };
    }

    const codeHeight = (content.h * (template.code.heightPct ?? 35)) / 100;
    const gap = Math.min(1, m);
    return {
        code: { x: content.x, y: content.y + content.h - codeHeight, w: content.w, h: codeHeight, stretch: true },
        textArea: { x: content.x, y: content.y, w: content.w, h: content.h - codeHeight - gap },
    };
}

/**
 * The largest size (up to sizeMm, down to minSize) at which the text fits the width.
 * Real text measuring isn't exactly proportional to the size, so keep stepping down
 * a little until it truly fits.
 */
function sizeToFit(text, sizeMm, bold, maxWidth, minSize, measureText) {
    let size = sizeMm;
    let width = measureText(text, size, bold);
    if (width <= maxWidth) return size;

    size = Math.max(minSize, (size * maxWidth) / width);
    for (let step = 0; step < 20 && size > minSize; step++) {
        width = measureText(text, size, bold);
        if (width <= maxWidth) break;
        size = Math.max(minSize, size * 0.98);
    }
    return size;
}

/** Cut text with an ellipsis so it fits the width at the given size. */
function cutToFit(text, size, bold, maxWidth, measureText) {
    if (measureText(text, size, bold) <= maxWidth) return { text, cut: false };
    let cutText = text;
    while (cutText.length > 0 && measureText(`${cutText}…`, size, bold) > maxWidth) cutText = cutText.slice(0, -1);
    return { text: `${cutText.trimEnd()}…`, cut: true };
}

/**
 * Break text into at most `maxLines` lines that fit `maxWidth`, breaking between words.
 * The last line gets whatever is left; fitLine shrinks or cuts it if needed.
 */
const SHRINK_BEFORE_WRAP = 0.8;

function wrapText(text, sizeMm, bold, maxWidth, maxLines, measureText) {
    // Shrinking a little looks better than wrapping, so only wrap when that isn't enough.
    if (maxLines <= 1 || measureText(text, sizeMm * SHRINK_BEFORE_WRAP, bold) <= maxWidth) return [text];

    // Keep a lone dash with the word before it, so no line starts with "–".
    const words = text.split(' ').reduce((list, word) => {
        if (/^[-–—]$/.test(word) && list.length) list[list.length - 1] += ` ${word}`;
        else list.push(word);
        return list;
    }, []);
    const lines = [];
    let current = '';

    while (words.length && lines.length < maxLines - 1) {
        const candidate = current ? `${current} ${words[0]}` : words[0];
        if (current && measureText(candidate, sizeMm, bold) > maxWidth) {
            lines.push(current);
            current = '';
        } else {
            current = candidate;
            words.shift();
        }
    }

    const rest = [current, ...words].filter(Boolean).join(' ');
    if (rest) lines.push(rest);
    return lines;
}

/**
 * Render one label for one data row.
 * Returns { svg, warnings }, where warnings describe text that was cut or codes that failed.
 */
export function renderLabel(template, row, { measureText, barcode }) {
    const warnings = [];
    const { widthMm: w, heightMm: h, lineHeight } = template;
    const parts = [`<rect width="${fmt(w)}" height="${fmt(h)}" fill="#fff"/>`];

    // The code, if there is one.
    const codeText = template.code?.type && template.code.type !== 'none' ? fillParts(template.code.parts, row).trim() : '';
    const { code, textArea } = placeCode(template, codeText);

    if (code) {
        try {
            const { viewBox, body } = barcode(template.code.type, codeText);
            const aspect = code.stretch ? 'none' : 'xMidYMid meet';
            parts.push(
                `<svg x="${fmt(code.x)}" y="${fmt(code.y)}" width="${fmt(code.w)}" height="${fmt(code.h)}" viewBox="${viewBox}" preserveAspectRatio="${aspect}">${body}</svg>`,
            );
        } catch (error) {
            warnings.push(`Could not make ${CODE_TYPES[template.code.type]?.label ?? 'code'} from "${codeText}": ${error.message}`);
        }
    }

    // The text lines: fill in, drop empty ones, wrap long ones, then fit the height and each line's width.
    const lines = (template.lines ?? [])
        .map((line) => {
            const text = fillParts(line.parts, row).replace(/\s+/g, ' ').trim();
            return { ...line, text: line.upper ? text.toLocaleUpperCase() : text };
        })
        .filter((line) => line.text !== '');

    const wrapAt = (scale) =>
        lines.flatMap((line, lineIndex) =>
            wrapText(line.text, line.sizeMm * scale, line.bold, textArea.w, line.wrap ? 2 : 1, measureText).map((text) => ({
                ...line,
                lineIndex,
                original: line.text,
                text,
            })),
        );

    // Wrapping can make the block too tall; then scale everything down and wrap again.
    let scale = 1;
    let pieces = wrapAt(scale);
    for (let attempt = 0; attempt < 4; attempt++) {
        const totalHeight = pieces.reduce((sum, piece) => sum + piece.sizeMm * scale * lineHeight, 0);
        if (totalHeight <= textArea.h + 1e-9) break;
        scale *= textArea.h / totalHeight;
        pieces = wrapAt(scale);
    }

    // Every part of one wrapped line gets the same size: the size its widest part needs.
    const minSize = template.minSizeMm ?? 2;
    const lineSizes = new Map();
    for (const piece of pieces) {
        const size = sizeToFit(piece.text, piece.sizeMm * scale, piece.bold, textArea.w, minSize, measureText);
        lineSizes.set(piece.lineIndex, Math.min(size, lineSizes.get(piece.lineIndex) ?? Infinity));
    }

    const cutLines = new Set();
    const fitted = pieces.map((piece) => {
        const size = lineSizes.get(piece.lineIndex);
        const result = cutToFit(piece.text, size, piece.bold, textArea.w, measureText);
        if (result.cut) cutLines.add(piece.original);
        return { ...piece, ...result, size };
    });
    for (const text of cutLines) warnings.push(`Text "${text}" was cut short to fit the label`);

    const blockHeight = fitted.reduce((sum, line) => sum + line.size * lineHeight, 0);
    let top = textArea.y + (textArea.h - blockHeight) / 2;

    for (const line of fitted) {
        const baseline = top + (line.size * lineHeight - line.size) / 2 + line.size * 0.8;
        const align = line.align ?? 'left';
        const x = align === 'center' ? textArea.x + textArea.w / 2 : align === 'right' ? textArea.x + textArea.w : textArea.x;
        parts.push(
            `<text x="${fmt(x)}" y="${fmt(baseline)}" font-size="${fmt(line.size)}" font-weight="${line.bold ? 700 : 400}" text-anchor="${ANCHORS[align]}">${escapeXml(line.text)}</text>`,
        );
        top += line.size * lineHeight;
    }

    if (template.frame) {
        const inset = 0.3;
        parts.push(
            `<rect class="frame" x="${inset}" y="${inset}" width="${fmt(w - 2 * inset)}" height="${fmt(h - 2 * inset)}" rx="1" fill="none" stroke="#000" stroke-width="0.3"/>`,
        );
    }

    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}mm" height="${fmt(h)}mm" viewBox="0 0 ${fmt(w)} ${fmt(h)}" ` +
        `font-family="${FONT_FAMILY}" fill="#000">${parts.join('')}</svg>`;

    return { svg, warnings };
}
