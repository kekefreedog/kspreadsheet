const { expect } = require('chai');

const jspreadsheet = require('../dist/index.js');

/**
 * The lazy loading is driven entirely by the geometry of `.jss_content` : the height of the
 * viewport, the height of the loaded rows and `scrollTop`. jsdom has no layout, so all three read 0
 * and nothing can be exercised without standing in for it. `fakeLayout` gives the rows a fixed
 * height, the viewport a fixed height, makes `scrollHeight` follow the rows that are actually
 * loaded (there is no spacer for the rows that are not) and turns `scrollTop` into a stored value
 * clamped the way a browser clamps it.
 *
 * The numbers are the ones of the Rodeo planning, where the window used to break : rows of 17px and
 * a viewport of 940px, so the historical window of 100 rows is only 1.8 viewports tall.
 */
const rowHeight = 17;
const viewportHeight = 940;
const totalRows = 400;

const sleep = function (ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
};

const createWorksheet = function () {
    const data = [];
    for (let y = 0; y < totalRows; y++) {
        data.push(['row ' + y, y, '']);
    }

    const worksheet = jspreadsheet(root, {
        worksheets: [
            {
                data: data,
                tableOverflow: true,
                tableHeight: viewportHeight + 'px',
                lazyLoading: true,
            },
        ],
    })[0];

    const content = worksheet.content;
    const tbody = worksheet.tbody;
    let scrollTop = 0;

    const loadedHeight = function () {
        return tbody.children.length * rowHeight;
    };

    Object.defineProperty(tbody, 'offsetHeight', { get: loadedHeight, configurable: true });

    Object.defineProperty(content, 'clientHeight', { get: () => viewportHeight, configurable: true });
    Object.defineProperty(content, 'scrollHeight', { get: loadedHeight, configurable: true });
    Object.defineProperty(content, 'scrollTop', {
        get: () => scrollTop,
        set: (value) => {
            const maximum = Math.max(0, loadedHeight() - viewportHeight);
            scrollTop = Math.min(Math.max(0, value), maximum);
        },
        configurable: true,
    });

    // A row is only positioned while it is part of the loaded window
    worksheet.rows.forEach(function (row) {
        Object.defineProperty(row.element, 'offsetTop', {
            get: () => {
                const index = Array.prototype.indexOf.call(tbody.children, row.element);

                return index < 0 ? 0 : index * rowHeight;
            },
            configurable: true,
        });
    });

    return worksheet;
};

/**
 * Rows of the sheet the window currently holds, by their original index
 */
const loadedRows = function (worksheet) {
    return Array.prototype.map.call(worksheet.tbody.children, function (row) {
        return parseInt(row.getAttribute('data-y'));
    });
};

/**
 * Row the user has under the top edge of the viewport
 */
const rowAtViewportTop = function (worksheet) {
    return loadedRows(worksheet)[Math.floor(worksheet.content.scrollTop / rowHeight)];
};

/**
 * Report a scroll the way the browser does, then leave the 100ms throttle of the handler run out
 */
const reportScroll = async function (worksheet) {
    worksheet.content.dispatchEvent(new Event('scroll'));
    await sleep(150);
};

const scrollTo = async function (worksheet, position) {
    worksheet.content.scrollTop = position;
    await reportScroll(worksheet);
};

