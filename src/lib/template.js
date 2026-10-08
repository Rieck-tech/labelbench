/**
 * Placeholders look like {{column name}}, with an optional filter: {{column|upper}}.
 */
const PLACEHOLDER = /\{\{\s*([^{}|]+?)\s*(?:\|\s*(\w+)\s*)?\}\}/g;

const FILTERS = {
    upper: (text) => text.toLocaleUpperCase('nb'),
    lower: (text) => text.toLocaleLowerCase('nb'),
    trim: (text) => text.trim(),
};

/** Replace every {{column}} in the template with that column's value from the row. */
export function fillTemplate(template, row) {
    return String(template ?? '').replace(PLACEHOLDER, (_, name, filter) => {
        const value = String(row?.[name] ?? '');
        return filter && FILTERS[filter] ? FILTERS[filter](value) : value;
    });
}

/** List the column names a template refers to. */
export function placeholdersIn(template) {
    return [...String(template ?? '').matchAll(PLACEHOLDER)].map((match) => match[1]);
}
