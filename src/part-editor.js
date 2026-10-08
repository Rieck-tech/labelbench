// An editable line of label text where columns appear as pills.
//
// You type fixed text as usual. Press "{" or click "Insert column" to open a
// searchable list of the file's columns; the chosen one is inserted as a pill
// at the cursor. A pill is removed with Backspace like a single character.
//
// The editor is a contenteditable <div>. Text is kept in text nodes and each
// column is a <span data-column="…" contenteditable="false">. partsFromEditor()
// reads that back into the list-of-parts format used by the label layout.

import { normalizeParts } from './lib/parts.js';

const ZERO_WIDTH = '​'; // Gives the cursor somewhere to sit after a pill at the end.

const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function pillHtml(column, known) {
    const missing = known && !known.includes(column);
    return `<span class="pill${missing ? ' is-missing' : ''}" contenteditable="false" data-column="${escapeHtml(column)}"${
        missing ? ' title="This column isn’t in the current file"' : ''
    }>${escapeHtml(column)}</span>`;
}

/**
 * HTML for one editor. `id` identifies it in onChange; `columns` (optional) marks
 * pills whose column isn't in the loaded file.
 */
export function partsEditorHtml({ id, parts, label, placeholder = '', columns = null }) {
    const content = (parts ?? [])
        .map((part) => ('column' in part ? pillHtml(part.column, columns) + ZERO_WIDTH : escapeHtml(part.text)))
        .join('');
    return `
        <div class="parts-field">
            <div class="parts-editor" contenteditable="true" role="textbox" spellcheck="false"
                 aria-label="${escapeHtml(label)}" data-parts-editor="${escapeHtml(id)}"
                 data-placeholder="${escapeHtml(placeholder)}">${content}</div>
            <button type="button" class="quiet insert-column" data-insert-column="${escapeHtml(id)}" aria-haspopup="listbox">Insert column</button>
        </div>`;
}

/** Read an editor's content back into parts. */
export function partsFromEditor(editor) {
    const parts = [];
    const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            parts.push({ text: node.data.replaceAll(ZERO_WIDTH, '').replace(/[\r\n]+/g, ' ').replace(/ /g, ' ') });
        } else if (node.dataset?.column !== undefined) {
            parts.push({ column: node.dataset.column });
        } else if (node.nodeName !== 'BR') {
            node.childNodes.forEach(walk);
        }
    };
    editor.childNodes.forEach(walk);
    return normalizeParts(parts);
}

// --- Column menu, shared by all editors ----------------------------------------------

let menu;
let target = null; // { editor, range } the menu will insert into
let options = { getColumns: () => [], onChange: () => {} };
let lastCaret = null; // { editor, range } where the cursor last was in any editor

function buildMenu() {
    menu = document.createElement('div');
    menu.className = 'column-menu';
    menu.hidden = true;
    menu.innerHTML = `
        <input type="search" class="column-search" placeholder="Search columns" aria-label="Search columns"
               role="combobox" aria-expanded="true" aria-controls="column-options" aria-autocomplete="list">
        <ul class="column-options" id="column-options" role="listbox" aria-label="Columns"></ul>`;
    document.body.append(menu);

    const search = menu.querySelector('.column-search');
    search.addEventListener('input', () => renderOptions());
    search.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            moveActive(event.key === 'ArrowDown' ? 1 : -1);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const active = menu.querySelector('[aria-selected="true"]');
            if (active) choose(active.dataset.value);
        } else if (event.key === 'Escape' || event.key === 'Tab') {
            event.preventDefault();
            closeMenu({ restoreFocus: true });
        }
    });
    menu.addEventListener('mousedown', (event) => {
        // Keep focus in the search box while clicking an option.
        if (event.target.closest('[role="option"]')) event.preventDefault();
    });
    menu.addEventListener('click', (event) => {
        const option = event.target.closest('[role="option"]');
        if (option) choose(option.dataset.value);
    });
}

