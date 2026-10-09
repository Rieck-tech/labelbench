/**
 * Read file bytes as text. Tries UTF-8 first; if the bytes are not valid UTF-8
 * (typical for CSV saved by older Excel on Windows), falls back to Windows-1252,
 * which covers accented Latin letters such as é, ü and ø.
 */
export function decodeText(buffer) {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
        return new TextDecoder('windows-1252').decode(buffer);
    }
}
