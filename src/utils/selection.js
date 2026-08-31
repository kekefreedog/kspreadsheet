import dispatch from './dispatch.js';
import { getFreezeHeight, getFreezeWidth } from './freeze.js';
import { getCellNameFromCoords } from './helpers.js';
import { setHistory } from './history.js';
import { updateCell, updateFormula, updateFormulaChain, updateTable } from './internal.js';
import { getColumnNameFromId, getIdFromColumnName } from './internalHelpers.js';
import { updateToolbar } from './toolbar.js';

export const updateCornerPosition = function () {
    const obj = this;

    // If any selected cells
    if (!obj.highlighted || !obj.highlighted.length) {
        obj.corner.style.top = '-2000px';
        obj.corner.style.left = '-2000px';
    } else {
        // Get last cell
        const last = obj.highlighted[obj.highlighted.length - 1].element;
        const lastX = last.getAttribute('data-x');
        const lastY = last.getAttribute('data-y');

        const contentRect = obj.content.getBoundingClientRect();
        const x1 = contentRect.left;
        const y1 = contentRect.top;

        const lastRect = last.getBoundingClientRect();
        const x2 = lastRect.left;
        const y2 = lastRect.top;
        const w2 = lastRect.width;
        const h2 = lastRect.height;

        const x = x2 - x1 + obj.content.scrollLeft + w2 - 4;
        const y = y2 - y1 + obj.content.scrollTop + h2 - 4;

        // Place the corner in the correct place
        obj.corner.style.top = y + 'px';
        obj.corner.style.left = x + 'px';

        // Hide the corner if the last selected cell is currently sitting behind the
        // frozen columns/rows band (i.e. not actually visible where we just placed it)
        let hiddenBehindFreeze = false;

        if (obj.options.freezeColumns) {
            const width = getFreezeWidth.call(obj);
            // Only check if the last column is not part of the merged cells
            if (lastX > obj.options.freezeColumns - 1 && x2 - x1 + w2 < width) {
                hiddenBehindFreeze = true;
            }
        }

        if (!hiddenBehindFreeze && obj.options.freezeRows) {
            const height = getFreezeHeight.call(obj);
            if (lastY > obj.options.freezeRows - 1 && y2 - y1 + h2 < height) {
                hiddenBehindFreeze = true;
            }
        }

        if (hiddenBehindFreeze) {
            obj.corner.style.display = 'none';
        } else if (obj.options.selectionCopy != false) {
            obj.corner.style.display = '';
        }
    }

    updateToolbar(obj);
};

export const resetSelection = function (blur) {
    const obj = this;

    let previousStatus;

    // Remove style
    if (!obj.highlighted || !obj.highlighted.length) {
        previousStatus = 0;
    } else {
        previousStatus = 1;

        for (let i = 0; i < obj.highlighted.length; i++) {
            obj.highlighted[i].element.classList.remove('highlight');
            obj.highlighted[i].element.classList.remove('highlight-left');
            obj.highlighted[i].element.classList.remove('highlight-right');
            obj.highlighted[i].element.classList.remove('highlight-top');
            obj.highlighted[i].element.classList.remove('highlight-bottom');
            obj.highlighted[i].element.classList.remove('highlight-selected');

            const px = parseInt(obj.highlighted[i].element.getAttribute('data-x'));
            const py = parseInt(obj.highlighted[i].element.getAttribute('data-y'));

            // Check for merged cells
            let ux, uy;

            if (obj.highlighted[i].element.getAttribute('data-merged')) {
                const colspan = parseInt(obj.highlighted[i].element.getAttribute('colspan'));
                const rowspan = parseInt(obj.highlighted[i].element.getAttribute('rowspan'));
                ux = colspan > 0 ? px + (colspan - 1) : px;
                uy = rowspan > 0 ? py + (rowspan - 1) : py;
            } else {
                ux = px;
                uy = py;
            }

            // Remove selected from headers
            for (let j = px; j <= ux; j++) {
                if (obj.headers[j]) {
                    obj.headers[j].classList.remove('selected');
                }
            }

            // Remove selected from rows
            for (let j = py; j <= uy; j++) {
                if (obj.rows[j]) {
                    obj.rows[j].element.classList.remove('selected');
                }
            }
        }
    }

    // Reset highlighted cells
    obj.highlighted = [];

    // Reset
    obj.selectedCell = null;

    // Hide corner
    obj.corner.style.top = '-2000px';
    obj.corner.style.left = '-2000px';

    if (blur == true && previousStatus == 1) {
        dispatch.call(obj, 'onblur', obj);
    }

    return previousStatus;
};

