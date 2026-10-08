import { describe, it, expect } from 'vitest';
import { renderLabel, defaultTemplate } from '../src/lib/layout.js';

// A predictable stand-in for the browser's text measuring:
// every character is half as wide as the font size.
const measureText = (text, sizeMm) => text.length * sizeMm * 0.5;

const barcode = (type, text) => {
    if (text === 'BAD') throw new Error('invalid input');
    return { viewBox: '0 0 10 10', body: `<path data-type="${type}" data-text="${text}"/>` };
};

const deps = { measureText, barcode };

const template = (overrides = {}) => ({
    ...defaultTemplate(),
    widthMm: 60,
    heightMm: 20,
    marginMm: 2,
    code: { type: 'none', text: '', position: 'left' },
    lines: [{ text: '{{title}}', sizeMm: 5, bold: true, align: 'left' }],
    ...overrides,
});

/** Pull the attributes of every <text> element out of the SVG. */
const textElements = (svg) =>
    [...svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)].map(([, attrs, content]) => ({
        content,
        x: Number(attrs.match(/ x="([\d.]+)"/)?.[1] ?? attrs.match(/^x="([\d.]+)"/)?.[1]),
        y: Number(attrs.match(/ y="([\d.]+)"/)?.[1]),
        size: Number(attrs.match(/font-size="([\d.]+)"/)[1]),
        anchor: attrs.match(/text-anchor="(\w+)"/)?.[1],
    }));