function renderOptions() {
    const query = menu.querySelector('.column-search').value.trim().toLocaleLowerCase();
    const columns = options.getColumns();
    const matches = columns.filter((column) => column.toLocaleLowerCase().includes(query));
    const list = menu.querySelector('.column-options');

    if (!columns.length) {
        list.innerHTML = '<li class="column-empty">Load a file to see its columns.</li>';
        return;
    }
    list.innerHTML = matches.length
        ? matches
              .map(
                  (column, i) =>
                      `<li role="option" id="column-option-${i}" data-value="${escapeHtml(column)}" aria-selected="${i === 0}">${escapeHtml(column)}</li>`,
              )
              .join('')
        : `<li class="column-empty">No column matches “${escapeHtml(query)}”.</li>`;
    updateActiveDescendant();
}

function moveActive(step) {
    const items = [...menu.querySelectorAll('[role="option"]')];
    if (!items.length) return;
    const current = items.findIndex((item) => item.getAttribute('aria-selected') === 'true');
    const next = (current + step + items.length) % items.length;
    items.forEach((item, i) => item.setAttribute('aria-selected', String(i === next)));
    items[next].scrollIntoView({ block: 'nearest' });
    updateActiveDescendant();
}

function updateActiveDescendant() {
    const active = menu.querySelector('[aria-selected="true"]');
    const search = menu.querySelector('.column-search');
    if (active) search.setAttribute('aria-activedescendant', active.id);
    else search.removeAttribute('aria-activedescendant');
}

/** Where to insert: the given range if it's inside the editor, otherwise the end. */
function rangeIn(editor, range) {
    if (range && editor.contains(range.startContainer)) return range.cloneRange();
    const end = document.createRange();
    end.selectNodeContents(editor);
    end.collapse(false);
    return end;
}

