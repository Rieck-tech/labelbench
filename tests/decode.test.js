import { describe, it, expect } from 'vitest';
import { decodeText } from '../src/lib/decode.js';

describe('decodeText', () => {
    it('decodes UTF-8', () => {
        const bytes = new TextEncoder().encode('Bøker og skøyter');
        expect(decodeText(bytes.buffer)).toBe('Bøker og skøyter');
    });

    it('falls back to Windows-1252 when the bytes are not valid UTF-8', () => {
        // "Bøker" as saved by older Excel on Windows: ø = 0xF8
        const bytes = new Uint8Array([0x42, 0xf8, 0x6b, 0x65, 0x72]);
        expect(decodeText(bytes.buffer)).toBe('Bøker');
    });
});
