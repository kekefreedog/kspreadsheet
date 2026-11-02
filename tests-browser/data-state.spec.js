/**
 * Preserved Data View Browser Regressions
 *
 * @package    kzarshenas/kspreadsheet
 * @author     kekefreedog <kevin.zarshenas@gmail.com>
 * @copyright  2026 Kévin Zarshenas
 */

/** Dependencies */
const { test, expect } = require('@playwright/test');

// Resolve the built runtime and styles
const path = require('path');

// Check viewport geometry with real scroll and zoom layout
for(const zoom of [80, 100]){

    // Preserve a deep lazy window while earlier rows and new people arrive
    test(`preserves lazy viewport, dimensions and selection at ${zoom}%`, async ({page}) => {

        // Prepare the mounted host
        await page.setContent('<div id="sheet"></div>');

        // Load the real stylesheet
        await page.addStyleTag({path: path.join(__dirname, '../dist/jspreadsheet.css')});

        // Load runtime dependencies in consumer order
        for(const file of ['node_modules/jsuites/dist/jsuites.js', 'node_modules/@jspreadsheet/formula/dist/index.js', 'dist/index.js']){

            // Install the built library in the browser
            await page.addScriptTag({path: path.join(__dirname, '..', file)});

        }

        // Create data larger than the lazy-loading window
        await page.evaluate(zoom => {

            // Mount the real lazy worksheet
            window.sheet = jspreadsheet(document.getElementById('sheet'), {worksheets: [{data: Array.from({length: 400}, (_, y) => Array.from({length: 12}, (_, x) => x ? `Cell ${x}:${y}` : `person-${y}`)), columns: Array.from({length: 12}, () => ({width: 120})), minDimensions: [12, 0], lazyLoading: true, tableOverflow: true, tableWidth: '650px', tableHeight: '380px', freezeColumns: 2, freezeRows: 2, defaultRowHeight: 32, multipleSelection: true}]})[0];

            // Apply the user's zoom before positioning the viewport
            window.sheet.setZoom(zoom);

        }, zoom);

        // Let asynchronous initial setup and zoom settle
        await page.waitForTimeout(100);

        // Advance through real lazy-loading scroll events beyond the initial window
        for(let step = 0; step < 5; step++){

            // Ask the existing scroll handler to load the next batch
            await page.evaluate(() => { window.sheet.content.scrollTop = window.sheet.content.scrollHeight; });

            // Allow the existing wheel throttle to release
            await page.waitForTimeout(150);

        }

        // Place the viewport beyond the initial lazy window
        await page.evaluate(() => {

            // Preserve a resized column
            window.sheet.setWidth(2, 210);

            // Preserve a resized person row
            window.sheet.setHeight(215, 64);

            // Select a person in the deep window
            window.sheet.updateSelectionFromCoords(2, 215, 2, 215);

            // Scroll horizontally past the frozen columns
            window.sheet.content.scrollLeft = 260;

            // Scroll to the middle of the current lazy window
            window.sheet.content.scrollTop = 500;

            // Suppress synthetic paging caused by fixture positioning
            window.sheet.lazyLoadingScrollTop = window.sheet.content.scrollTop;

        });

        // Let scroll events finish before capturing geometry
        await page.waitForTimeout(50);

        // Capture the visible identity and its exact screen offset
        const before = await page.evaluate(() => {

            // Read the real sticky-header boundary
            const top = window.sheet.thead.getBoundingClientRect().bottom;

            // Find the first visible scrolling row
            const row = Array.from(window.sheet.tbody.children).find(row => Number(row.dataset.y) >= 2 && row.getBoundingClientRect().bottom > top);

            // Keep the mounted worksheet identity for replacement checks
            window.previousSheet = window.sheet;

            // Return the viewport anchor and persistent view settings
            return {id: window.sheet.options.data[Number(row.dataset.y)][0], top: row.getBoundingClientRect().top, left: window.sheet.content.scrollLeft, zoom: window.sheet.getZoom()};

        });

        // Publish another snapshot with inserted people ahead of the viewport
        await page.evaluate(() => {

            // Insert stable new identities without mutating the old row arrays
            const incoming = Array.from({length: 40}, (_, y) => Array.from({length: 12}, (_, x) => x ? 'New booking' : `new-${y}`)).concat(window.sheet.options.data.map(row => row.slice()));

            // Replace data using the public preservation option
            window.sheet.setData(incoming, {preserveState: true, rowKey: row => row[0]});

        });

        // Include deferred overlay and scroll event processing in the assertion
        await page.waitForTimeout(100);

        // Capture the retained window size before another progressive update
        const mountedCount = await page.evaluate(() => window.sheet.tbody.children.length);

        // Reapply the same snapshot without growing the frozen-row window
        await page.evaluate(() => window.sheet.setData(window.sheet.options.data.map(row => row.slice()), {preserveState: true, rowKey: row => row[0]}));

        // Allow synthetic scroll and overlay updates to settle again
        await page.waitForTimeout(100);

        // Keep frozen rows from accumulating into the lazy window size
        expect(await page.evaluate(() => window.sheet.tbody.children.length)).toBe(mountedCount);

        // Read actual rendered geometry after the replacement settles
        const after = await page.evaluate(id => {

            // Locate the same visible person in the new snapshot
            const index = window.sheet.options.data.findIndex(row => row[0] === id);

            // Return state that would be lost by a destroy/recreate implementation
            return {same: window.sheet === window.previousSheet, top: window.sheet.rows[index].element.getBoundingClientRect().top, mounted: window.sheet.rows[index].element.parentElement === window.sheet.tbody, left: window.sheet.content.scrollLeft, zoom: window.sheet.getZoom(), width: window.sheet.getWidth(2), selection: window.sheet.selectedCell.map(Number), height: window.sheet.rows[255].element.style.height};

        }, before.id);

        // Retain the actual worksheet instance
        expect(after.same).toBe(true);

        // Keep the same person in the mounted deep lazy window
        expect(after.mounted).toBe(true);

        // Keep its visual position within rounding tolerance
        expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(2);

        // Preserve horizontal scrolling
        expect(after.left).toBe(before.left);

        // Preserve the existing zoom without asynchronous resetting
        expect(after.zoom).toBe(before.zoom);

        // Keep the resized column
        expect(after.width).toBe(210);

        // Follow the selected person past the inserted rows
        expect(after.selection).toEqual([2, 255, 2, 255]);

        // Follow the resized row identity
        expect(after.height).toBe('64px');

    });

}