/**
 * Update selection based on two cells
 */
export const updateSelection = function (el1, el2, origin) {
    const obj = this;

    const x1 = el1.getAttribute('data-x');
    const y1 = el1.getAttribute('data-y');

    let x2, y2;
    if (el2) {
        x2 = el2.getAttribute('data-x');
        y2 = el2.getAttribute('data-y');
    } else {
        x2 = x1;
        y2 = y1;
    }

    updateSelectionFromCoords.call(obj, x1, y1, x2, y2, origin);
};

/**
 * Convert a getBoundingClientRect() measurement to content-div coordinates.
 * Uses getBoundingClientRect() so it is always zoom-aware.
 */
const rectToContentCoords = function (obj, firstRect, lastRect) {
    const contentRect = obj.content.getBoundingClientRect();
    const scrollLeft = obj.content.scrollLeft;
    const scrollTop = obj.content.scrollTop;
    const top = Math.round(firstRect.top - contentRect.top + scrollTop);
    const left = Math.round(firstRect.left - contentRect.left + scrollLeft);
    const width = Math.round(lastRect.right - firstRect.left);
    const height = Math.round(lastRect.bottom - firstRect.top);
    return { top, left, width, height };
};

/**
 * Compute the right edge of the frozen columns in content-div coordinates.
 * Uses the actual frozen header element so it is zoom-aware.
 * Returns 0 if freeze is not active.
 */
const getFrozenClipLeft = function (obj) {
    if (!obj.options.freezeColumns) return 0;
    const scrollLeft = obj.content.scrollLeft;
    const indexColWidth = obj.table.querySelector('.jss_selectall')?.offsetWidth || 0;
    if (scrollLeft <= indexColWidth) return 0;
    const lastFrozenHeader = obj.headers[obj.options.freezeColumns - 1];
    if (!lastFrozenHeader) return 0;
    const contentRect = obj.content.getBoundingClientRect();
    const headerRect = lastFrozenHeader.getBoundingClientRect();
    return Math.round(headerRect.right - contentRect.left + scrollLeft);
};

/**
 * Compute the bottom edge of the frozen rows in content-div coordinates.
 * Uses the actual frozen row element so it is zoom-aware.
 * Returns 0 if row freeze is not active.
 */
const getFrozenClipTop = function (obj) {
    if (!obj.options.freezeRows) return 0;
    const lastFrozenRow = obj.rows[obj.options.freezeRows - 1];
    if (!lastFrozenRow) return 0;
    const contentRect = obj.content.getBoundingClientRect();
    const rowRect = lastFrozenRow.element.getBoundingClientRect();
    return Math.round(rowRect.bottom - contentRect.top + obj.content.scrollTop);
};

export const updateHighlightBorder = function () {
    const obj = this;

    if (Array.isArray(obj.highlighted)) {
        if (!obj.highlighted.length) {
            obj.highlightBorder.style.top = '-2000px';
            obj.highlightBorder.style.left = '-2000px';
        } else {
            const first = obj.highlighted.at(0).element;
            const last = obj.highlighted.at(-1).element;
            const coords = rectToContentCoords(obj, first.getBoundingClientRect(), last.getBoundingClientRect());
            let { top, left, width, height } = coords;

            // Clip selection overlay to not overlap frozen columns/rows
            // (frozen cells already show selection via legacy CSS borders)
            const clipLeft = getFrozenClipLeft(obj);
            if (clipLeft > 0 && left < clipLeft) {
                width = Math.max(0, width - (clipLeft - left));
                left = clipLeft;
            }

            const clipTop = getFrozenClipTop(obj);
            if (clipTop > 0 && top < clipTop) {
                height = Math.max(0, height - (clipTop - top));
                top = clipTop;
            }

            if (width <= 0 || height <= 0) {
                obj.highlightBorder.style.top = '-2000px';
                obj.highlightBorder.style.left = '-2000px';
            } else {
                obj.highlightBorder.style.top = `${top}px`;
                obj.highlightBorder.style.left = `${left}px`;
                obj.highlightBorder.style.width = `${width}px`;
                obj.highlightBorder.style.height = `${height}px`;
            }
        }
    }
};

