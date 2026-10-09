import { describe, it, expect } from 'vitest';
import { decodeText } from '../src/lib/decode.js';

describe('decodeText', () => {
    it('decodes UTF-8', () => {
        const bytes = new TextEncoder().encode('Café Müller, Ørsted Straße');
        expect(decodeText(bytes.buffer)).toBe('Café Müller, Ørsted Straße');
    });

    it('falls back to Windows-1252 when the bytes are not valid UTF-8', () => {
        // "Café" as saved by older Excel on Windows: é = 0xE9
        const bytes = new Uint8Array([0x43, 0x61, 0x66, 0xe9]);
        expect(decodeText(bytes.buffer)).toBe('Café');
    });
});
