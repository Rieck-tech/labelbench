// Brady's Web SDK reports the printer's state as text keys, such as
// "PrinterStatus_HeadOpen_ErrorTitle", and ships no text for them. Some printers send their own
// text instead. This turns either into something to show, or null when all is well.
//
// The wording below is written from the key names; Brady doesn't document them.

const MESSAGES = {
    BatteryLow: {
        title: 'Battery low',
        message: 'The printer’s battery is running low.',
        remedy: 'Charge the printer soon.',
    },
    CutError: {
        title: 'Couldn’t cut',
        message: 'The printer couldn’t cut the label.',
        remedy: 'Check the cutter and the label path, then try again.',
    },
    CutterJammed: {
        title: 'Cutter jammed',
        message: 'The cutter is stuck.',
        remedy: 'Turn the printer off, clear the cutter, then turn it on again.',
    },
    HeadOpen: {
        title: 'Cover open',
        message: 'The printer’s cover is open.',
        remedy: 'Close the cover.',
    },
    InvalidMedia: {
        title: 'Labels not recognised',
        message: 'The printer doesn’t recognise the loaded labels.',
        remedy: 'Load a supported Brady cartridge.',
    },
    LeadingEdge: {
        title: 'Label not found',
        message: 'The printer couldn’t find the start of the label.',
        remedy: 'Take the cartridge out, put it back in, then try again.',
    },
    LowPower: {
        title: 'Battery too low to print',
        message: 'The battery is too low to print.',
        remedy: 'Connect the charger.',
    },
    NoMediaInstalled: {
        title: 'No labels loaded',
        message: 'There’s no label cartridge in the printer.',
        remedy: 'Load a label cartridge.',
    },
    NoRibbonInstalled: {
        title: 'No ribbon',
        message: 'There’s no ribbon in the printer.',
        remedy: 'Install a ribbon.',
    },
    OutOfRibbon: {
        title: 'Ribbon used up',
        message: 'The ribbon has run out.',
        remedy: 'Replace the ribbon.',
    },
    SubstrateOut: {
        title: 'Out of labels',
        message: 'The printer has run out of labels.',
        remedy: 'Load a new cartridge, then continue.',
    },
    SubstrateStall: {
        title: 'Labels stuck',
        message: 'The labels stopped moving through the printer.',
        remedy: 'Open the printer and check that the labels can move freely.',
    },
    SupplyAndRibbonMismatch: {
        title: 'Ribbon and labels don’t match',
        message: 'The loaded ribbon doesn’t go with these labels.',
        remedy: 'Use a ribbon that matches the labels.',
    },
};

// The SDK sometimes uses longer names for the same condition.
const ALIASES = {
    HeadOpenErrorIdentifier: 'HeadOpen',
    LeadingEdgeErrorIdentifier: 'LeadingEdge',
    LowPowerError: 'LowPower',
    SubstrateOutError: 'SubstrateOut',
    SubstrateRemainingOut: 'SubstrateOut',
    SubstrateStallErrorIdentifier: 'SubstrateStall',
};

const KEY = /^PrinterStatus_([A-Za-z]+?)(?:_(?:Title|Description|Remedy|ErrorTitle|ErrorBody|ErrorRemedy))?$/;

/** "TapeTangled" → "Tape tangled" */
const readable = (name) => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/ ([A-Z])/g, (_, c) => ` ${c.toLowerCase()}`);

function translate(value, field) {
    if (!value) return { text: '', initialized: false };
    const match = KEY.exec(value);
    if (!match) return { text: value, initialized: false };

    const base = ALIASES[match[1]] ?? match[1];
    if (base === 'Initialized') return { text: '', initialized: true };
    const known = MESSAGES[base];
    if (known) return { text: known[field], initialized: false };
    return { text: field === 'title' ? readable(base) : '', initialized: false };
}

/**
 * The printer's current message as { title, message, remedy } in plain English,
 * or null when there is nothing to report.
 */
export function printerMessage({ messageTitle, message, messageRemedy }) {
    const title = translate(messageTitle, 'title');
    const body = translate(message, 'message');
    const remedy = translate(messageRemedy, 'remedy');

    if (!title.text && !body.text && !remedy.text) return null;
    if (title.initialized || body.initialized) return null;
    return { title: title.text, message: body.text, remedy: remedy.text };
}

/** The printer's message as one line of sentences, or '' when there is nothing to report. */
export function printerMessageText(status) {
    const result = printerMessage(status);
    if (!result) return '';
    return [result.title, result.message, result.remedy]
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => (/[.!?…]$/.test(part) ? part : `${part}.`))
        .join(' ');
}