export const updateHighlightCopy = function () {
    const obj = this;

    const copySelectionEls = obj.tbody.querySelectorAll('td.copying');

    if (!copySelectionEls.length) {
        obj.highlightCopy.style.top = '-2000px';
        obj.highlightCopy.style.left = '-2000px';
    } else {
        const copySelectionArray = Array.from(copySelectionEls);
        const first = copySelectionArray.at(0);
        const last = copySelectionArray.at(-1);
        const coords = rectToContentCoords(obj, first.getBoundingClientRect(), last.getBoundingClientRect());
        let { top, left, width, height } = coords;

        // Clip copy overlay to not overlap frozen columns/rows
        const clipLeft = getFrozenClipLeft(obj);
        if (clipLeft > 0 && left < clipLeft) {
            width = Math.max(0, width - (clipLeft - left));
            left = clipLeft;
        }

        const clipTop = getFrozenClipTop(obj);
        if (clipTop > 0 && top < clipTop) {
            height = Math.max(0, height - (clipTop - top));
            top = clipTop;
        }

        if (width <= 0 || height <= 0) {
            obj.highlightCopy.style.top = '-2000px';
            obj.highlightCopy.style.left = '-2000px';
        } else {
            obj.highlightCopy.style.top = `${top}px`;
            obj.highlightCopy.style.left = `${left}px`;
            obj.highlightCopy.style.width = `${width}px`;
            obj.highlightCopy.style.height = `${height}px`;
        }
    }
};

/**
 * Position the fill-handle drag preview (same marching-ants dashed style as the copy
 * selection) over the given destination range. Takes explicit first/last cell elements
 * since — unlike copy — the fill-drag range isn't marked with a `.copying` class, it's
 * computed live as the mouse moves.
 */
export const updateHighlightFill = function (first, last) {
    const obj = this;

    if (!first || !last) {
        hideHighlightFill.call(obj);
        return;
    }

    const coords = rectToContentCoords(obj, first.getBoundingClientRect(), last.getBoundingClientRect());
    let { top, left, width, height } = coords;

    const clipLeft = getFrozenClipLeft(obj);
    if (clipLeft > 0 && left < clipLeft) {
        width = Math.max(0, width - (clipLeft - left));
        left = clipLeft;
    }

    const clipTop = getFrozenClipTop(obj);
    if (clipTop > 0 && top < clipTop) {
        height = Math.max(0, height - (clipTop - top));
        top = clipTop;
    }

    if (width <= 0 || height <= 0) {
        hideHighlightFill.call(obj);
    } else {
        obj.highlightFill.style.top = `${top}px`;
        obj.highlightFill.style.left = `${left}px`;
        obj.highlightFill.style.width = `${width}px`;
        obj.highlightFill.style.height = `${height}px`;
    }
};

export const hideHighlightFill = function () {
    const obj = this;

    obj.highlightFill.style.top = '-2000px';
    obj.highlightFill.style.left = '-2000px';
};

export const removeCopyingSelection = function () {
    const copying = document.querySelectorAll('.jss_worksheet .copying');
    for (let i = 0; i < copying.length; i++) {
        copying[i].classList.remove('copying');
        copying[i].classList.remove('copying-left');
        copying[i].classList.remove('copying-right');
        copying[i].classList.remove('copying-top');
        copying[i].classList.remove('copying-bottom');
    }
};