describe('Use the lazy loading', () => {
    it('slides the window down instead of snapping back on the first row', async function () {
        this.timeout(20000);

        const worksheet = createWorksheet();

        // The first page is loaded, and only that
        expect(loadedRows(worksheet)[0]).to.equal(0);
        expect(worksheet.tbody.children.length).to.equal(100);

        let previous = loadedRows(worksheet);

        for (let tick = 0; tick < 8; tick++) {
            // Scroll to the end of what is loaded, which is what asks for the next batch
            await scrollTo(worksheet, worksheet.content.scrollHeight);

            /**
             * A batch corrects `scrollTop`, and the browser reports that correction as a scroll of
             * its own, at a position the user never asked for. That report is the second half of the
             * reported bug : it used to arrive inside the "near the top" band, where it snapped the
             * window back to the first page.
             */
            await reportScroll(worksheet);

            const rows = loadedRows(worksheet);

            // The window never goes back towards the head of the sheet while scrolling down. This is
            // the reported bug : the correction of the batch used to land the viewport in the "near
            // the top" band, which snapped the window back to the first page and restarted the row
            // numbers at 1.
            expect(rows[0]).to.be.at.least(previous[0]);

            // And it stays one contiguous block of rows
            expect(rows[rows.length - 1] - rows[0]).to.equal(rows.length - 1);

            previous = rows;
        }

        // Eight batches did move the window past the first page
        expect(previous[0]).to.be.above(100);
    });

    it('keeps the window taller than the viewport', async function () {
        this.timeout(20000);

        const worksheet = createWorksheet();

        // Fill the window up, the first batches only append
        for (let tick = 0; tick < 5; tick++) {
            await scrollTo(worksheet, worksheet.content.scrollHeight);
        }

        /**
         * Three viewports of rows. A window of less than two put the "near the top" and the "near
         * the bottom" bands over the same pixels, and the same scroll tick then answered with a
         * batch up and a batch down that undid each other.
         */
        expect(worksheet.tbody.children.length * rowHeight).to.be.at.least(viewportHeight * 2);
    });

    it('keeps the rows of the viewport in place when the window slides', async function () {
        this.timeout(20000);

        const worksheet = createWorksheet();

        // Fill the window up first, so the next batch has to evict rows above the viewport
        for (let tick = 0; tick < 5; tick++) {
            await scrollTo(worksheet, worksheet.content.scrollHeight);
        }

        // Ask for a batch, and read what the user has under the top edge before it arrives
        worksheet.content.scrollTop = worksheet.content.scrollHeight;
        const anchored = rowAtViewportTop(worksheet);

        await reportScroll(worksheet);

        // Evicting the rows above the viewport moved every remaining row up by their height, so
        // `scrollTop` has to follow. It used to be corrected by a whole viewport instead.
        expect(loadedRows(worksheet)).to.not.deep.equal([]);
        expect(rowAtViewportTop(worksheet)).to.equal(anchored);
    });

    it('loads the rows above rather than jumping back to the first page', async function () {
        this.timeout(20000);

        const worksheet = createWorksheet();

        // Take the window away from the head of the sheet
        for (let tick = 0; tick < 6; tick++) {
            await scrollTo(worksheet, worksheet.content.scrollHeight);
        }

        const first = loadedRows(worksheet)[0];
        expect(first).to.be.above(0);

        // Reaching the top edge of the window
        await scrollTo(worksheet, 0);

        const rows = loadedRows(worksheet);

        // The rows just above are loaded, the window does not snap to the first page
        expect(rows[0]).to.be.below(first);
        expect(rows[0]).to.be.above(0);

        // And the viewport followed them down, so the user is not stuck against the top edge
        expect(worksheet.content.scrollTop).to.be.above(0);
    });

    it('does not answer the scroll report of its own correction', async function () {
        this.timeout(20000);

        const worksheet = createWorksheet();

        for (let tick = 0; tick < 5; tick++) {
            await scrollTo(worksheet, worksheet.content.scrollHeight);
        }

        /**
         * A correction of the window is reported as a scroll like any other. Answering it with
         * another batch corrects the scroll again, which is reported again : the window would walk
         * through the whole sheet with nobody touching the wheel. Here the viewport sits in the band
         * that asks for a batch, but at the exact position the last correction left it.
         */
        worksheet.content.scrollTop = worksheet.content.scrollHeight;
        worksheet.lazyLoadingScrollTop = worksheet.content.scrollTop;

        const before = loadedRows(worksheet);

        await reportScroll(worksheet);

        expect(loadedRows(worksheet)).to.deep.equal(before);

        // The same position reported after the user moved is served
        worksheet.lazyLoadingScrollTop = null;

        await reportScroll(worksheet);

        expect(loadedRows(worksheet)).to.not.deep.equal(before);
    });
});
