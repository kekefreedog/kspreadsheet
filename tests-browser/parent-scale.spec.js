/* global sheet */
const { test, expect } = require('@playwright/test');
const path = require('path');

// Cover ancestor scaling with and without worksheet zoom and frozen cells.
for(const parentScale of ['zoom:0.85', 'zoom:1.25', 'transform:scale(0.85);transform-origin:top left', 'zoom:1']){
    // Keep worksheet zoom independent from its parent scale.
    for(const zoom of [80, 120]){
        // Check both scrolling axes and all selection outline types.
        test(`parent scale ${parentScale}, worksheet zoom ${zoom}`, async ({page}) => {
            // Create a scaled wrapper around a bordered scroll container.
            await page.setContent(`<div id="wrapper" style="${parentScale}"><div id="sheet"></div></div>`);
            // Load the released styles used for selection geometry.
            for(const css of ['node_modules/jsuites/dist/jsuites.css', 'dist/jspreadsheet.css'])
                // Add the stylesheet to the fixture.
                await page.addStyleTag({path:path.join(__dirname, '..', css)});
            // Load the actual built library and its peers.
            for(const script of ['node_modules/jsuites/dist/jsuites.js', 'node_modules/@jspreadsheet/formula/dist/index.js', 'dist/index.js'])
                // Add the runtime script to the fixture.
                await page.addScriptTag({path:path.join(__dirname, '..', script)});
            // Mount a real worksheet with frozen bands and sticky totals.
            await page.evaluate(zoom => {
                // Expose the test worksheet for subsequent measurements.
                window.sheet = jspreadsheet(document.getElementById('sheet'), {worksheets:[{
                    data:Array.from({length:60}, (_,y)=>Array.from({length:12}, (_,x)=>`${x}:${y}`)),
                    columns:Array.from({length:12}, ()=>({width:100})),
                    tableOverflow:true, tableWidth:'650px', tableHeight:'400px',
                    freezeColumns:1, freezeRows:1, stickyFooter:true, footers:[['Total']], defaultZoom:zoom,
                }]})[0];
                // Include nonzero borders in the coordinate conversion.
                sheet.content.style.border = '2px solid black';
            }, zoom);
            // Wait until the async worksheet setup has finished.
            await page.waitForFunction(()=>!!document.getElementById('sheet').spreadsheet);
            // Verify alignment both before and after scrolling.
            for(const scroll of [0, 90]){
                // Select a range away from the frozen bands and footer.
                await page.evaluate(scroll => {
                    // Move the horizontal viewport.
                    sheet.content.scrollLeft = scroll;
                    // Move the vertical viewport.
                    sheet.content.scrollTop = scroll;
                    // Select the range used by all outline types.
                    sheet.updateSelectionFromCoords(3, 9, 4, 10);
                    // Render a matching copy outline using the public clipboard API.
                    sheet.copy();
                }, scroll);
                // Allow scroll handlers and overlay layout to settle.
                await page.waitForTimeout(100);
                // Compare the overlay and cells in the same screen coordinate system.
                const differences = await page.evaluate(() => {
                    // Read the first cell in the selected rectangle.
                    const first = sheet.records[9][3].element.getBoundingClientRect();
                    // Read the last cell in the selected rectangle.
                    const last = sheet.records[10][4].element.getBoundingClientRect();
                    // Measure all visible outlines.
                    const result = [sheet.highlightBorder, sheet.highlightCopy].map(el => {
                        // Read the outline's actual screen rectangle.
                        const rect = el.getBoundingClientRect();
                        // Prepare the four edge differences.
                        const edges = [rect.left-first.left, rect.top-first.top, rect.right-last.right, rect.bottom-last.bottom];
                        // Return the measured differences.
                        return edges;
                    });
                    // Return all outline measurements.
                    return result;
                });
                // Require every edge to match within subpixel rounding tolerance.
                for(const difference of differences.flat())
                    // Check the position error.
                    expect(Math.abs(difference)).toBeLessThanOrEqual(2);
            }
        });
    }
}