export const updateSelectionFromCoords = function (x1, y1, x2, y2, origin) {
    const obj = this;

    // select column
    if (y1 == null) {
        y1 = 0;
        y2 = obj.rows.length - 1;

        if (x1 == null) {
            return;
        }
    } else if (x1 == null) {
        // select row
        x1 = 0;
        x2 = obj.options.data[0].length - 1;
    }

    // Same element
    if (x2 == null) {
        x2 = x1;
    }
    if (y2 == null) {
        y2 = y1;
    }

    // Selection must be within the existing data.
    // Coordinates are clamped through parseInt + Math.max/min so that NaN or negative
    // values (which the previous `>= length` checks alone don't catch — comparisons
    // against NaN are always false, so an invalid value silently passed through unclamped
    // and could later crash indexing obj.records[y1]) always resolve to a valid in-range index.
    const clamp = (value, maxIndex) => {
        const parsed = parseInt(value);
        if (isNaN(parsed)) {
            return 0;
        }
        return Math.max(0, Math.min(parsed, maxIndex));
    };

    x1 = clamp(x1, obj.headers.length - 1);
    y1 = clamp(y1, obj.rows.length - 1);
    x2 = clamp(x2, obj.headers.length - 1);
    y2 = clamp(y2, obj.rows.length - 1);

    // Limits
    let borderLeft = null;
    let borderRight = null;
    let borderTop = null;
    let borderBottom = null;

    // Origin & Destination
    let px, ux;

    if (parseInt(x1) < parseInt(x2)) {
        px = parseInt(x1);
        ux = parseInt(x2);
    } else {
        px = parseInt(x2);
        ux = parseInt(x1);
    }

    let py, uy;

    if (parseInt(y1) < parseInt(y2)) {
        py = parseInt(y1);
        uy = parseInt(y2);
    } else {
        py = parseInt(y2);
        uy = parseInt(y1);
    }

    // Verify merged columns
    // (px/ux/py/uy can expand while this loop runs, below, as merged cells are found — guard
    // obj.records[j] explicitly since a mid-loop expansion can push j/i past valid bounds
    // before the re-clamp that runs after this loop finishes)
    for (let i = px; i <= ux; i++) {
        for (let j = py; j <= uy; j++) {
            if (obj.records[j] && obj.records[j][i] && obj.records[j][i].element.getAttribute('data-merged')) {
                const x = parseInt(obj.records[j][i].element.getAttribute('data-x'));
                const y = parseInt(obj.records[j][i].element.getAttribute('data-y'));
                const colspan = parseInt(obj.records[j][i].element.getAttribute('colspan'));
                const rowspan = parseInt(obj.records[j][i].element.getAttribute('rowspan'));

                if (colspan > 1) {
                    if (x < px) {
                        px = x;
                    }
                    if (x + colspan > ux) {
                        ux = x + colspan - 1;
                    }
                }

                if (rowspan) {
                    if (y < py) {
                        py = y;
                    }
                    if (y + rowspan > uy) {
                        uy = y + rowspan - 1;
                    }
                }
            }
        }
    }

    // A merged cell's colspan/rowspan can expand px/ux/py/uy above — re-clamp to valid
    // bounds so the loops below never index past the end of obj.rows/obj.records.
    px = Math.max(0, Math.min(px, obj.headers.length - 1));
    ux = Math.max(0, Math.min(ux, obj.headers.length - 1));
    py = Math.max(0, Math.min(py, obj.rows.length - 1));
    uy = Math.max(0, Math.min(uy, obj.rows.length - 1));

    // Vertical limits
    for (let j = py; j <= uy; j++) {
        if (obj.rows[j] && obj.rows[j].element.style.display != 'none') {
            if (borderTop == null) {
                borderTop = j;
            }
            borderBottom = j;
        }
    }

    for (let i = px; i <= ux; i++) {
        for (let j = py; j <= uy; j++) {
            // Horizontal limits
            if (!obj.options.columns || !obj.options.columns[i] || obj.options.columns[i].type != 'hidden') {
                if (borderLeft == null) {
                    borderLeft = i;
                }
                borderRight = i;
            }
        }
    }

    // Create borders
    if (!borderLeft) {
        borderLeft = 0;
    }
    if (!borderRight) {
        borderRight = 0;
    }

    const ret = dispatch.call(obj, 'onbeforeselection', obj, borderLeft, borderTop, borderRight, borderBottom, origin);
    if (ret === false) {
        return false;
    }

    // Reset Selection
    const previousState = obj.resetSelection();

    // Keep selected cell
    obj.selectedCell = [x1, y1, x2, y2];

    // Add selected cell
    if (obj.records[y1] && obj.records[y1][x1]) {
        obj.records[y1][x1].element.classList.add('highlight-selected');
    }

    // Redefining styles
    for (let i = px; i <= ux; i++) {
        for (let j = py; j <= uy; j++) {
            if (obj.rows[j] && obj.records[j][i] && obj.rows[j].element.style.display != 'none' && obj.records[j][i].element.style.display != 'none') {
                obj.records[j][i].element.classList.add('highlight');
                obj.highlighted.push(obj.records[j][i]);
            }
        }
    }

    for (let i = borderLeft; i <= borderRight; i++) {
        if (
            (!obj.options.columns || !obj.options.columns[i] || obj.options.columns[i].type != 'hidden') &&
            obj.cols[i].colElement.style &&
            obj.cols[i].colElement.style.display != 'none'
        ) {
            // Top border
            if (obj.records[borderTop] && obj.records[borderTop][i]) {
                obj.records[borderTop][i].element.classList.add('highlight-top');
            }
            // Bottom border
            if (obj.records[borderBottom] && obj.records[borderBottom][i]) {
                obj.records[borderBottom][i].element.classList.add('highlight-bottom');
            }
            // Add selected from headers
            obj.headers[i].classList.add('selected');
        }
    }

    for (let j = borderTop; j <= borderBottom; j++) {
        if (obj.rows[j] && obj.rows[j].element.style.display != 'none') {
            // Left border
            if (obj.records[j][borderLeft]) {
                obj.records[j][borderLeft].element.classList.add('highlight-left');
            }
            // Right border
            if (obj.records[j][borderRight]) {
                obj.records[j][borderRight].element.classList.add('highlight-right');
            }
            // Add selected from rows
            obj.rows[j].element.classList.add('selected');
        }
    }

    obj.selectedContainer = [borderLeft, borderTop, borderRight, borderBottom];

    // Handle events
    if (previousState == 0) {
        dispatch.call(obj, 'onfocus', obj);

        removeCopyingSelection();
    }

    dispatch.call(obj, 'onselection', obj, borderLeft, borderTop, borderRight, borderBottom, origin);

    // Set corner cell and highlight border
    updateHighlightBorder.call(obj);

    // Find corner cell
    updateCornerPosition.call(obj);

    updateHighlightCopy.call(obj);
};

