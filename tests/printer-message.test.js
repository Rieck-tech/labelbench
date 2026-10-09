import { describe, it, expect } from 'vitest';
import { printerMessage, printerMessageText } from '../src/lib/printer-message.js';

const keys = (base, { title = '_Title', message = '', remedy = '_Remedy' } = {}) => ({
    messageTitle: `${base}${title}`,
    message: `${base}${message}`,
    messageRemedy: `${base}${remedy}`,
});

describe('printerMessage', () => {
    it('shows nothing for the normal connected state', () => {
        expect(printerMessage(keys('PrinterStatus_Initialized'))).toBeNull();
    });

    it('shows nothing when there is no message', () => {
        expect(printerMessage({ messageTitle: '', message: '', messageRemedy: '' })).toBeNull();
        expect(printerMessage({})).toBeNull();
    });

    it('turns the SDK\'s keys into English', () => {
        const result = printerMessage({
            messageTitle: 'PrinterStatus_HeadOpen_ErrorTitle',
            message: 'PrinterStatus_HeadOpen_ErrorBody',
            messageRemedy: 'PrinterStatus_HeadOpen_ErrorRemedy',
        });
        expect(result).toEqual({
            title: 'Cover open',
            message: 'The printer’s cover is open.',
            remedy: 'Close the cover.',
        });
    });

    it('knows every key the SDK can send', () => {
        const all = [
            keys('PrinterStatus_BatteryLow', { message: '_Description' }),
            keys('PrinterStatus_CutError'),
            keys('PrinterStatus_CutterJammed', { message: '_Description' }),
            keys('PrinterStatus_HeadOpenErrorIdentifier'),
            keys('PrinterStatus_InvalidMedia', { message: '_Description' }),
            keys('PrinterStatus_LeadingEdgeErrorIdentifier'),
            keys('PrinterStatus_LowPowerError'),
            keys('PrinterStatus_NoMediaInstalled', { title: '_ErrorTitle', message: '_ErrorBody', remedy: '_ErrorRemedy' }),
            keys('PrinterStatus_NoRibbonInstalled', { title: '_ErrorTitle', message: '_ErrorBody', remedy: '_ErrorRemedy' }),
            keys('PrinterStatus_OutOfRibbon', { title: '_ErrorTitle', message: '_ErrorBody', remedy: '_ErrorRemedy' }),
            keys('PrinterStatus_SubstrateOutError'),
            keys('PrinterStatus_SubstrateRemainingOut', { message: '_Description' }),
            keys('PrinterStatus_SubstrateStallErrorIdentifier'),
            keys('PrinterStatus_SupplyAndRibbonMismatch', { message: '_Description' }),
        ];
        for (const status of all) {
            const result = printerMessage(status);
            for (const text of Object.values(result)) {
                expect(text, JSON.stringify(status)).not.toMatch(/PrinterStatus_|_/);
            }
            expect(result.title, JSON.stringify(status)).toBeTruthy();
            // A real message, not just the readable fallback that unknown keys get.
            expect(result.message, JSON.stringify(status)).toBeTruthy();
            expect(result.remedy, JSON.stringify(status)).toBeTruthy();
        }
    });

    it('passes on text the printer sends itself', () => {
        expect(printerMessage({ messageTitle: 'Ribbon low', message: 'About 10% of the ribbon is left.', messageRemedy: '' })).toEqual({
            title: 'Ribbon low',
            message: 'About 10% of the ribbon is left.',
            remedy: '',
        });
    });

    it('makes an unknown key readable instead of showing it raw', () => {
        const result = printerMessage({ messageTitle: 'PrinterStatus_TapeTangled_Title', message: 'PrinterStatus_TapeTangled', messageRemedy: '' });
        expect(result.title).toBe('Tape tangled');
        expect(result.message).toBe('');
    });
});

describe('printerMessageText', () => {
    it('is empty when all is well', () => {
        expect(printerMessageText({ messageTitle: 'PrinterStatus_Initialized_Title', message: 'PrinterStatus_Initialized', messageRemedy: 'PrinterStatus_Initialized_Remedy' })).toBe('');
    });

    it('joins title, message and remedy as sentences, without doubling full stops', () => {
        expect(printerMessageText({ messageTitle: 'PrinterStatus_HeadOpen_ErrorTitle', message: 'PrinterStatus_HeadOpen_ErrorBody', messageRemedy: 'PrinterStatus_HeadOpen_ErrorRemedy' }))
            .toBe('Cover open. The printer’s cover is open. Close the cover.');
        expect(printerMessageText({ messageTitle: 'Ribbon low', message: 'Replace it soon!', messageRemedy: '' })).toBe('Ribbon low. Replace it soon!');
    });
});
