/**
 * Formula text regressions for multiline planning bookings and escaped labels.
 */

/** Dependencies */
const { test, expect } = require('@playwright/test');

/** Dependencies */
const path = require('path');

// Load the built spreadsheet and its formula peers in a real browser
const setup = async (page) => {

    // Create the worksheet host
    await page.setContent('<div id="sheet"></div>');

    // Load each runtime dependency in order
    for(const script of [require.resolve('jsuites/dist/jsuites.js'), require.resolve('@jspreadsheet/formula'), path.join(__dirname, '../dist/index.js')]){

        // Install the browser script
        await page.addScriptTag({ path: script });

    }

};

// Verify footer counts and referenced text through real edits and row changes
test('footer formulas preserve multiline, quoted, and backslash booking labels', async ({ page }) => {

    // Load the spreadsheet runtime
    await setup(page);

    // Create a worksheet with representative booking labels
    await page.evaluate(() => {

        // Keep the worksheet available to subsequent interactions
        window.formulaSheet = jspreadsheet(document.getElementById('sheet'), {
            worksheets: [{
                data: [
                    ['RodeoFX\ntraining', '=A1'],
                    ['Show "A"', '=A2'],
                    ['C:\\new\\booking', '=A3'],
                    ['line\r\nbreak\ttab', '=A4'],
                    ['', ''],
                ],
                columns: [{ type: 'text' }, { type: 'text' }],
                footers: [['=IFERROR(COUNTA(A:A), 0)', '=IFERROR(COUNTA(B:B), 0)']],
                tableOverflow: true,
                tableHeight: '300px',
                stickyFooter: true,
            }],
        })[0];

    });

    // Check both direct and formula-derived footer counts
    await expect(page.locator('tfoot tr td')).toHaveText(['', '4', '4']);

    // Read the referenced cell values without HTML whitespace normalization
    const values = await page.evaluate(() => window.formulaSheet.options.data.slice(0, 4).map((row, index) => [row[0], window.formulaSheet.executeFormula(`=A${index + 1}`, 1, index)]));

    // Confirm the formula engine preserves the exact label bytes
    for(const [original, calculated] of values){

        // Compare raw and calculated text
        expect(calculated).toBe(original);

    }

    // Edit an empty day to contain two bookings
    await page.evaluate(() => window.formulaSheet.setValue('A5', 'other\nshow'));

    // Count the occupied day once
    await expect(page.locator('tfoot tr td')).toHaveText(['', '5', '4']);

    // Undo the booking edit
    await page.evaluate(() => window.formulaSheet.undo());

    // Restore the previous counts
    await expect(page.locator('tfoot tr td')).toHaveText(['', '4', '4']);

    // Redo the booking edit
    await page.evaluate(() => window.formulaSheet.redo());

    // Restore the edited counts
    await expect(page.locator('tfoot tr td')).toHaveText(['', '5', '4']);

    // Insert another booked row at the end
    await page.evaluate(() => window.formulaSheet.insertRow(['inserted\nbooking', ''], 4));

    // Include the inserted row in the open-ended count
    await expect(page.locator('tfoot tr td')).toHaveText(['', '6', '4']);

    // Remove the inserted row
    await page.evaluate(() => window.formulaSheet.deleteRow(5));

    // Recalculate after the row deletion
    await expect(page.locator('tfoot tr td')).toHaveText(['', '5', '4']);

});