/**
 * Get selected column numbers
 *
 * @return array
 */
export const getSelectedColumns = function (visibleOnly) {
    const obj = this;

    if (!obj.selectedCell) {
        return [];
    }

    const result = [];

    for (let i = Math.min(obj.selectedCell[0], obj.selectedCell[2]); i <= Math.max(obj.selectedCell[0], obj.selectedCell[2]); i++) {
        if (!visibleOnly || obj.headers[i].style.display != 'none') {
            result.push(i);
        }
    }

    return result;
};

/**
 * Refresh current selection
 */
export const refreshSelection = function () {
    const obj = this;

    if (obj.selectedCell) {
        obj.updateSelectionFromCoords(obj.selectedCell[0], obj.selectedCell[1], obj.selectedCell[2], obj.selectedCell[3]);
    }
};

/**
 * Remove copy selection
 *
 * @return void
 */
export const removeCopySelection = function () {
    const obj = this;

    // Hide the fill-handle drag preview overlay too (covers both a mid-drag recompute,
    // where it gets repositioned right after, and the final drag-end reset)
    hideHighlightFill.call(obj);

    // Remove current selection
    for (let i = 0; i < obj.selection.length; i++) {
        obj.selection[i].classList.remove('selection');
        obj.selection[i].classList.remove('selection-left');
        obj.selection[i].classList.remove('selection-right');
        obj.selection[i].classList.remove('selection-top');
        obj.selection[i].classList.remove('selection-bottom');
    }

    obj.highlightCopy.style.top = '-2000px';
    obj.highlightCopy.style.left = '-2000px';

    obj.selection = [];
};

const doubleDigitFormat = function (v) {
    v = '' + v;
    if (v.length == 1) {
        v = '0' + v;
    }
    return v;
};

