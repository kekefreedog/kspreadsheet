/**
 * Formula text escaping regressions.
 */

/** Dependencies */
const { expect } = require('chai');

/** Dependencies */
const jspreadsheet = require('../dist/index.js');

// Group reference serialization checks
describe('Formula text references', () => {

    // Check control characters and characters that previously broke string literals
    for(const value of ['RodeoFX\ntraining', 'Show "A"', 'C:\\new\\booking', 'line\r\nbreak\ttab', 'Unicode\u2028separator\u2029text']){

        // Verify the value is preserved through formula reference resolution
        it(`preserves ${JSON.stringify(value)}`, () => {

            // Create a text reference without a named spreadsheet function
            const [worksheet] = jspreadsheet(root, { worksheets: [{ data: [[value, '=A1']] }] });

            // Compare the calculated value with the original text
            expect(worksheet.executeFormula('=A1', 1, 0)).to.equal(value);

        });

    }

});
