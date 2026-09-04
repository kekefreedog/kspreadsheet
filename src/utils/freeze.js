/**
 * Toggle `jss_scrolled_top`/`jss_scrolled_left` on the table — these gate the header's
 * border-bottom and the row-number column's border-right (see jspreadsheet.css), which only
 * show once actually scrolled (at rest they'd double up with row 1's border-top / column A's
 * border-left into a visibly thicker line).
 *
 * Deliberately geometry-based (comparing the sticky corner cell's current position against the
 * table's own, unstuck position) rather than reading `obj.content.scrollTop`/`scrollLeft`
 * directly: `tableOverflow: true` without an explicit `tableHeight`/`tableWidth` for a given
 * axis leaves THAT axis scrolling the whole page instead of `.jss_content` (see
 * worksheets.js — `overflow-y`/`overflow-x` only get set to 'auto' when the matching dimension
 * is configured), so `obj.content.scrollTop`/`scrollLeft` can stay 0 forever even while the
 * table has very much scrolled. The sticky corner cell's own position, however, reflects
 * reality regardless of which ancestor is actually doing the scrolling — at rest it sits ~1px
 * off the table's own top-left (the deliberate offset compensating for `.jss_worksheet`'s own
 * 1px transparent border, see the `top: 1px`/`left: 1px` comments below), and that gap grows
 * sharply once anything has actually scrolled. The epsilon (2px) absorbs that 1px baseline
 * without misfiring on it alone.
 */
export const updateStickyEdgeClasses = function () {
    const obj = this;

    if (!obj.table) {
        return;
    }

    const corner = obj.table.querySelector('.jss_selectall') || (obj.thead && obj.thead.rows[0] && obj.thead.rows[0].children[0]);

    if (!corner) {
        return;
    }

    const cornerRect = corner.getBoundingClientRect();
    const tableRect = obj.table.getBoundingClientRect();

    obj.table.classList.toggle('jss_scrolled_top', cornerRect.top - tableRect.top > 2);
    obj.table.classList.toggle('jss_scrolled_left', cornerRect.left - tableRect.left > 2);
};

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

/**
 * Pin the footer at the bottom of the scrollable viewport (`tableOverflow` + `tableHeight`)
 * using CSS `position: sticky`, mirroring `updateFrozenRowOffsets`. Opt-in via the
 * `stickyFooter` worksheet option — without it the footer keeps its historical behavior of
 * scrolling away with the body, only becoming visible once the user scrolls all the way down.
 *
 * With multiple footer rows, the LAST row rests at bottom:0 and earlier rows stack above it
 * (their bottom offset is the height of every footer row below them), same idea as
 * `updateFrozenRowOffsets` stacking frozen rows downward from the header.
 */
export const updateStickyFooter = function () {
    const obj = this;

    if (!obj.tfoot) {
        return;
    }

    if (obj.options.stickyFooter != true) {
        // Option not (or no longer) enabled: undo any sticky pinning left over from a previous
        // setFooter()/setFooters() call so the footer goes back to scrolling with the body.
        for (const footerRow of obj.tfoot.children) {
            for (let k = 0; k < footerRow.children.length; k++) {
                footerRow.children[k].classList.remove('jss_footer_sticky');
                footerRow.children[k].style.removeProperty('bottom');
            }
        }
        obj.content.style.removeProperty('padding-bottom');
        return;
    }

    // `sticky; bottom: 0` rests flush against the CONTAINER's bottom padding edge, not its
    // border edge — `.jss_content` has its own `padding-bottom` (breathing room for the
    // regular, non-sticky-footer case), which would otherwise leave a reserved strip past the
    // footer's own box, through which the scrolled body can still peek. The sticky footer now
    // acts as the grid's visual bottom edge, so it takes over that space instead.
    obj.content.style.paddingBottom = '0px';

    let bottom = 0;

    for (let j = obj.tfoot.children.length - 1; j >= 0; j--) {
        const rowElement = obj.tfoot.children[j];

        for (let k = 0; k < rowElement.children.length; k++) {
            rowElement.children[k].classList.add('jss_footer_sticky');
            rowElement.children[k].style.bottom = bottom + 'px';
        }

        bottom += rowElement.offsetHeight;
    }
};