/**
 * Helper function to copy data using the corner icon
 */
export const copyData = function (o, d) {
    const obj = this;

    // Get data from all selected cells
    const data = obj.getData(true, false);

    // Selected cells
    const h = obj.selectedContainer;

    // Cells
    const x1 = parseInt(o.getAttribute('data-x'));
    const y1 = parseInt(o.getAttribute('data-y'));
    const x2 = parseInt(d.getAttribute('data-x'));
    const y2 = parseInt(d.getAttribute('data-y'));

    // Records
    const records = [];
    let breakControl = false;

    let rowNumber, colNumber;

    if (h[0] == x1) {
        // Vertical copy
        if (y1 < h[1]) {
            rowNumber = y1 - h[1];
        } else {
            rowNumber = 1;
        }
        colNumber = 0;
    } else {
        if (x1 < h[0]) {
            colNumber = x1 - h[0];
        } else {
            colNumber = 1;
        }
        rowNumber = 0;
    }

    // Copy data procedure
    let posx = 0;
    let posy = 0;

    for (let j = y1; j <= y2; j++) {
        // Skip hidden rows
        if (obj.rows[j] && obj.rows[j].element.style.display == 'none') {
            continue;
        }

        // Controls
        if (data[posy] == undefined) {
            posy = 0;
        }
        posx = 0;

        // Data columns
        if (h[0] != x1) {
            if (x1 < h[0]) {
                colNumber = x1 - h[0];
            } else {
                colNumber = 1;
            }
        }
        // Data columns
        for (let i = x1; i <= x2; i++) {
            // Update non-readonly
            if (
                obj.records[j][i] &&
                !obj.records[j][i].element.classList.contains('readonly') &&
                obj.records[j][i].element.style.display != 'none' &&
                breakControl == false
            ) {
                // Stop if contains value
                if (!obj.selection.length) {
                    if (obj.options.data[j][i] != '') {
                        breakControl = true;
                        continue;
                    }
                }

                // Column
                if (data[posy] == undefined) {
                    posx = 0;
                } else if (data[posy][posx] == undefined) {
                    posx = 0;
                }

                // Value
                let value = data[posy][posx];
                const columnType = (obj.options.columns && obj.options.columns[i] && obj.options.columns[i].type) || obj.options.defaultCellType;

                if (value && !data[1] && obj.parent.config.autoIncrement != false) {
                    if (!columnType || columnType == 'text' || columnType == 'number') {
                        if (('' + value).substr(0, 1) == '=') {
                            const tokens = value.match(/([A-Z]+[0-9]+)/g);

                            if (tokens) {
                                const affectedTokens = [];
                                for (let index = 0; index < tokens.length; index++) {
                                    const position = getIdFromColumnName(tokens[index], 1);
                                    position[0] += colNumber;
                                    position[1] += rowNumber;
                                    if (position[1] < 0) {
                                        position[1] = 0;
                                    }
                                    const token = getColumnNameFromId([position[0], position[1]]);

                                    if (token != tokens[index]) {
                                        affectedTokens[tokens[index]] = token;
                                    }
                                }
                                // Update formula
                                if (affectedTokens) {
                                    value = updateFormula(value, affectedTokens);
                                }
                            }
                        } else {
                            if (value == Number(value)) {
                                value = Number(value) + rowNumber;
                            }
                        }
                    } else if (columnType == 'calendar') {
                        const date = new Date(value);
                        date.setDate(date.getDate() + rowNumber);
                        value =
                            date.getFullYear() +
                            '-' +
                            doubleDigitFormat(parseInt(date.getMonth() + 1)) +
                            '-' +
                            doubleDigitFormat(date.getDate()) +
                            ' ' +
                            '00:00:00';
                    }
                }

                records.push(updateCell.call(obj, i, j, value));

                // Update all formulas in the chain
                updateFormulaChain.call(obj, i, j, records);
            }
            posx++;
            if (h[0] != x1) {
                colNumber++;
            }
        }
        posy++;
        rowNumber++;
    }

    // Update history
    setHistory.call(obj, {
        action: 'setValue',
        records: records,
        selection: obj.selectedCell,
    });

    // Update table with custom configuration if applicable
    updateTable.call(obj);

    // On after changes
    const onafterchangesRecords = records.map(function (record) {
        return {
            x: record.x,
            y: record.y,
            value: record.value,
            oldValue: record.oldValue,
        };
    });

    dispatch.call(obj, 'onafterchanges', obj, onafterchangesRecords);
};

