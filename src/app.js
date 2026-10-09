// Labelbench: load a CSV or Excel file, design a label, print a batch on a Brady label printer.
//
// The app keeps everything in one `state` object. When something changes, the
// matching render function redraws that part of the page from `state`.

import { parseCsv } from './lib/csv.js';
import { decodeText } from './lib/decode.js';
import { sheetToTable } from './lib/cells.js';
import { readXlsx } from './lib/xlsx.js';
import { renderLabel, defaultTemplate, CODE_TYPES } from './lib/layout.js';
import { buildPrintQueue, parseRowRange } from './lib/selection.js';
import { columnsIn, normalizeParts } from './lib/parts.js';
import { partsEditorHtml, setUpPartsEditors, insertIntoLastEditor } from './part-editor.js';
import { labelSizeFromPrinter, sameSize } from './lib/printer-size.js';
import { printerMessageText } from './lib/printer-message.js';
import { connectionOutcome } from './lib/connection.js';
import { renderDeps, rasterize, canvasToImage } from './render.js';

const SETTINGS_KEY = 'labelbench:settings-v2';
// The desktop app is Electron, which says so in its user agent.
const IS_DESKTOP_APP = /\bElectron\//.test(navigator.userAgent);
const DESIGN_FORMAT = 'labelbench-design';
const MM_PER_PT = 0.3528;

const CUT_OPTIONS = [
    { value: 1, label: 'Cut after every label' },
    { value: 0, label: 'Cut after each batch' },
    { value: 2, label: 'Never cut' },
    { value: 4, label: 'Use the printer’s setting' },
];

const defaultOptions = () => ({
    copies: 1,
    copiesColumn: '',
    collate: false,
    cutOption: 1,
    batchSize: 20,
    rotation: 0,
    threshold: 160,
});

const state = {
    fileName: null,
    headers: [],
    rows: [],
    selected: new Set(),
    filter: '',
    previewIndex: 0,
    template: defaultTemplate(),
    options: defaultOptions(),
    showRaster: false,
    notice: null,
    printer: { connected: false },
    connecting: false,
    printerApi: null,
    bluetooth: 'checking', // 'checking' | 'ok' | 'unsupported' | 'failed'
    job: null,
};

const $ = (selector) => document.querySelector(selector);

const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const round = (n, decimals = 1) => Math.round(n * 10 ** decimals) / 10 ** decimals;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// --- Saving settings between visits -------------------------------------------------

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
        if (saved?.template) state.template = normalizeTemplate(saved.template);
        if (saved?.options) state.options = { ...defaultOptions(), ...saved.options };
    } catch {
        // Nothing saved, or storage is blocked: start with the defaults.
    }
}

let saveTimer;
function saveSettings() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({ template: state.template, options: state.options }));
        } catch {
            // Storage blocked: the design still works, it just isn't remembered.
        }
    }, 300);
}

/** Fill in anything missing from a saved or opened design, so old files keep working. */
function normalizeTemplate(raw) {
    const base = defaultTemplate();
    const { format, version, ...rest } = raw;
    const code = { ...base.code, ...(raw.code ?? {}) };
    return {
        ...base,
        ...rest,
        code: { ...code, parts: normalizeParts(code.parts) },
        lines: Array.isArray(raw.lines)
            ? raw.lines.map((line) => ({ ...base.lines[1], ...line, parts: normalizeParts(line.parts) }))
            : base.lines,
    };
}

/** Every column the design uses, in the code and in the text lines. */
const usedColumns = () => columnsIn([...state.template.code.parts, ...state.template.lines.flatMap((line) => line.parts)]);

// --- Data ------------------------------------------------------------------------

/** The rows that match the search box, as row indexes. */
function visibleIndexes() {
    const query = state.filter.trim().toLocaleLowerCase('nb');
    return state.rows
        .map((row, index) => [row, index])
        .filter(([row]) => !query || Object.values(row).some((v) => String(v).toLocaleLowerCase('nb').includes(query)))
        .map(([, index]) => index);
}

async function loadFile(file) {
    try {
        const buffer = await file.arrayBuffer();
        let table;

        if (/\.xlsx$/i.test(file.name)) {
            if (!window.ExcelJS) throw new Error('The Excel reader did not load. Reload the page and try again.');
            const { values } = await readXlsx(buffer);
            table = sheetToTable(values);
        } else if (/\.xls$/i.test(file.name)) {
            throw new Error('Older .xls files can’t be read. Open the file in Excel or Numbers and save it as .xlsx or CSV.');
        } else {
            table = parseCsv(decodeText(buffer));
        }

        if (table.rows.length === 0) throw new Error(`No rows found in ${file.name}. The first row should hold the column names, with the data below it.`);
        setData(file.name, table);
    } catch (error) {
        showDialog({ title: 'Couldn’t read the file', body: `<p>${escapeHtml(error.message)}</p>`, confirm: 'OK' });
    }
}

async function loadSample() {
    const response = await fetch('examples/sample-labels.csv');
    const blob = await response.blob();
    await loadFile(new File([blob], 'sample-labels.csv'));
}

