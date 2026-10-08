import { describe, it, expect } from 'vitest';
import { fillTemplate, placeholdersIn } from '../src/lib/template.js';

describe('fillTemplate', () => {
    const row = { title: 'Kjøkken', 'Antall stk': '10', code: 'LBL-0001' };

    it('replaces {{column}} with the value from the row', () => {
        expect(fillTemplate('{{title}} – {{code}}', row)).toBe('Kjøkken – LBL-0001');
    });

    it('allows spaces and Norwegian letters in column names, and spaces inside the braces', () => {
        expect(fillTemplate('{{ Antall stk }} stk', row)).toBe('10 stk');
    });

    it('replaces unknown columns with nothing', () => {
        expect(fillTemplate('[{{missing}}]', row)).toBe('[]');
    });

    it('leaves text without placeholders alone', () => {
        expect(fillTemplate('Fast tekst', row)).toBe('Fast tekst');
    });

    it('supports upper and lower case filters', () => {
        expect(fillTemplate('{{title|upper}}', row)).toBe('KJØKKEN');
        expect(fillTemplate('{{title | lower}}', row)).toBe('kjøkken');
    });

    it('treats null or undefined templates as empty', () => {
        expect(fillTemplate(undefined, row)).toBe('');
    });
});

describe('placeholdersIn', () => {
    it('lists the column names a template uses', () => {
        expect(placeholdersIn('{{a}} og {{ b c|upper }}')).toEqual(['a', 'b c']);
    });
});
