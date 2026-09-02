// Get width of all freezed cells together, including the always-pinned row-number column
export const getFreezeWidth = function () {
    const obj = this;

    let width = 0;
    if (obj.options.freezeColumns > 0) {
        width = obj.table.querySelector('.jss_selectall')?.offsetWidth || 0;

        for (let i = 0; i < obj.options.freezeColumns; i++) {
            let columnWidth;
            if (obj.options.columns && obj.options.columns[i] && obj.options.columns[i].width !== undefined) {
                columnWidth = parseInt(obj.options.columns[i].width);
            } else {
                columnWidth = obj.options.defaultColWidth !== undefined ? parseInt(obj.options.defaultColWidth) : 100;
            }

            width += columnWidth;
        }
    }
    return width;
};

/**
 * Get the width of a single column, honoring configured width / defaultColWidth.
 */
const getColumnWidth = function (obj, columnIndex) {
    if (obj.options.columns && obj.options.columns[columnIndex] && obj.options.columns[columnIndex].width !== undefined) {
        return parseInt(obj.options.columns[columnIndex].width);
    }
    return obj.options.defaultColWidth !== undefined ? parseInt(obj.options.defaultColWidth) : 100;
};

/**
 * Pin the frozen columns (headers, filter cells, body cells, nested headers) at their
 * resting `left` offset using CSS `position: sticky`.
 *
 * This only needs to run when column geometry changes (mount, data reload, resize,
 * hide/show, insert/delete/move column) — NOT on every scroll event. Once `left` is set,
 * the browser's sticky positioning keeps the column pinned during scroll with no further
 * JS work, unlike the old scroll-driven `position: relative` + per-tick recalculation.
 */
export const updateFrozenColumnOffsets = function () {
    const obj = this;

    if (!obj.options.freezeColumns) {
        return;
    }

    const filterTds = obj.element.querySelectorAll('td.jss_column_filter');

    // The row-number column is always pinned at left:0 (see jspreadsheet.css), so frozen
    // data columns must start their offset after it, not at 0, or the two overlap.
    const indexColWidth = obj.table.querySelector('.jss_selectall')?.offsetWidth || 0;

    let width = indexColWidth;
    for (let i = 0; i < obj.options.freezeColumns; i++) {
        if (i > 0) {
            // Must check if the previous column is hidden or not
            if (!obj.options.columns || !obj.options.columns[i - 1] || obj.options.columns[i - 1].type !== 'hidden') {
                width += getColumnWidth(obj, i - 1);
            }
        }

        if (obj.headers[i]) {
            obj.headers[i].classList.add('jss_freezed');
            obj.headers[i].style.left = width + 'px';
        }

        if (filterTds.length >= i + 1) {
            filterTds[i].classList.add('jss_freezed');
            filterTds[i].style.left = width + 'px';
        }

        for (let j = 0; j < obj.rows.length; j++) {
            if (obj.rows[j] && obj.records[j][i]) {
                obj.records[j][i].element.classList.add('jss_freezed');
                obj.records[j][i].element.style.left = width + 'px';
            }
        }

        // Footer cells: td[0] of each <tfoot> row is the row-number placeholder (pinned via
        // CSS, like the header/body one), so column `i`'s cell is at index i + 1.
        if (obj.tfoot) {
            for (const footerRow of obj.tfoot.children) {
                if (footerRow.children[i + 1]) {
                    footerRow.children[i + 1].classList.add('jss_freezed');
                    footerRow.children[i + 1].style.left = width + 'px';
                }
            }
        }
    }

    if (Array.isArray(obj.options.nestedHeaders) && obj.options.nestedHeaders.length) {
        for (const nestedParent of obj.options.nestedHeaders) {
            if (Array.isArray(nestedParent) && nestedParent.length) {
                const nestedEl = 'element' in nestedParent && nestedParent.element instanceof HTMLTableRowElement ? nestedParent.element : null;
                if (!nestedEl) continue;

                let colIndex = 0;
                let ni = 1;
                let currentWidth = indexColWidth;
                for (const nested of nestedParent) {
                    const colspan = parseInt(nested.colspan) || 1;
                    if (colIndex >= obj.options.freezeColumns) break;

                    nestedEl.children[ni].classList.add('jss_freezed');
                    nestedEl.children[ni].style.left = `${currentWidth}px`;

                    for (let ci = colIndex; ci < colIndex + colspan && ci < obj.options.freezeColumns; ci++) {
                        if (!obj.options.columns || !obj.options.columns[ci] || obj.options.columns[ci].type !== 'hidden') {
                            currentWidth += getColumnWidth(obj, ci);
                        }
                    }

                    colIndex += colspan;
                    ni++;
                }
            }
        }
    }
};

// Get height of all freezed rows together (measured, since row height is often
// content-driven rather than a fixed configured value like column width is).
export const getFreezeHeight = function () {
    const obj = this;

    let height = 0;
    if (obj.options.freezeRows > 0) {
        for (let j = 0; j < obj.options.freezeRows; j++) {
            if (obj.rows[j]) {
                height += obj.rows[j].element.offsetHeight;
            }
        }
    }
    return height;
};

/**
 * Pin the frozen rows (row-number cell + all body cells in that row) at their resting
 * `top` offset using CSS `position: sticky`, mirroring `updateFrozenColumnOffsets`.
 *
 * Row heights are measured (`offsetHeight`) rather than read from config, since — unlike
 * column width, which always resolves to a known pixel value via `defaultColWidth` — row
 * height is frequently left to auto/content-driven sizing. Measuring also means hidden rows
 * (offsetHeight 0) and zoom scaling are handled for free, with no extra bookkeeping.
 *
 * Only needs to run when row geometry changes (mount, data reload, row resize, hide/show,
 * insert/delete/move row) — NOT on every scroll event.
 */
export const updateFrozenRowOffsets = function () {
    const obj = this;

    if (!obj.options.freezeRows) {
        return;
    }

    let top = obj.thead.offsetHeight;

    for (let j = 0; j < obj.options.freezeRows; j++) {
        if (!obj.rows[j]) {
            continue;
        }

        const rowElement = obj.rows[j].element;

        for (let k = 0; k < rowElement.children.length; k++) {
            rowElement.children[k].classList.add('jss_row_freezed');
            rowElement.children[k].style.top = top + 'px';
        }

        top += rowElement.offsetHeight;
    }
};