function setData(fileName, { headers, rows }) {
    state.fileName = fileName;
    state.headers = headers;
    state.rows = rows;
    state.selected = new Set(rows.map((_, i) => i));
    state.filter = '';
    state.previewIndex = 0;
    state.job = null;

    if (state.options.copiesColumn && !headers.includes(state.options.copiesColumn)) state.options.copiesColumn = '';

    // If the current design uses none of this file's columns, start from its first columns.
    if (!usedColumns().some((name) => headers.includes(name))) {
        state.template.lines = headers.slice(0, 2).map((name, i) => ({
            parts: [{ column: name }],
            sizeMm: i === 0 ? 7 : 4.5,
            bold: i === 0,
            align: 'left',
            wrap: true,
            upper: false,
        }));
        state.template.code = { ...state.template.code, type: 'none', parts: [{ column: headers[0] }] };
        state.notice = 'The design didn’t use any of this file’s columns, so it now shows the first two. Change it below.';
    } else {
        state.notice = null;
    }

    saveSettings();
    renderAll();
}

/** The row shown in the preview: real data, or each column's name when no file is loaded. */
function previewRow() {
    if (state.rows.length) return state.rows[state.previewIndex] ?? state.rows[0];
    return Object.fromEntries(usedColumns().map((name) => [name, name]));
}

/** The loaded cartridge's size, and whether the design differs from it. */
function cartridgeSize() {
    const size = state.printer.connected ? labelSizeFromPrinter(state.printer) : null;
    return { size, mismatch: Boolean(size) && !sameSize(state.template, size) };
}

const formatSize = (size) => (size.widthMm ? `${round(size.widthMm)} × ${round(size.heightMm)} mm` : `${round(size.heightMm)} mm wide`);

// --- Render: data panel ------------------------------------------------------------

function renderFileInfo() {
    $('#file-info').innerHTML = state.fileName
        ? `<span class="file-name">${escapeHtml(state.fileName)}</span>
           <span class="muted">${plural(state.rows.length, 'row', 'rows')}</span>
           <button type="button" class="quiet" data-action="choose-file">Open another file…</button>`
        : '';
}

function renderData() {
    renderFileInfo();
    const body = $('#data-body');

    if (!state.rows.length) {
        body.innerHTML = `
            <div class="dropzone" data-dropzone>
                <p class="drop-title">Drop a CSV or Excel file here</p>
                <p class="drop-hint">CSV, TSV or .xlsx. The first row should hold the column names.</p>
                <div class="drop-actions">
                    <button type="button" class="secondary" data-action="choose-file">Choose file…</button>
                    <button type="button" class="quiet" data-action="load-sample">Try the sample data</button>
                </div>
            </div>`;
        return;
    }

    body.innerHTML = `
        <div class="data-tools">
            <input type="search" id="filter" placeholder="Search rows" value="${escapeHtml(state.filter)}" aria-label="Search rows">
            <form class="range" data-form="range">
                <input type="text" id="range" placeholder="Rows, e.g. 1-20, 25" aria-label="Rows to select">
                <button type="submit" class="secondary">Select</button>
            </form>
            <div class="select-buttons">
                <button type="button" class="quiet" data-action="select-all">Select all</button>
                <button type="button" class="quiet" data-action="select-none">Select none</button>
            </div>
            <p class="selection-count muted" id="selection-count"></p>
        </div>
        <div class="table-wrap" data-dropzone>
            <table class="rows">
                <thead><tr>
                    <th class="check"><input type="checkbox" id="check-visible" aria-label="Select all shown rows"></th>
                    <th class="num">#</th>
                    ${state.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}
                </tr></thead>
                <tbody id="rows-body"></tbody>
            </table>
        </div>`;
    renderRows();
}

function renderRows() {
    const visible = visibleIndexes();
    $('#rows-body').innerHTML = visible.length
        ? visible
              .map((i) => {
                  const classes = [state.selected.has(i) ? 'is-selected' : '', i === state.previewIndex ? 'is-current' : ''].join(' ');
                  return `<tr data-row="${i}" class="${classes}">
                    <td class="check"><input type="checkbox" data-check="${i}" ${state.selected.has(i) ? 'checked' : ''} aria-label="Select row ${i + 1}"></td>
                    <td class="num">${i + 1}</td>
                    ${state.headers.map((h) => `<td>${escapeHtml(state.rows[i][h])}</td>`).join('')}
                </tr>`;
              })
              .join('')
        : `<tr><td class="empty" colspan="${state.headers.length + 2}">No rows match “${escapeHtml(state.filter)}”.</td></tr>`;
    renderSelectionCount();
}

function renderSelectionCount() {
    const visible = visibleIndexes();
    const selectedVisible = visible.filter((i) => state.selected.has(i)).length;
    const box = $('#check-visible');
    if (box) {
        box.checked = visible.length > 0 && selectedVisible === visible.length;
        box.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
    }
    const count = $('#selection-count');
    if (count) count.textContent = `${state.selected.size} of ${plural(state.rows.length, 'row', 'rows')} selected`;
}

// --- Render: preview ---------------------------------------------------------------

let previewToken = 0;

