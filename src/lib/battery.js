// The printer reports its battery as one of four levels, shown as four lights on the printer.
// The SDK turns them into 100, 75, 50 and 11 %, which reads as more precise than it is, so
// Labelbench shows bars like the printer's lights instead.

/** { bars: 1–4, low } for a battery percentage, or null when it isn't known. */
export function batteryBars(percent) {
    if (percent == null) return null;
    const bars = Math.min(4, Math.max(1, Math.ceil(percent / 25)));
    // 11 % is how the SDK reports the printer's Low level.
    return { bars, low: percent <= 11 };
}