function openMenu(editor, range, anchor) {
    if (!menu) buildMenu();
    target = { editor, range: rangeIn(editor, range) };

    // Place the menu under the cursor if we know where it is, else under the anchor.
    const caretBox = target.range.getClientRects()[0];
    const box = caretBox && caretBox.height ? caretBox : (anchor ?? editor).getBoundingClientRect();
    menu.hidden = false;
    const width = menu.offsetWidth;
    menu.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - width - 8))}px`;
    const search = menu.querySelector('.column-search');
    search.value = '';
    renderOptions();

    // Open upwards when there isn't room below (the print bar covers the bottom of the window).
    const printBar = document.querySelector('.printbar')?.getBoundingClientRect().top ?? window.innerHeight;
    const roomBelow = Math.min(window.innerHeight, printBar) - box.bottom - 8;
    const height = menu.offsetHeight;
    menu.style.top = `${height > roomBelow && box.top > height + 8 ? box.top - height - 4 : box.bottom + 4}px`;
    search.focus();
}

function closeMenu({ restoreFocus = false } = {}) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    if (restoreFocus && target) {
        target.editor.focus();
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(target.range);
    }
    target = null;
}

/** Insert a column pill into an editor at a range, and put the cursor after it. */
function insertColumn(editor, range, column) {
    const holder = document.createElement('span');
    holder.innerHTML = pillHtml(column, options.getColumns());
    const pill = holder.firstChild;
    const after = document.createTextNode(ZERO_WIDTH);

    range.deleteContents();
    range.insertNode(after);
    range.insertNode(pill);
    editor.normalize(); // Merge the text fragments that splitting left behind.

    editor.focus();
    const caret = document.createRange();
    caret.setStartAfter(after);
    caret.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(caret);

    options.onChange(editor.dataset.partsEditor, partsFromEditor(editor));
}

function choose(column) {
    if (!target) return;
    const { editor, range } = target;
    menu.hidden = true;
    target = null;
    insertColumn(editor, range, column);
}

const isBlankText = (node) => node?.nodeType === Node.TEXT_NODE && node.data.replaceAll(ZERO_WIDTH, '') === '';

/** The pill just before a node, looking past empty bits of text. Returns [pill, blanks] or null. */
function pillBefore(node) {
    const blanks = [];
    let current = node;
    while (isBlankText(current)) {
        blanks.push(current);
        current = current.previousSibling;
    }
    return current?.dataset?.column !== undefined ? [current, blanks] : null;
}

/**
 * Backspace right after a pill: the cursor sits behind an invisible character,
 * so remove that and the pill together. Returns true when it did.
 */
function removePillBeforeCaret(editor) {
    const selection = window.getSelection();
    if (!selection.rangeCount || !selection.isCollapsed) return false;
    const { startContainer: node, startOffset: offset } = selection.getRangeAt(0);

    let found;
    const caret = document.createRange();

    if (node === editor) {
        // Cursor placed directly in the editor, after a pill and maybe some empty text.
        const before = editor.childNodes[offset - 1];
        found = before && pillBefore(before);
        if (!found) return false;
        caret.setStartAfter(found[0]);
    } else {
        // Cursor in text: only when nothing visible sits between it and the pill.
        if (node.nodeType !== Node.TEXT_NODE || node.data.slice(0, offset).replaceAll(ZERO_WIDTH, '') !== '') return false;
        found = node.previousSibling && pillBefore(node.previousSibling);
        if (!found) return false;
        node.deleteData(0, offset);
        caret.setStart(node, 0);
    }

    const [pill, blanks] = found;
    blanks.forEach((blank) => blank.remove());
    if (node === editor) caret.setStartBefore(pill);
    pill.remove();
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
    options.onChange(editor.dataset.partsEditor, partsFromEditor(editor));
    return true;
}

/** Insert a column into the editor the user was last typing in (used by the column chips). */
export function insertIntoLastEditor(column, fallbackEditor) {
    const editor = lastCaret && document.contains(lastCaret.editor) ? lastCaret.editor : fallbackEditor;
    if (!editor) return;
    insertColumn(editor, rangeIn(editor, lastCaret?.editor === editor ? lastCaret.range : null), column);
}

/**
 * Wire up all editors on the page (now and later). Call once.
 * getColumns() returns the loaded file's column names; onChange(id, parts) is
 * called whenever an editor's content changes.
 */
export function setUpPartsEditors(setup) {
    options = { ...options, ...setup };
    const editorOf = (node) => node?.closest?.('[data-parts-editor]');

    document.addEventListener('keydown', (event) => {
        const editor = editorOf(event.target);
        if (!editor) return;
        if (event.key === 'Enter') {
            event.preventDefault(); // One line only.
        } else if (event.key === 'Backspace' && removePillBeforeCaret(editor)) {
            event.preventDefault();
        } else if (event.key === '{') {
            event.preventDefault();
            const selection = window.getSelection();
            openMenu(editor, selection.rangeCount ? selection.getRangeAt(0) : null);
        }
    });

    document.addEventListener('input', (event) => {
        const editor = editorOf(event.target);
        if (!editor) return;
        const parts = partsFromEditor(editor);
        if (!parts.length && editor.innerHTML !== '') editor.innerHTML = ''; // Show the placeholder again.
        options.onChange(editor.dataset.partsEditor, parts);
    });

    // Paste as plain text on one line, so no formatting or markup gets in.
    document.addEventListener('paste', (event) => {
        const editor = editorOf(event.target);
        if (!editor) return;
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' ');
        document.execCommand('insertText', false, text);
    });

    // Remember where the cursor was, for the column chips and the Insert column button.
    document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const editor = editorOf(selection.anchorNode?.parentElement ?? null) ?? editorOf(selection.anchorNode);
        if (editor) lastCaret = { editor, range: selection.getRangeAt(0).cloneRange() };
    });

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-insert-column]');
        if (button) {
            const editor = document.querySelector(`[data-parts-editor="${CSS.escape(button.dataset.insertColumn)}"]`);
            if (editor) openMenu(editor, lastCaret?.editor === editor ? lastCaret.range : null, button);
            return;
        }
        if (menu && !menu.hidden && !menu.contains(event.target)) closeMenu();
    });

    window.addEventListener('resize', () => closeMenu());
    document.addEventListener(
        'scroll',
        (event) => {
            if (!menu?.contains(event.target)) closeMenu();
        },
        true,
    );
}