async function renderPreview() {
    const { template } = state;
    const row = previewRow();
    const { svg, warnings } = renderLabel(template, row, renderDeps);
    const token = ++previewToken;

    const nav = $('#preview-nav');
    nav.innerHTML = `
        ${
            state.rows.length
                ? `<button type="button" class="icon" data-action="prev-row" aria-label="Previous row" ${state.previewIndex <= 0 ? 'disabled' : ''}>‹</button>
                   <span class="row-pos">Row ${state.previewIndex + 1} of ${state.rows.length}</span>
                   <button type="button" class="icon" data-action="next-row" aria-label="Next row" ${state.previewIndex >= state.rows.length - 1 ? 'disabled' : ''}>›</button>`
                : '<span class="muted">Column names shown until a file is loaded</span>'
        }
        <label class="check"><input type="checkbox" data-action="toggle-raster" ${state.showRaster ? 'checked' : ''}> Show as printed</label>`;

    const preview = $('#preview');
    const ratio = `${template.widthMm} / ${template.heightMm}`;
    preview.innerHTML = `<div class="tape"><div class="label" style="aspect-ratio:${ratio}" data-label>${state.showRaster ? '' : svg}</div></div>`;

    if (state.showRaster) {
        const canvas = await rasterize(svg, {
            widthMm: template.widthMm,
            heightMm: template.heightMm,
            dpi: state.printer.dpi || 300,
            threshold: state.options.threshold,
        });
        if (token !== previewToken) return; // A newer preview was started meanwhile.
        $('[data-label]')?.append(canvas);
    }

    const size = `${round(template.widthMm)} × ${round(template.heightMm)} mm`;
    $('#preview-notes').innerHTML = `
        <p class="muted">${size}${state.options.rotation ? `, turned ${state.options.rotation}° when printed` : ''}</p>
        ${mismatchNote()}
        ${warnings.map((w) => `<p class="warning">${escapeHtml(w)}</p>`).join('')}`;
}

function mismatchNote() {
    const { size, mismatch } = cartridgeSize();
    if (!mismatch) return '';
    return `<p class="warning">The loaded cartridge prints ${formatSize(size)}, so these labels will be scaled to fit.
        <button type="button" class="quiet inline" data-action="size-from-printer">Use ${formatSize(size)}</button></p>`;
}

// --- Render: design panel ------------------------------------------------------------

const numberInput = (field, value, { step = 0.5, min = 0, max = 500, unit = 'mm', label }) => `
    <label class="field"><span>${label}</span>
        <span class="with-unit"><input type="number" data-field="${field}" value="${value}" step="${step}" min="${min}" max="${max}"><span class="unit">${unit}</span></span>
    </label>`;

