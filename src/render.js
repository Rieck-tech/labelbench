// Browser-side helpers for drawing labels: measuring text, making barcodes,
// and turning a label's SVG into the black-and-white bitmap the printer gets.

import bwipjs from 'bwip-js';
import { FONT_FAMILY } from './lib/layout.js';

const MM_PER_INCH = 25.4;

// --- Measuring text ------------------------------------------------------------

const measureCanvas = document.createElement('canvas').getContext('2d');

/** Width of `text` in millimetres at a font size given in millimetres. */
export function measureText(text, sizeMm, bold) {
    // Measure at 10 px per mm for precision, then convert back.
    measureCanvas.font = `${bold ? 700 : 400} ${sizeMm * 10}px ${FONT_FAMILY}`;
    return measureCanvas.measureText(text).width / 10;
}

// --- Barcodes ------------------------------------------------------------------

const barcodeCache = new Map();

/** Make a barcode as SVG parts: { viewBox, body }. Throws if the text can't be encoded. */
export function barcode(type, text) {
    const key = `${type}\u0000${text}`;
    if (!barcodeCache.has(key)) {
        const svg = bwipjs.toSVG({ bcid: type, text, includetext: false, paddingwidth: 0, paddingheight: 0 });
        const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
        const body = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
        if (barcodeCache.size > 2000) barcodeCache.clear();
        barcodeCache.set(key, { viewBox, body });
    }
    return barcodeCache.get(key);
}

export const renderDeps = { measureText, barcode };

// --- From SVG to printer bitmap ---------------------------------------------------

/** Load an SVG string as an <img>. */
export async function svgToImage(svg) {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    return image;
}

/**
 * Draw the label at the printer's resolution, rotate it if needed, and make every
 * pixel pure black or white so text and barcodes come out sharp on thermal tape.
 */
export async function rasterize(svg, { widthMm, heightMm, dpi = 300, rotation = 0, threshold = 160 }) {
    const image = await svgToImage(svg);
    const width = Math.round((widthMm / MM_PER_INCH) * dpi);
    const height = Math.round((heightMm / MM_PER_INCH) * dpi);
    const sideways = rotation === 90 || rotation === 270;

    const canvas = document.createElement('canvas');
    canvas.width = sideways ? height : width;
    canvas.height = sideways ? width : height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
        const light = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const value = light < threshold ? 0 : 255;
        data[i] = data[i + 1] = data[i + 2] = value;
        data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas;
}

/** Turn a canvas into an <img>, which is what the Brady SDK prints. */
export async function canvasToImage(canvas) {
    const image = new Image();
    image.src = canvas.toDataURL('image/png');
    await image.decode();
    return image;
}
