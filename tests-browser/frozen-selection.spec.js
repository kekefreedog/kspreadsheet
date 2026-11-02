/**
 * Frozen selection backgrounds must obscure cells scrolled beneath them.
 */

/** Dependencies */
const { test, expect } = require('@playwright/test');

/** Dependencies */
const path = require('path');

// Verify both the default palette and a theme with a translucent overlay tint
for(const themed of [false, true]){

    // Check the rendered pixels instead of relying on jsdom's incomplete CSS cascade
    test(`frozen selected cells remain opaque (custom theme: ${themed})`, async ({ page }) => {

        // Create the spreadsheet host
        await page.setContent('<div id="sheet"></div>');

        // Load the vendor styles followed by the optional theme stylesheet
        for(const file of ['node_modules/jsuites/dist/jsuites.css', 'dist/jspreadsheet.css', 'dist/jspreadsheet.themes.css']){

            // Load each stylesheet in consumer order
            await page.addStyleTag({ path: path.join(__dirname, '..', file) });

        }

        // Define the custom theme's opaque surface and translucent selection overlay
        if(themed)
            // Keep the overlay token distinct from the solid frozen-cell highlight
            await page.addStyleTag({ content: '.jss_worksheet { --jss_content_background: #202020; --jss_content_color: white; --jss_content_background_highlighted: #484848; --jss_selection: rgba(255, 255, 255, 0.15); }' });

        // Load the spreadsheet and its peers
        for(const file of ['node_modules/jsuites/dist/jsuites.js', 'node_modules/@jspreadsheet/formula/dist/index.js', 'dist/index.js']){

            // Load each runtime dependency in order
            await page.addScriptTag({ path: path.join(__dirname, '..', file) });

        }

        // Mount a worksheet with bright scrolling cells beneath frozen rows and columns
        await page.evaluate(() => {

            // Expose the worksheet for selection and scrolling checks
            window.frozenSheet = jspreadsheet(document.getElementById('sheet'), { worksheets: [{
                data: Array.from({ length: 20 }, (_, y) => Array.from({ length: 10 }, (_, x) => `${x}:${y}`)),
                columns: Array.from({ length: 10 }, () => ({ width: 120 })),
                tableOverflow: true,
                tableWidth: '650px',
                tableHeight: '400px',
                freezeColumns: 2,
                freezeRows: 1,
                defaultRowHeight: 40,
                style: { D4: 'background-color: #00ffff;', E4: 'background-color: #ff00ff;', B1: 'background-color: #ffcc00;' },
            }] })[0];

            // Scroll colored cells beneath the frozen band
            window.frozenSheet.content.scrollLeft = 260;

            // Scroll regular rows beneath the frozen row
            window.frozenSheet.content.scrollTop = 60;

        });

        // Wait for worksheet initialization
        await page.waitForFunction(() => !!document.getElementById('sheet').spreadsheet);

        // Cover active frozen cells, ranges, frozen rows, and the frozen corner
        for(const range of [[1, 3, 1, 3], [0, 3, 1, 4], [4, 0, 5, 0], [0, 0, 1, 0]]){

            // Select the target range and make the scrolling cells visible
            await page.evaluate(range => {

                // Restore regular cells before comparing their occlusion
                document.querySelectorAll('tbody td:not(.jss_freezed):not(.jss_row_freezed)').forEach(cell => cell.style.visibility = '');

                // Update the selection through the public API
                window.frozenSheet.updateSelectionFromCoords(...range);

            }, range);

            // Locate the selected frozen cell
            const cell = page.locator(`tbody td[data-x="${range[0]}"][data-y="${range[1]}"]`);

            // Require the default or theme's opaque highlighted surface
            await expect(cell).toHaveCSS('background-color', themed ? 'rgb(72, 72, 72)' : 'rgb(243, 243, 243)');

            // Capture the frozen cell with scrolling data visible beneath it
            const visible = await cell.screenshot({ animations: 'disabled' });

            // Hide scrolling data while retaining identical table geometry
            await page.evaluate(() => document.querySelectorAll('tbody td:not(.jss_freezed):not(.jss_row_freezed)').forEach(cell => cell.style.visibility = 'hidden'));

            // Capture the same frozen cell without the underlying data
            const hidden = await cell.screenshot({ animations: 'disabled' });

            // Verify underlying colors and text have no effect on the selected cell's pixels
            expect(visible.equals(hidden)).toBe(true);

        }

        // Verify explicit booking colors still override the default highlight surface
        await expect(page.locator('tbody td[data-x="1"][data-y="0"]')).toHaveCSS('background-color', 'rgb(255, 204, 0)');

    });

}