export const hash = function (str) {
    let hash = 0,
        i,
        chr;

    if (!str || str.length === 0) {
        return hash;
    } else {
        for (i = 0; i < str.length; i++) {
            chr = str.charCodeAt(i);
            hash = (hash << 5) - hash + chr;
            hash |= 0;
        }
    }
    return hash;
};

/**
 * Move coords to A1 in case overlaps with an excluded cell
 */
export const conditionalSelectionUpdate = function (type, o, d) {
    const obj = this;

    if (type == 1) {
        if (obj.selectedCell && ((o >= obj.selectedCell[1] && o <= obj.selectedCell[3]) || (d >= obj.selectedCell[1] && d <= obj.selectedCell[3]))) {
            obj.resetSelection();
            return;
        }
    } else {
        if (obj.selectedCell && ((o >= obj.selectedCell[0] && o <= obj.selectedCell[2]) || (d >= obj.selectedCell[0] && d <= obj.selectedCell[2]))) {
            obj.resetSelection();
            return;
        }
    }
};

/**
 * Get selected rows numbers
 *
 * @return array
 */
export const getSelectedRows = function (visibleOnly) {
    const obj = this;

    if (!obj.selectedCell) {
        return [];
    }

    const result = [];

    for (let i = Math.min(obj.selectedCell[1], obj.selectedCell[3]); i <= Math.max(obj.selectedCell[1], obj.selectedCell[3]); i++) {
        if (!visibleOnly || obj.rows[i].element.style.display != 'none') {
            result.push(i);
        }
    }

    return result;
};

export const selectAll = function () {
    const obj = this;

    if (!obj.selectedCell) {
        obj.selectedCell = [];
    }

    obj.selectedCell[0] = 0;
    obj.selectedCell[1] = 0;
    obj.selectedCell[2] = obj.headers.length - 1;
    obj.selectedCell[3] = obj.records.length - 1;

    obj.updateSelectionFromCoords(obj.selectedCell[0], obj.selectedCell[1], obj.selectedCell[2], obj.selectedCell[3]);
};

export const getSelection = function () {
    const obj = this;

    if (!obj.selectedCell) {
        return null;
    }

    return [
        Math.min(obj.selectedCell[0], obj.selectedCell[2]),
        Math.min(obj.selectedCell[1], obj.selectedCell[3]),
        Math.max(obj.selectedCell[0], obj.selectedCell[2]),
        Math.max(obj.selectedCell[1], obj.selectedCell[3]),
    ];
};

export const getSelected = function (columnNameOnly) {
    const obj = this;

    const selectedRange = getSelection.call(obj);

    if (!selectedRange) {
        return [];
    }

    const cells = [];

    for (let y = selectedRange[1]; y <= selectedRange[3]; y++) {
        for (let x = selectedRange[0]; x <= selectedRange[2]; x++) {
            if (columnNameOnly) {
                cells.push(getCellNameFromCoords(x, y));
            } else {
                cells.push(obj.records[y][x]);
            }
        }
    }

    return cells;
};

export const getRange = function () {
    const obj = this;

    const selectedRange = getSelection.call(obj);

    if (!selectedRange) {
        return '';
    }

    const start = getCellNameFromCoords(selectedRange[0], selectedRange[1]);
    const end = getCellNameFromCoords(selectedRange[2], selectedRange[3]);

    if (start === end) {
        return obj.options.worksheetName + '!' + start;
    }

    return obj.options.worksheetName + '!' + start + ':' + end;
};

export const isSelected = function (x, y) {
    const obj = this;

    const selection = getSelection.call(obj);

    return x >= selection[0] && x <= selection[2] && y >= selection[1] && y <= selection[3];
};

export const getHighlighted = function () {
    const obj = this;

    const selection = getSelection.call(obj);

    if (selection) {
        return [selection];
    }

    return [];
};