function renderDesign() {
    const t = state.template;
    const o = state.options;
    const codeType = CODE_TYPES[t.code.type] ?? CODE_TYPES.none;
    const knownColumns = state.headers.length ? state.headers : null;
    const { size: printerSize, mismatch } = cartridgeSize();
    const sourceName = { 'printable area': 'Printable area', label: 'Label size', 'tape width': 'Tape width' };
    const cartridgeLine = printerSize
        ? `<p class="hint${mismatch ? ' is-off' : ''}">${escapeHtml(state.printer.supplyName || 'Loaded cartridge')}: ${sourceName[printerSize.source].toLowerCase()} ${formatSize(printerSize)}.${mismatch ? ' The design is a different size, so labels will be scaled.' : ' The design matches.'}</p>`
        : state.printer.connected
          ? '<p class="hint">The printer didn’t report the size of the loaded cartridge.</p>'
          : '<p class="hint">Connect the printer to read the size of the loaded cartridge.</p>';

    $('#design').innerHTML = `
        ${state.notice ? `<div class="notice"><p>${escapeHtml(state.notice)}</p><button type="button" class="quiet" data-action="dismiss-notice">Dismiss</button></div>` : ''}

        <fieldset class="group">
            <legend>Text</legend>
            <p class="hint">Type text as usual. To add a value from your file, press <kbd>{</kbd> or click <strong>Insert column</strong>${
                state.headers.length ? ', or click a column below' : ''
            }.</p>
            ${
                state.headers.length
                    ? `<div class="chips" role="group" aria-label="Insert a column">
                        ${state.headers.map((h) => `<button type="button" class="chip" data-insert="${escapeHtml(h)}">${escapeHtml(h)}</button>`).join('')}
                       </div>`
                    : ''
            }
            <ol class="lines">
                ${t.lines
                    .map(
                        (line, i) => `
                    <li class="line" data-line="${i}">
                        ${partsEditorHtml({ id: `line-${i}`, parts: line.parts, label: `Line ${i + 1} text`, placeholder: 'Type text or press { for a column', columns: knownColumns })}
                        <span class="with-unit size"><input type="number" data-line-field="sizePt" value="${round(line.sizeMm / MM_PER_PT)}" step="1" min="4" max="200" aria-label="Line ${i + 1} text size"><span class="unit">pt</span></span>
                        <button type="button" class="toggle" data-line-action="bold" aria-pressed="${line.bold}" aria-label="Bold" title="Bold"><b>B</b></button>
                        <button type="button" class="toggle wide" data-line-action="upper" aria-pressed="${Boolean(line.upper)}" title="Print this line in capitals">ABC</button>
                        <button type="button" class="toggle wide" data-line-action="wrap" aria-pressed="${Boolean(line.wrap)}" title="Let long text continue on a second line">Wrap</button>
                        <select data-line-field="align" aria-label="Line ${i + 1} alignment">
                            ${['left', 'center', 'right'].map((a) => `<option value="${a}" ${line.align === a ? 'selected' : ''}>${a[0].toUpperCase() + a.slice(1)}</option>`).join('')}
                        </select>
                        <span class="line-moves">
                            <button type="button" class="icon" data-line-action="up" aria-label="Move line ${i + 1} up" ${i === 0 ? 'disabled' : ''}>↑</button>
                            <button type="button" class="icon" data-line-action="down" aria-label="Move line ${i + 1} down" ${i === t.lines.length - 1 ? 'disabled' : ''}>↓</button>
                            <button type="button" class="icon" data-line-action="remove" aria-label="Remove line ${i + 1}">×</button>
                        </span>
                    </li>`,
                    )
                    .join('')}
            </ol>
            <button type="button" class="secondary add-line" data-action="add-line">Add line</button>
        </fieldset>

        <fieldset class="group">
            <legend>Code</legend>
            <div class="row">
                <label class="field"><span>Type</span>
                    <select data-field="code.type">
                        ${Object.entries(CODE_TYPES).map(([value, { label }]) => `<option value="${value}" ${t.code.type === value ? 'selected' : ''}>${label}</option>`).join('')}
                    </select>
                </label>
                ${
                    t.code.type !== 'none'
                        ? `<div class="field grow"><span>Contents</span>${partsEditorHtml({ id: 'code', parts: t.code.parts, label: 'Code contents', placeholder: 'Press { for a column', columns: knownColumns })}</div>
                           ${
                               codeType.square
                                   ? `<label class="field"><span>Position</span><select data-field="code.position">
                                        <option value="left" ${t.code.position !== 'right' ? 'selected' : ''}>Left</option>
                                        <option value="right" ${t.code.position === 'right' ? 'selected' : ''}>Right</option>
                                      </select></label>`
                                   : numberInput('code.heightPct', t.code.heightPct, { step: 5, min: 10, max: 80, unit: '%', label: 'Height' })
                           }`
                        : ''
                }
            </div>
        </fieldset>

        <fieldset class="group">
            <legend>Size</legend>
            <div class="row">
                ${numberInput('widthMm', t.widthMm, { min: 5, label: 'Length' })}
                ${numberInput('heightMm', t.heightMm, { min: 5, label: 'Height' })}
                ${numberInput('marginMm', t.marginMm, { step: 0.5, max: 20, label: 'Margin' })}
            </div>
            <div class="row">
                <button type="button" class="${mismatch ? 'primary' : 'secondary'}" data-action="size-from-printer" ${printerSize && mismatch ? '' : 'disabled'}>Use cartridge size</button>
                <label class="check"><input type="checkbox" data-field="frame" ${t.frame ? 'checked' : ''}> Draw a frame</label>
            </div>
            ${cartridgeLine}
        </fieldset>

        <fieldset class="group">
            <legend>Print adjustments</legend>
            <div class="row">
                <label class="field"><span>Turn when printing</span>
                    <select data-option="rotation">
                        ${[0, 90, 180, 270].map((r) => `<option value="${r}" ${o.rotation === r ? 'selected' : ''}>${r === 0 ? 'No turning' : `${r}°`}</option>`).join('')}
                    </select>
                </label>
                <label class="field grow"><span>Darkness</span>
                    <input type="range" data-option="threshold" min="80" max="230" step="10" value="${o.threshold}">
                </label>
            </div>
            <p class="hint">If a test label comes out sideways or upside down, turn it here. More darkness makes thin text bolder.</p>
        </fieldset>`;
}

// --- Render: printer status ----------------------------------------------------------