describe('renderLabel', () => {
    it('makes an SVG measured in millimetres', () => {
        const { svg } = renderLabel(template(), { title: 'Bod' }, deps);
        expect(svg).toMatch(/^<svg [^>]*width="60mm" height="20mm" viewBox="0 0 60 20"/);
    });

    it('fills in column values and escapes characters that would break the SVG', () => {
        const { svg } = renderLabel(template(), { title: 'Skruer & <plugger>' }, deps);
        expect(textElements(svg)[0].content).toBe('Skruer &amp; &lt;plugger&gt;');
    });

    it('leaves out lines that end up empty', () => {
        const t = template({
            lines: [
                { text: '{{title}}', sizeMm: 5, bold: true, align: 'left' },
                { text: '{{subtitle}}', sizeMm: 4, bold: false, align: 'left' },
            ],
        });
        const { svg } = renderLabel(t, { title: 'Bod', subtitle: '' }, deps);
        expect(textElements(svg)).toHaveLength(1);
    });

    it('centres a single line vertically', () => {
        const { svg } = renderLabel(template(), { title: 'Bod' }, deps);
        const [line] = textElements(svg);
        // Baseline sits a little below the middle of a 20 mm label.
        expect(line.y).toBeGreaterThan(10);
        expect(line.y).toBeLessThan(13);
    });

    it('positions text by its alignment', () => {
        const t = template({ lines: [{ text: 'X', sizeMm: 5, bold: false, align: 'right' }] });
        const [line] = textElements(renderLabel(t, {}, deps).svg);
        expect(line.anchor).toBe('end');
        expect(line.x).toBe(58);
    });

    it('shrinks a line that is too wide so it fits', () => {
        // 30 characters at 5 mm = 75 mm wide, but only 56 mm is available.
        const { svg, warnings } = renderLabel(template(), { title: 'A'.repeat(30) }, deps);
        const [line] = textElements(svg);
        expect(line.size).toBeCloseTo(56 / 15, 2);
        expect(warnings).toEqual([]);
    });

    it('cuts text with an ellipsis and warns when shrinking is not enough', () => {
        const { svg, warnings } = renderLabel(template(), { title: 'A'.repeat(100) }, deps);
        const [line] = textElements(svg);
        expect(line.content.endsWith('…')).toBe(true);
        expect(measureText(line.content, line.size)).toBeLessThanOrEqual(56);
        expect(warnings).toEqual([expect.stringContaining('cut short')]);
    });

    it('wraps a long line onto a second line when wrapping is on', () => {
        // 16 chars at 5 mm = 40 mm; "Kabler ladere og" and "adaptere" each fit in 30 mm.
        const t = template({
            widthMm: 34,
            lines: [{ text: 'Kabler ladere og adaptere', sizeMm: 3.6, bold: false, align: 'left', wrap: true }],
        });
        const lines = textElements(renderLabel(t, {}, deps).svg);
        expect(lines.map((l) => l.content)).toEqual(['Kabler ladere og', 'adaptere']);
        expect(lines[0].size).toBe(3.6);
        expect(lines[1].y).toBeGreaterThan(lines[0].y);
    });

    it('wraps onto at most two lines, then shrinks and cuts the last one', () => {
        const t = template({
            widthMm: 24,
            lines: [{ text: 'en to tre fire fem seks sju åtte ni ti elleve tolv', sizeMm: 5, bold: false, align: 'left', wrap: true }],
        });
        const { svg, warnings } = renderLabel(t, {}, deps);
        const lines = textElements(svg);
        expect(lines).toHaveLength(2);
        expect(lines[1].content.endsWith('…')).toBe(true);
        expect(warnings).toEqual([expect.stringContaining('cut short')]);
    });

    it('shrinks a little rather than wrap, when that is enough', () => {
        // 25 chars at 5 mm = 62.5 mm; at 90 % size it is 56.25... so use 24 chars = 60 mm → 93 %.
        const t = template({ lines: [{ text: 'Garasje – Kasse nummer 2', sizeMm: 5, bold: false, align: 'left', wrap: true }] });
        const lines = textElements(renderLabel(t, {}, deps).svg);
        expect(lines).toHaveLength(1);
        expect(lines[0].size).toBeCloseTo(56 / 12, 2);
    });

    it('keeps a dash with the word before it when wrapping', () => {
        const t = template({
            widthMm: 24,
            lines: [{ text: 'Garasje – Kasse 2', sizeMm: 3, bold: false, align: 'left', wrap: true }],
        });
        const lines = textElements(renderLabel(t, {}, deps).svg);
        expect(lines.map((l) => l.content)).toEqual(['Garasje –', 'Kasse 2']);
    });

    it('gives both parts of a wrapped line the same size', () => {
        const t = template({
            widthMm: 24,
            lines: [{ text: 'Kjøkkenet – Skuff 1', sizeMm: 5, bold: false, align: 'left', wrap: true }],
        });
        const lines = textElements(renderLabel(t, {}, deps).svg);
        expect(lines).toHaveLength(2);
        expect(lines[0].size).toBe(lines[1].size);
    });

    it('keeps shrinking when real text measuring is not exactly proportional', () => {
        // Like a browser: widths are rounded up, so one shrink step is not quite enough.
        const roughMeasure = (text, sizeMm) => Math.ceil(text.length * sizeMm * 0.5 * 4) / 4 + 0.2;
        const { svg, warnings } = renderLabel(template(), { title: 'A'.repeat(30) }, { ...deps, measureText: roughMeasure });
        const [line] = textElements(svg);
        expect(line.content).toBe('A'.repeat(30));
        expect(roughMeasure(line.content, line.size)).toBeLessThanOrEqual(56);
        expect(warnings).toEqual([]);
    });

    it('keeps a wrapped line on one line when it fits', () => {
        const t = template({ lines: [{ text: 'Kort', sizeMm: 5, bold: false, align: 'left', wrap: true }] });
        expect(textElements(renderLabel(t, {}, deps).svg)).toHaveLength(1);
    });

    it('scales all lines down when together they are too tall', () => {
        const t = template({
            lines: [
                { text: 'Én', sizeMm: 10, bold: true, align: 'left' },
                { text: 'To', sizeMm: 10, bold: false, align: 'left' },
            ],
        });
        const lines = textElements(renderLabel(t, {}, deps).svg);
        const totalHeight = lines.reduce((sum, l) => sum + l.size * t.lineHeight, 0);
        expect(totalHeight).toBeLessThanOrEqual(16.01);
        expect(lines[0].size).toBeCloseTo(lines[1].size, 5);
    });

    it('puts a square code on the left and moves the text to its right', () => {
        const t = template({ code: { type: 'qrcode', text: '{{code}}', position: 'left' } });
        const { svg } = renderLabel(t, { title: 'Bod', code: 'LBL-1' }, deps);
        expect(svg).toContain('data-text="LBL-1"');
        expect(svg).toMatch(/<svg x="2" y="2" width="16" height="16" viewBox="0 0 10 10"/);
        // Code is 16 mm wide, then a 2 mm gap.
        expect(textElements(svg)[0].x).toBe(20);
    });

    it('puts a square code on the right and keeps the text on the left', () => {
        const t = template({ code: { type: 'datamatrix', text: 'X', position: 'right' } });
        const { svg } = renderLabel(t, { title: 'Bod' }, deps);
        expect(svg).toMatch(/<svg x="42" y="2" width="16" height="16"/);
        expect(textElements(svg)[0].x).toBe(2);
    });

    it('puts a linear barcode along the bottom', () => {
        const t = template({ code: { type: 'code128', text: 'X', position: 'bottom', heightPct: 40 } });
        const { svg } = renderLabel(t, { title: 'Bod' }, deps);
        // 40 % of the 16 mm content height = 6.4 mm, at the bottom of the content box.
        expect(svg).toMatch(/<svg x="2" y="11.6" width="56" height="6.4" [^>]*preserveAspectRatio="none"/);
    });

    it('leaves the code out when its text is empty', () => {
        const t = template({ code: { type: 'qrcode', text: '{{code}}', position: 'left' } });
        const { svg } = renderLabel(t, { title: 'Bod', code: '' }, deps);
        expect(svg).not.toContain('data-type');
        expect(textElements(svg)[0].x).toBe(2);
    });

    it('warns instead of crashing when the barcode cannot be made', () => {
        const t = template({ code: { type: 'code128', text: 'BAD', position: 'bottom', heightPct: 40 } });
        const { svg, warnings } = renderLabel(t, { title: 'Bod' }, deps);
        expect(svg).toContain('<svg');
        expect(warnings).toEqual([expect.stringContaining('BAD')]);
    });

    it('draws a frame when asked to', () => {
        const { svg } = renderLabel(template({ frame: true }), { title: 'Bod' }, deps);
        expect(svg).toContain('<rect class="frame"');
    });
});
