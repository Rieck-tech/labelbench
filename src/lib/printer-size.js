/**
 * Work out the label size to design for, from what Brady's SDK reports.
 *
 * - `zoneDimensions` is a list of zones from Brady's parts database, each like
 *   { Type: 'Printable', Width: '10000', Height: '5000', ... }, measured in 1/10 000 inch.
 *   Self-laminating labels have a printable zone that is much smaller than the label,
 *   so the printable zone is what the design must match.
 * - `supplyDimensions` is the whole label as text in inches, like "1 x 1.5".
 *   It is only used when there is no printable zone.
 *
 * The longer side becomes the length (widthMm), matching how labels are designed.
 */

const MM_PER_INCH = 25.4;
const ZONE_UNITS_PER_INCH = 10000;

const round1 = (n) => Math.round(n * 10) / 10;

function printableZone(zones) {
    const list = Array.isArray(zones) ? zones : zones && typeof zones === 'object' ? Object.values(zones) : [];
    return list.find((zone) => /^printable$/i.test(String(zone?.Type ?? '').trim()) && Number(zone.Width) > 0 && Number(zone.Height) > 0);
}

function landscape(aMm, bMm, source) {
    return { widthMm: round1(Math.max(aMm, bMm)), heightMm: round1(Math.min(aMm, bMm)), source };
}

export function labelSizeFromPrinter(printer) {
    if (!printer) return null;

    const zone = printableZone(printer.zoneDimensions);
    if (zone) {
        const toMm = (value) => (Number(value) / ZONE_UNITS_PER_INCH) * MM_PER_INCH;
        return landscape(toMm(zone.Width), toMm(zone.Height), 'printable area');
    }

    const inches = (String(printer.supplyDimensions ?? '').match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    const sides = inches.filter((n) => n > 0).map((n) => n * MM_PER_INCH);
    if (sides.length >= 2) return landscape(sides[0], sides[1], 'label');
    if (sides.length === 1) return { widthMm: null, heightMm: round1(sides[0]), source: 'tape width' };
    return null;
}

/** Whether a design's size matches the printer's, within 0.1 mm. */
export function sameSize(design, printer) {
    const close = (a, b) => Math.abs(a - b) <= 0.1 + 1e-9;
    return close(design.heightMm, printer.heightMm) && (printer.widthMm == null || close(design.widthMm, printer.widthMm));
}