function renderPrinter() {
    const p = state.printer;
    const el = $('#printer');

    if (state.bluetooth === 'unsupported') {
        el.innerHTML = `<p class="printer-problem">This browser can’t use Bluetooth. To print, use the Labelbench app, or open <strong>${escapeHtml(location.origin)}</strong> in Chrome or Edge.</p>`;
        return;
    }
    if (state.bluetooth === 'off') {
        el.innerHTML = '<p class="printer-problem">Bluetooth is turned off, or this computer has none. Turn Bluetooth on, then restart Labelbench.</p>';
        return;
    }
    if (state.bluetooth === 'failed') {
        el.innerHTML = '<p class="printer-problem">Brady’s printer library didn’t load. If you run Labelbench from source, run <code>npm install</code> and restart it.</p>';
        return;
    }
    if (!p.connected && state.connecting) {
        el.innerHTML = `
            <span class="status-dot" aria-hidden="true"></span>
            <span class="muted">Looking for printers. It can take up to a minute for yours to show up.</span>
            <button type="button" class="dark" disabled>Connecting…</button>`;
        return;
    }
    if (!p.connected) {
        el.innerHTML = `
            <span class="status-dot" aria-hidden="true"></span>
            <span class="muted">No printer connected</span>
            <button type="button" class="dark" data-action="connect" ${state.bluetooth !== 'ok' ? 'disabled' : ''}>Connect printer</button>`;
        return;
    }

    const battery = p.battery != null ? `Battery ${p.battery}%${p.charging ? ', charging' : ''}` : '';
    el.innerHTML = `
        <span class="status-dot is-on" aria-hidden="true"></span>
        <span class="printer-name">${escapeHtml(p.name || p.model || 'Printer')}</span>
        ${p.supplyName ? `<span class="muted">${escapeHtml(p.supplyName)}${p.supplyRemaining != null ? `, ${p.supplyRemaining}% left` : ''}</span>` : ''}
        ${battery ? `<span class="muted">${battery}</span>` : ''}
        <span class="printer-actions">
            <button type="button" class="quiet" data-action="feed">Feed</button>
            <button type="button" class="quiet" data-action="cut">Cut</button>
            <button type="button" class="quiet" data-action="disconnect">Disconnect</button>
        </span>
        ${printerMessageText(p) ? `<p class="printer-problem">${escapeHtml(printerMessageText(p))}</p>` : ''}`;
}

// --- Render: print bar ---------------------------------------------------------------

function currentQueue() {
    const selected = [...state.selected].sort((a, b) => a - b);
    return buildPrintQueue(state.rows, selected, state.options);
}

function renderPrintBar() {
    const bar = $('#printbar');
    const job = state.job;
    const o = state.options;

    if (job && (job.running || job.error)) {
        const done = job.next;
        const total = job.queue.length;
        bar.innerHTML = job.running
            ? `<div class="progress">
                   <p><strong>Printing ${done + 1}–${Math.min(done + o.batchSize, total)} of ${total}</strong></p>
                   <progress max="${total}" value="${done}"></progress>
               </div>
               <button type="button" class="secondary" data-action="stop" ${job.stopRequested ? 'disabled' : ''}>${job.stopRequested ? 'Stopping after this batch…' : 'Stop after this batch'}</button>`
            : `<div class="progress">
                   <p class="print-error"><strong>Stopped after ${plural(done, 'label', 'labels')} of ${total}.</strong> ${escapeHtml(job.error)}</p>
                   <progress max="${total}" value="${done}"></progress>
               </div>
               <button type="button" class="quiet" data-action="cancel-job">Cancel the rest</button>
               <button type="button" class="primary" data-action="resume">Continue from label ${done + 1}</button>`;
        return;
    }

    const queue = currentQueue();
    const rowCount = new Set(queue.map((item) => item.rowIndex)).size;
    const finished = job?.finished ? `<p class="done">Printed ${plural(job.queue.length, 'label', 'labels')}.</p>` : '';

    bar.innerHTML = `
        <div class="summary">
            ${finished}
            <p><strong>${plural(queue.length, 'label', 'labels')}</strong> <span class="muted">from ${plural(rowCount, 'row', 'rows')}</span></p>
        </div>
        <label class="field"><span>Copies</span>
            <input type="number" data-option="copies" value="${o.copies}" min="1" max="99" step="1" ${o.copiesColumn ? 'disabled' : ''}>
        </label>
        <label class="field"><span>Copies from column</span>
            <select data-option="copiesColumn" ${state.headers.length ? '' : 'disabled'}>
                <option value="">None</option>
                ${state.headers.map((h) => `<option value="${escapeHtml(h)}" ${o.copiesColumn === h ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('')}
            </select>
        </label>
        <label class="check"><input type="checkbox" data-option="collate" ${o.collate ? 'checked' : ''}> Collate copies</label>
        <label class="field"><span>Cutting</span>
            <select data-option="cutOption">
                ${CUT_OPTIONS.map((c) => `<option value="${c.value}" ${o.cutOption === c.value ? 'selected' : ''}>${c.label}</option>`).join('')}
            </select>
        </label>
        <div class="print-buttons">
            <button type="button" class="secondary" data-action="print-test" ${state.rows.length && state.bluetooth === 'ok' ? '' : 'disabled'}>Print this label</button>
            <button type="button" class="primary" data-action="print" ${queue.length && state.bluetooth === 'ok' ? '' : 'disabled'}>Print ${plural(queue.length, 'label', 'labels')}</button>
        </div>`;
}

function renderAll() {
    renderData();
    renderDesign();
    renderPreview();
    renderPrinter();
    renderPrintBar();
}

// --- Dialogs -------------------------------------------------------------------------

/** Show a dialog. Resolves to true when the confirm button is pressed. */
function showDialog({ title, body, confirm, cancel }) {
    const dialog = $('#dialog');
    dialog.innerHTML = `
        <form method="dialog">
            <h2>${escapeHtml(title)}</h2>
            <div class="dialog-body">${body}</div>
            <div class="dialog-buttons">
                ${cancel ? `<button value="cancel" class="secondary">${escapeHtml(cancel)}</button>` : ''}
                <button value="ok" class="${cancel ? 'primary' : 'secondary'}">${escapeHtml(confirm)}</button>
            </div>
        </form>`;
    dialog.showModal();
    return new Promise((resolve) => {
        dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    });
}

// --- Printer ---------------------------------------------------------------------------

async function setUpPrinter() {
    try {
        const { createPrinter } = await import('./printer.js');
        state.printerApi = createPrinter((snapshot) => {
            const before = JSON.stringify([state.printer.connected, labelSizeFromPrinter(state.printer), state.printer.supplyName]);
            state.printer = snapshot;
            renderPrinter();
            // Redraw the design when the printer connects, disconnects or gets another cartridge.
            if (before !== JSON.stringify([snapshot.connected, labelSizeFromPrinter(snapshot), snapshot.supplyName])) {
                renderDesign();
                renderPreview();
                renderPrintBar();
            }
        });
        state.bluetooth = await state.printerApi.bluetoothStatus();
    } catch (error) {
        console.error(error);
        state.bluetooth = 'failed';
    }
    renderPrinter();
    renderPrintBar();
}

async function connectPrinter() {
    // While the printer picker is open, the header says that finding the printer can take a while.
    state.connecting = true;
    renderPrinter();
    const started = performance.now();
    let problem = null;
    try {
        problem = await state.printerApi.connect();
    } catch (error) {
        problem = `${error?.name ?? 'Error'}: ${error?.message ?? error}`;
        if (error?.name !== 'NotFoundError') console.error(error);
    } finally {
        state.connecting = false;
        renderPrinter();
    }

    const outcome = connectionOutcome({
        connected: state.printer.connected,
        problem,
        elapsedMs: performance.now() - started,
        desktop: IS_DESKTOP_APP,
    });
    if (outcome === 'unavailable') {
        await showDialog({
            title: 'Bluetooth isn’t available',
            body: `<p>Labelbench couldn’t start looking for printers. Check that Bluetooth is turned on.</p>
                   <p>On a Mac, also open <strong>System Settings → Privacy &amp; Security → Bluetooth</strong> and allow Labelbench. If you started Labelbench from a terminal, allow the terminal app instead.</p>`,
            confirm: 'OK',
        });
    } else if (outcome === 'failed') {
        await showDialog({
            title: 'Couldn’t connect',
            body: `${problem ? `<p>${escapeHtml(problem)}</p>` : ''}<p>Check that the printer is on and close to this computer, then try again. If its Bluetooth light is solid blue, another device may be using it.</p>`,
            confirm: 'OK',
        });
    }
    return state.printer.connected;
}

function useSizeFromPrinter() {
    const size = labelSizeFromPrinter(state.printer);
    if (!size) return;
    // Continuous tape only reports its width; the length stays as designed.
    if (size.widthMm) state.template.widthMm = size.widthMm;
    state.template.heightMm = size.heightMm;
    saveSettings();
    renderDesign();
    renderPreview();
}

// --- Printing ----------------------------------------------------------------------------

/** Render one queue item into the <img> the SDK prints. */
async function printImageFor(row) {
    const { svg } = renderLabel(state.template, row, renderDeps);
    const canvas = await rasterize(svg, {
        widthMm: state.template.widthMm,
        heightMm: state.template.heightMm,
        dpi: state.printer.dpi || 300,
        rotation: state.options.rotation,
        threshold: state.options.threshold,
    });
    return canvasToImage(canvas);
}

async function startPrint(queue) {
    if (!queue.length) return;
    if (!state.printer.connected && !(await connectPrinter())) return;

    // Check every label before printing, so problems show up before the tape is used.
    const problems = [];
    for (const rowIndex of new Set(queue.map((item) => item.rowIndex))) {
        const { warnings } = renderLabel(state.template, state.rows[rowIndex] ?? previewRow(), renderDeps);
        if (warnings.length) problems.push({ rowIndex, warnings });
    }
    const { size: printerSize, mismatch } = cartridgeSize();
    if (mismatch) {
        problems.unshift({ text: `The loaded cartridge prints ${formatSize(printerSize)}, but the design is ${formatSize(state.template)}. Every label will be scaled to fit.` });
    }
    if (problems.length) {
        const list = problems
            .slice(0, 8)
            .map((p) => (p.text ? `<li>${escapeHtml(p.text)}</li>` : `<li><strong>Row ${p.rowIndex + 1}:</strong> ${p.warnings.map(escapeHtml).join(' ')}</li>`))
            .join('');
        const more = problems.length > 8 ? `<p class="muted">…and ${problems.length - 8} more.</p>` : '';
        const go = await showDialog({
            title: problems.some((p) => p.text) ? 'Check before printing' : `${plural(problems.length, 'label needs', 'labels need')} a look`,
            body: `<ul class="problems">${list}</ul>${more}`,
            cancel: 'Go back',
            confirm: 'Print anyway',
        });
        if (!go) return;
    }

    state.job = { queue, next: 0, running: false, stopRequested: false, error: null, finished: false };
    await runJob();
}

async function runJob() {
    const job = state.job;
    const size = state.options.batchSize;
    job.running = true;
    job.error = null;
    job.stopRequested = false;
    renderPrintBar();

    while (job.next < job.queue.length) {
        if (job.stopRequested) {
            job.error = 'You stopped the print.';
            break;
        }

        const batch = job.queue.slice(job.next, job.next + size);
        let printed = false;
        let reason = '';
        try {
            const images = [];
            for (const item of batch) images.push(await printImageFor(item.row));
            printed = await state.printerApi.printImages(images, { cutOption: state.options.cutOption });
        } catch (error) {
            reason = error.message;
        }

        if (!printed) {
            const p = state.printerApi.snapshot();
            job.error =
                printerMessageText(p) ||
                reason ||
                (p.connected ? 'The printer didn’t accept the labels.' : 'The printer disconnected.');
            break;
        }
        job.next += batch.length;
        renderPrintBar();
    }

    job.running = false;
    job.finished = job.next >= job.queue.length;
    if (job.finished) job.error = null;
    renderPrintBar();
}

// --- Events ------------------------------------------------------------------------------

/** Set a value like "code.type" on an object. */
function setPath(target, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((obj, key) => obj[key], target)[last] = value;
}

function readInput(input) {
    if (input.type === 'checkbox') return input.checked;
    if (input.type === 'number' || input.type === 'range') return input.value === '' ? null : Number(input.value);
    return input.value;
}

const actions = {
    'choose-file': () => $('#file-input').click(),
    'load-sample': loadSample,
    'select-all': () => {
        visibleIndexes().forEach((i) => state.selected.add(i));
        renderRows();
        renderPrintBar();
    },
    'select-none': () => {
        visibleIndexes().forEach((i) => state.selected.delete(i));
        renderRows();
        renderPrintBar();
    },
    'prev-row': () => showRow(state.previewIndex - 1),
    'next-row': () => showRow(state.previewIndex + 1),
    'add-line': () => {
        state.template.lines.push({ parts: [], sizeMm: 4.5, bold: false, align: 'left', wrap: true, upper: false });
        changed({ design: true });
        $('.line:last-child [data-parts-editor]')?.focus();
    },
    'dismiss-notice': () => {
        state.notice = null;
        renderDesign();
    },
    'size-from-printer': useSizeFromPrinter,
    'export-template': () => {
        const design = { format: DESIGN_FORMAT, version: 1, ...state.template };
        const blob = new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' });
        const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'label-design.json' });
        link.click();
        URL.revokeObjectURL(link.href);
    },
    'import-template': () => $('#template-input').click(),
    connect: connectPrinter,
    disconnect: () => state.printerApi.disconnect(),
    feed: () => state.printerApi.feed(),
    cut: () => state.printerApi.cut(),
    'print-test': () => startPrint([{ rowIndex: state.previewIndex, row: previewRow() }]),
    print: () => startPrint(currentQueue()),
    stop: () => {
        state.job.stopRequested = true;
        renderPrintBar();
    },
    resume: runJob,
    'cancel-job': () => {
        state.job = null;
        renderPrintBar();
    },
};

function showRow(index) {
    if (index < 0 || index >= state.rows.length) return;
    document.querySelector(`tr[data-row="${state.previewIndex}"]`)?.classList.remove('is-current');
    state.previewIndex = index;
    const tr = document.querySelector(`tr[data-row="${index}"]`);
    tr?.classList.add('is-current');
    tr?.scrollIntoView({ block: 'nearest' });
    renderPreview();
}

/** Something in the design changed: save it and redraw what depends on it. */
function changed({ design = false, printBar = false } = {}) {
    saveSettings();
    if (design) renderDesign();
    if (printBar) renderPrintBar();
    renderPreview();
}

document.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (actionButton && actionButton.tagName !== 'INPUT' && !actionButton.disabled) {
        actions[actionButton.dataset.action]?.();
        return;
    }

    // Column chips: insert the column into the line last typed in.
    const chip = event.target.closest('[data-insert]');
    if (chip) {
        insertIntoLastEditor(chip.dataset.insert, $('.line:last-child [data-parts-editor]'));
        return;
    }

    // Line buttons: bold, move, remove.
    const lineButton = event.target.closest('[data-line-action]');
    if (lineButton) {
        const lines = state.template.lines;
        const i = Number(lineButton.closest('[data-line]').dataset.line);
        const action = lineButton.dataset.lineAction;
        if (action === 'bold') lines[i].bold = !lines[i].bold;
        if (action === 'wrap') lines[i].wrap = !lines[i].wrap;
        if (action === 'upper') lines[i].upper = !lines[i].upper;
        if (action === 'remove') lines.splice(i, 1);
        if (action === 'up' && i > 0) [lines[i - 1], lines[i]] = [lines[i], lines[i - 1]];
        if (action === 'down' && i < lines.length - 1) [lines[i + 1], lines[i]] = [lines[i], lines[i + 1]];
        changed({ design: true });
        return;
    }

    // Clicking a table row shows it in the preview.
    const tr = event.target.closest('tr[data-row]');
    if (tr && !event.target.closest('input')) showRow(Number(tr.dataset.row));
});

// The pill editors report every change here; ids are "code" or "line-<n>".
setUpPartsEditors({
    getColumns: () => state.headers,
    onChange: (id, parts) => {
        if (id === 'code') state.template.code.parts = parts;
        else state.template.lines[Number(id.replace('line-', ''))].parts = parts;
        changed();
    },
});

document.addEventListener('input', (event) => {
    const input = event.target;

    if (input.id === 'filter') {
        state.filter = input.value;
        renderRows();
        return;
    }

    if (input.dataset.field) {
        const value = readInput(input);
        if (value === null || Number.isNaN(value)) return;
        setPath(state.template, input.dataset.field, value);
        // Linear barcodes always go along the bottom.
        if (input.dataset.field === 'code.type') {
            state.template.code.position = CODE_TYPES[value]?.square ? (state.template.code.position === 'right' ? 'right' : 'left') : 'bottom';
        }
        changed({ design: input.tagName === 'SELECT' });
        return;
    }

    if (input.dataset.lineField) {
        const line = state.template.lines[Number(input.closest('[data-line]').dataset.line)];
        const value = readInput(input);
        if (input.dataset.lineField === 'sizePt') {
            if (!value || value <= 0) return;
            line.sizeMm = value * MM_PER_PT;
        } else {
            line[input.dataset.lineField] = value;
        }
        changed();
        return;
    }

    if (input.dataset.option) {
        const value = readInput(input);
        if (value === null || Number.isNaN(value)) return;
        state.options[input.dataset.option] = ['rotation', 'cutOption'].includes(input.dataset.option) ? Number(value) : value;
        if (input.dataset.option === 'copies') state.options.copies = Math.max(1, Math.floor(value));
        saveSettings();
        if (input.type !== 'number') renderPrintBar();
        else renderPrintBarSummary();
        renderPreview();
    }
});

/** Update only the label count while typing in the copies field, so the field keeps focus. */
function renderPrintBarSummary() {
    const queue = currentQueue();
    const rowCount = new Set(queue.map((item) => item.rowIndex)).size;
    const summary = $('#printbar .summary');
    if (summary) summary.innerHTML = `<p><strong>${plural(queue.length, 'label', 'labels')}</strong> <span class="muted">from ${plural(rowCount, 'row', 'rows')}</span></p>`;
    const button = $('[data-action="print"]');
    if (button) {
        button.textContent = `Print ${plural(queue.length, 'label', 'labels')}`;
        button.disabled = !queue.length || state.bluetooth !== 'ok';
    }
}

document.addEventListener('change', (event) => {
    const input = event.target;

    if (input.dataset.check !== undefined) {
        const i = Number(input.dataset.check);
        if (input.checked) state.selected.add(i);
        else state.selected.delete(i);
        input.closest('tr').classList.toggle('is-selected', input.checked);
        renderSelectionCount();
        renderPrintBar();
        return;
    }

    if (input.id === 'check-visible') {
        visibleIndexes().forEach((i) => (input.checked ? state.selected.add(i) : state.selected.delete(i)));
        renderRows();
        renderPrintBar();
        return;
    }

    if (input.dataset.action === 'toggle-raster') {
        state.showRaster = input.checked;
        renderPreview();
        return;
    }

    if (input.id === 'file-input' && input.files[0]) {
        loadFile(input.files[0]);
        input.value = '';
        return;
    }

    if (input.id === 'template-input' && input.files[0]) {
        input.files[0]
            .text()
            .then((text) => {
                const raw = JSON.parse(text);
                if (raw.format !== DESIGN_FORMAT || !Array.isArray(raw.lines)) throw new Error('This file is not a Labelbench label design.');
                state.template = normalizeTemplate(raw);
                state.notice = null;
                changed({ design: true });
            })
            .catch((error) => showDialog({ title: 'Couldn’t open the design', body: `<p>${escapeHtml(error.message)}</p>`, confirm: 'OK' }));
        input.value = '';
    }
});

document.addEventListener('submit', (event) => {
    if (event.target.dataset.form !== 'range') return;
    event.preventDefault();
    const picked = parseRowRange($('#range').value, state.rows.length);
    if (!picked.length) return;
    state.selected = new Set(picked);
    state.filter = '';
    $('#filter').value = '';
    renderRows();
    renderPrintBar();
});

// Dropping a file anywhere on the page loads it (instead of the browser opening it).
document.addEventListener('dragover', (event) => {
    event.preventDefault();
    document.body.classList.add('is-dragging');
});
document.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget) document.body.classList.remove('is-dragging');
});
document.addEventListener('drop', (event) => {
    event.preventDefault();
    document.body.classList.remove('is-dragging');
    const file = event.dataTransfer?.files?.[0];
    if (file) loadFile(file);
});

// Arrow keys step through rows when not typing.
document.addEventListener('keydown', (event) => {
    if (event.target.closest('input, select, textarea, dialog, [contenteditable]') || !state.rows.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') showRow(state.previewIndex + 1);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') showRow(state.previewIndex - 1);
    else return;
    event.preventDefault();
});

// --- Start ---------------------------------------------------------------------------------

loadSettings();
renderAll();
setUpPrinter();
