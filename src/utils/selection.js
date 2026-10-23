import { isCellInRanges, normalizeSelectionRange, orderRange, subtractRange, unionRanges } from './selectionState.js';
import dispatch from './dispatch.js';
import { getCellNameFromCoords } from './helpers.js';
import { setHistory } from './history.js';
import { updateCell, updateFormula, updateFormulaChain, updateTable } from './internal.js';
import { getColumnNameFromId, getIdFromColumnName } from './internalHelpers.js';
import { updateToolbar } from './toolbar.js';

export const updateCornerPosition = function () {
    const obj = this;

    // If any selected cells
    if (!obj.highlighted || !obj.highlighted.length || getHighlighted.call(obj).length > 1) {
        obj.corner.style.top = '-2000px';
        obj.corner.style.left = '-2000px';
        obj.corner.style.display = 'none';
    } else {
        // Get last cell
        const last = obj.highlighted[obj.highlighted.length - 1].element;

        const contentRect = obj.content.getBoundingClientRect();
        const x1 = contentRect.left;
        const y1 = contentRect.top;

        const lastRect = last.getBoundingClientRect();
        const x2 = lastRect.left;
        const y2 = lastRect.top;
        const w2 = lastRect.width;
        const h2 = lastRect.height;

        let x = x2 - x1 - obj.content.clientLeft + obj.content.scrollLeft + w2 - 4;
        let y = y2 - y1 - obj.content.clientTop + obj.content.scrollTop + h2 - 4;

        // Absolute children contribute to scroll extents. Keep the handle inside the table
        // at the last row/column so selecting a cell cannot introduce a scrollbar and move
        // an auto-centered table after its selection outline has already been measured.
        const tableRect = obj.table.getBoundingClientRect();
        if (tableRect.width > 0 && tableRect.height > 0) {
            const marginLeft = parseFloat(obj.corner.style.marginLeft) || 0;
            const marginTop = parseFloat(obj.corner.style.marginTop) || 0;
            const cornerWidth = obj.corner.offsetWidth || 7;
            const cornerHeight = obj.corner.offsetHeight || 7;
            x = Math.min(x, tableRect.right - x1 - obj.content.clientLeft + obj.content.scrollLeft - cornerWidth - marginLeft);
            y = Math.min(y, tableRect.bottom - y1 - obj.content.clientTop + obj.content.scrollTop - cornerHeight - marginTop);
        }

        // Place the corner in the correct place
        obj.corner.style.top = y + 'px';
        obj.corner.style.left = x + 'px';

        // Hide the corner if the last selected cell is currently sitting behind the
        // frozen columns/rows band (i.e. not actually visible where we just placed it)
        let hiddenBehindFreeze = false;

        if (obj.options.freezeColumns && !last.classList.contains('jss_freezed')) {
            const right = lastRect.right - x1 - obj.content.clientLeft + obj.content.scrollLeft;
            hiddenBehindFreeze = right <= getFrozenClipLeft(obj);
        }

        if (!hiddenBehindFreeze && obj.options.freezeRows && !last.classList.contains('jss_row_freezed')) {
            const bottom = lastRect.bottom - y1 - obj.content.clientTop + obj.content.scrollTop;
            hiddenBehindFreeze = bottom <= getFrozenClipTop(obj);
        }

        // Hide the corner if the last selected cell is currently sitting behind the
        // sticky footer band (option stickyFooter) — same reasoning as the freeze checks above
        if (!hiddenBehindFreeze && obj.options.stickyFooter == true && obj.tfoot && obj.tfoot.children.length) {
            const footerTop = getStickyFooterRect(obj).top;
            if (y2 + h2 > footerTop) {
                hiddenBehindFreeze = true;
            }
        }

        if (hiddenBehindFreeze || !obj.tbody.contains(last)) {
            obj.corner.style.display = 'none';
        } else if (obj.options.selectionCopy != false) {
            obj.corner.style.display = '';
        }
    }

    updateToolbar(obj);
};

const clearSelectionClasses = function (obj) {
    obj._selectionActiveElement?.classList.remove('highlight-selected');
    obj._selectionActiveElement = null;
    for (const record of obj.highlighted || []) {
        record.element.classList.remove('highlight', 'highlight-left', 'highlight-right', 'highlight-top', 'highlight-bottom', 'highlight-selected');
    }
    for (const index of obj._selectedHeaderIndices || []) obj.headers[index]?.classList.remove('selected');
    for (const index of obj._selectedRowIndices || []) obj.rows[index]?.element.classList.remove('selected');
    obj.highlighted = [];
    obj._selectedHeaderIndices = [];
    obj._selectedRowIndices = [];
};

export const resetSelection = function (blur) {
    const obj = this;
    const previousStatus = obj.selectedCell ? 1 : 0;
    clearSelectionClasses(obj);
    obj.selectedCell = null;
    obj.selectedContainer = null;
    obj.selectedRanges = [];
    obj._selectionGroups = [];
    obj._activeSelectionIndex = -1;
    obj._multiSelectionDrag = null;
    obj._lastSelectionGesture = null;
    obj.corner.style.top = '-2000px';
    obj.corner.style.left = '-2000px';
    obj.corner.style.display = 'none';
    for (const border of obj.highlightBorders || [obj.highlightBorder]) hideOverlay(border);
    if (obj.highlightFill) hideHighlightFill.call(obj);
    if (blur == true && previousStatus == 1) dispatch.call(obj, 'onblur', obj);
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
    const top = firstRect.top - contentRect.top - obj.content.clientTop + scrollTop;
    const left = firstRect.left - contentRect.left - obj.content.clientLeft + scrollLeft;
    const width = lastRect.right - firstRect.left;
    const height = lastRect.bottom - firstRect.top;
    return { top, left, width, height };
};

/**
 * Compute the right edge of the frozen columns in content-div coordinates.
 * Uses the actual frozen header element so it is zoom-aware.
 * Returns 0 if freeze is not active.
 */
const getFrozenClipLeft = function (obj) {
    if (!obj.options.freezeColumns) return 0;
    const contentRect = obj.content.getBoundingClientRect();
    for (let x = Math.min(obj.options.freezeColumns, obj.headers.length) - 1; x >= 0; x--) {
        const header = obj.headers[x];
        if (getComputedStyle(header).display === 'none') continue;
        return header.getBoundingClientRect().right - contentRect.left - obj.content.clientLeft + obj.content.scrollLeft;
    }
    return 0;
};

/**
 * Compute the bottom edge of the frozen rows in content-div coordinates.
 * Sticky positioning applies to the cells, while their row keeps scrolling.
 * Returns 0 if row freeze is not active.
 */
const getFrozenClipTop = function (obj) {
    if (!obj.options.freezeRows) return 0;
    const contentRect = obj.content.getBoundingClientRect();
    for (let y = Math.min(obj.options.freezeRows, obj.rows.length) - 1; y >= 0; y--) {
        const row = obj.rows[y].element;
        if (row.style.display === 'none') continue;
        const cell = Array.from(row.children).find((element) => element.classList.contains('jss_row_freezed') && getComputedStyle(element).display !== 'none');
        if (cell) return cell.getBoundingClientRect().bottom - contentRect.top - obj.content.clientTop + obj.content.scrollTop;
    }
    return 0;
};

const getStickyFooterRect = function (obj) {
    const row = obj.tfoot.children[0];
    const cell = Array.from(row.children).find((element) => element.classList.contains('jss_footer_sticky') && getComputedStyle(element).display !== 'none');
    return (cell || row).getBoundingClientRect();
};

/**
 * Compute the top edge of the sticky footer (option `stickyFooter`) in content-div
 * coordinates, i.e. the boundary below which the footer visually covers the body — mirrors
 * getFrozenClipLeft/getFrozenClipTop above, but for the bottom-pinned footer band. Unlike
 * frozen rows/columns (which never move), the footer's visual top edge changes as you scroll
 * (it is only actually "stuck" once the body has scrolled that far), so this is recomputed
 * from its live getBoundingClientRect() every time rather than cached.
 * Returns 0 if stickyFooter is not active.
 */
const getStickyFooterClipBottom = function (obj) {
    if (obj.options.stickyFooter != true || !obj.tfoot || !obj.tfoot.children.length) return 0;
    const contentRect = obj.content.getBoundingClientRect();
    const footerRect = getStickyFooterRect(obj);
    return footerRect.top - contentRect.top - obj.content.clientTop + obj.content.scrollTop;
};

const hideOverlay = function (overlay) {
    if (!overlay) return;
    overlay.style.top = '-2000px';
    overlay.style.left = '-2000px';
    overlay.style.display = 'none';
};

/** Clipping a selection must not turn an interior frozen boundary into a new outline. */
const setOverlayEdges = function (overlay, hidden) {
    for (const edge of ['top', 'right', 'bottom', 'left']) {
        const property = 'border' + edge[0].toUpperCase() + edge.slice(1) + 'Color';
        overlay.style[property] = hidden[edge] ? 'transparent' : '';
        // Copy/fill outlines use four animated background layers rather than CSS borders.
        overlay.style.setProperty('--jss-selection-' + edge, hidden[edge] ? '0px' : '1px');
    }
};

/** Measure only mounted rows. Detached pages must never draw an outline at (0, 0). */
const getVisibleRangeRect = function (obj, range) {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const row of obj.tbody.children) {
        const y = parseInt(row.getAttribute('data-y'));
        if (y < range[1] || y > range[3] || row.style.display === 'none' || !obj.records[y]) continue;
        let first;
        let last;
        for (let x = range[0]; x <= range[2]; x++) {
            const element = obj.records[y][x]?.element;
            if (!element || element.style.display === 'none' || element.classList.contains('jss_freezed') || element.classList.contains('jss_row_freezed'))
                continue;
            if (!first) first = element;
            last = element;
        }
        if (first) {
            const firstRect = first.getBoundingClientRect();
            const lastRect = last.getBoundingClientRect();
            left = Math.min(left, firstRect.left);
            top = Math.min(top, firstRect.top);
            right = Math.max(right, lastRect.right);
            bottom = Math.max(bottom, lastRect.bottom);
        }
    }
    return left === Infinity ? null : { left, top, right, bottom };
};

const drawRangeOverlays = function (obj, ranges, property, baseOverlay) {
    if (!baseOverlay) return;
    const overlays = obj[property] || (obj[property] = [baseOverlay]);
    let used = 0;
    for (const range of ranges) {
        const rect = getVisibleRangeRect(obj, range);
        if (!rect) continue;
        let { top, left, width, height } = rectToContentCoords(obj, rect, rect);
        const clipLeft = getFrozenClipLeft(obj);
        const clipTop = getFrozenClipTop(obj);
        const clipBottom = getStickyFooterClipBottom(obj);
        const includesFrozenColumn = obj.headers
            .slice(range[0], Math.min(range[2] + 1, obj.options.freezeColumns || 0))
            .some((header) => getComputedStyle(header).display !== 'none');
        const includesFrozenRow = obj.rows
            .slice(range[1], Math.min(range[3] + 1, obj.options.freezeRows || 0))
            .some((row) => row.element.style.display !== 'none');
        const hiddenEdges = {
            left: includesFrozenColumn || (clipLeft > 0 && left < clipLeft),
            top: includesFrozenRow || (clipTop > 0 && top < clipTop),
            bottom: clipBottom > 0 && top + height > clipBottom,
        };
        if (clipLeft > 0 && left < clipLeft) {
            width -= clipLeft - left;
            left = clipLeft;
        }
        if (clipTop > 0 && top < clipTop) {
            height -= clipTop - top;
            top = clipTop;
        }
        if (clipBottom > 0 && top + height > clipBottom) height = clipBottom - top;
        if (width <= 0 || height <= 0) continue;
        let overlay = overlays[used];
        if (!overlay) {
            overlay = baseOverlay.cloneNode(false);
            obj.content.appendChild(overlay);
            overlays.push(overlay);
        }
        overlay.style.display = '';
        overlay.style.top = `${top}px`;
        overlay.style.left = `${left}px`;
        overlay.style.width = `${width}px`;
        overlay.style.height = `${height}px`;
        setOverlayEdges(overlay, hiddenEdges);
        used++;
    }
    for (let i = used; i < overlays.length; i++) hideOverlay(overlays[i]);
};

export const updateHighlightBorder = function () {
    drawRangeOverlays(this, getHighlighted.call(this), 'highlightBorders', this.highlightBorder);
};

export const updateHighlightCopy = function () {
    const obj = this;
    let ranges = obj.copyingRanges;
    if (!ranges) {
        const copying = Array.from(obj.tbody.querySelectorAll('td.copying'));
        ranges = unionRanges(
            copying.map((element) => {
                const x = parseInt(element.getAttribute('data-x'));
                const y = parseInt(element.getAttribute('data-y'));
                return [x, y, x, y];
            })
        );
    }
    drawRangeOverlays(obj, ranges, 'highlightCopies', obj.highlightCopy);
};

/**
 * Position the fill-handle drag preview (same marching-ants dashed style as the copy
 * selection) over the given destination range. Takes explicit first/last cell elements
 * since — unlike copy — the fill-drag range isn't marked with a `.copying` class, it's
 * computed live as the mouse moves.
 */
export const updateHighlightFill = function (first, last) {
    const obj = this;

    if (!first || !last || getHighlighted.call(obj).length > 1) {
        hideHighlightFill.call(obj);
        return;
    }

    const coords = rectToContentCoords(obj, first.getBoundingClientRect(), last.getBoundingClientRect());
    let { top, left, width, height } = coords;

    const clipLeft = getFrozenClipLeft(obj);
    const clipTop = getFrozenClipTop(obj);
    const clipBottom = getStickyFooterClipBottom(obj);
    const hiddenEdges = {
        left: clipLeft > 0 && left < clipLeft,
        top: clipTop > 0 && top < clipTop,
        bottom: clipBottom > 0 && top + height > clipBottom,
    };
    if (clipLeft > 0 && left < clipLeft) {
        width = Math.max(0, width - (clipLeft - left));
        left = clipLeft;
    }

    if (clipTop > 0 && top < clipTop) {
        height = Math.max(0, height - (clipTop - top));
        top = clipTop;
    }

    // Clip fill-drag overlay to not overlap the sticky footer (option stickyFooter)
    if (clipBottom > 0 && top + height > clipBottom) {
        height = Math.max(0, clipBottom - top);
    }

    if (width <= 0 || height <= 0) {
        hideHighlightFill.call(obj);
    } else {
        obj.highlightFill.style.display = '';
        obj.highlightFill.style.top = `${top}px`;
        obj.highlightFill.style.left = `${left}px`;
        obj.highlightFill.style.width = `${width}px`;
        obj.highlightFill.style.height = `${height}px`;
        setOverlayEdges(obj.highlightFill, hiddenEdges);
    }
};

export const hideHighlightFill = function () {
    const obj = this;

    obj.highlightFill.style.top = '-2000px';
    obj.highlightFill.style.left = '-2000px';
    obj.highlightFill.style.display = 'none';
};

export const removeCopyingSelection = function () {
    const clearWorksheet = (worksheet) => {
        const elements = new Set();
        for (const range of worksheet.copyingRanges || []) {
            for (let y = range[1]; y <= range[3]; y++) {
                for (let x = range[0]; x <= range[2]; x++) {
                    const element = worksheet.records[y]?.[x]?.element;
                    if (element) elements.add(element);
                }
            }
        }
        for (const element of elements) element.classList.remove('copying', 'copying-left', 'copying-right', 'copying-top', 'copying-bottom');
        worksheet.copyingRanges = [];
        for (const overlay of worksheet.highlightCopies || [worksheet.highlightCopy]) hideOverlay(overlay);
    };
    for (const table of document.querySelectorAll('.jss_worksheet')) {
        const worksheet = table.closest('.jss_container')?.jssWorksheet;
        if (worksheet) clearWorksheet(worksheet);
        for (const element of table.querySelectorAll('.copying')) {
            element.classList.remove('copying', 'copying-left', 'copying-right', 'copying-top', 'copying-bottom');
        }
    }
    if (this && this.content) {
        clearWorksheet(this);
    }
};

/** Paint the selected union once, including cells outside the mounted lazy-loading window. */
const paintSelection = function (obj) {
    clearSelectionClasses(obj);
    const ranges = obj.selectedRanges || [];
    const seenElements = new Set();
    const headers = new Set();
    const rows = new Set();
    const visibleColumn = (x, step) => {
        while (x >= 0 && x < obj.headers.length && (obj.headers[x].style.display === 'none' || obj.options.columns[x]?.type === 'hidden')) x += step;
        return x;
    };
    const visibleRow = (y, step) => {
        while (y >= 0 && y < obj.rows.length && obj.rows[y].element.style.display === 'none') y += step;
        return y;
    };
    for (const range of ranges) {
        for (let y = range[1]; y <= range[3]; y++) {
            if (!obj.rows[y] || obj.rows[y].element.style.display === 'none') continue;
            for (let x = range[0]; x <= range[2]; x++) {
                const record = obj.records[y]?.[x];
                const element = record?.element;
                if (!element || element.style.display === 'none' || obj.headers[x]?.style.display === 'none' || obj.options.columns[x]?.type === 'hidden')
                    continue;
                headers.add(x);
                rows.add(y);
                if (seenElements.has(element)) continue;
                seenElements.add(element);
                element.classList.add('highlight');
                obj.highlighted.push(record);
                const cellX = parseInt(element.getAttribute('data-x'));
                const cellY = parseInt(element.getAttribute('data-y'));
                const endX = cellX + (parseInt(element.getAttribute('colspan')) || 1) - 1;
                const endY = cellY + (parseInt(element.getAttribute('rowspan')) || 1) - 1;
                if (!isCellInRanges(ranges, visibleColumn(cellX - 1, -1), cellY)) element.classList.add('highlight-left');
                if (!isCellInRanges(ranges, visibleColumn(endX + 1, 1), cellY)) element.classList.add('highlight-right');
                if (!isCellInRanges(ranges, cellX, visibleRow(cellY - 1, -1))) element.classList.add('highlight-top');
                if (!isCellInRanges(ranges, cellX, visibleRow(endY + 1, 1))) element.classList.add('highlight-bottom');
            }
        }
    }
    obj.highlighted.sort(
        (a, b) =>
            Number(a.element.getAttribute('data-y')) - Number(b.element.getAttribute('data-y')) ||
            Number(a.element.getAttribute('data-x')) - Number(b.element.getAttribute('data-x'))
    );
    obj._selectedHeaderIndices = Array.from(headers);
    obj._selectedRowIndices = Array.from(rows);
    for (const index of headers) obj.headers[index].classList.add('selected');
    for (const index of rows) obj.rows[index].element.classList.add('selected');
    if (obj.selectedCell) {
        obj._selectionActiveElement = obj.records[obj.selectedCell[1]]?.[obj.selectedCell[0]]?.element;
        obj._selectionActiveElement?.classList.add('highlight-selected');
    }
    updateHighlightBorder.call(obj);
    updateCornerPosition.call(obj);
    updateHighlightCopy.call(obj);
};

/** Replace the selected union; the optional active tuple is used when restoring history. */
export const setSelections = function (ranges, activeRangeIndex, origin, active) {
    const obj = this;
    if (!Array.isArray(ranges) || (ranges.length > 1 && obj.options.multipleSelection !== true)) return false;
    const groups = ranges.map((range) => normalizeSelectionRange(obj, range)).filter(Boolean);
    const normalized = unionRanges(groups.map((group) => group.range));
    const requestedIndex = parseInt(activeRangeIndex);
    const index = Math.max(0, Math.min(Number.isNaN(requestedIndex) ? groups.length - 1 : requestedIndex, groups.length - 1));
    const activeGroup = groups[index];
    const selectedCell = activeGroup ? (active ? normalizeSelectionRange(obj, active)?.directional : activeGroup.directional) : null;
    const selectedContainer = selectedCell ? orderRange(selectedCell) : null;
    const eventRange = selectedContainer || [null, null, null, null];
    const eventRanges = normalized.map((range) => range.slice());
    if (dispatch.call(obj, 'onbeforeselection', obj, ...eventRange, origin, eventRanges) === false) return false;

    const previousStatus = obj.selectedCell ? 1 : 0;
    obj._lastSelectionGesture = null;
    obj.selectedRanges = normalized;
    obj._selectionGroups = groups.map((group) => group.directional.slice());
    obj._activeSelectionIndex = groups.length ? index : -1;
    obj.selectedCell = selectedCell;
    obj.selectedContainer = normalized.length === 1 ? normalized[0].slice() : selectedContainer;
    paintSelection(obj);
    if (!previousStatus && selectedCell) dispatch.call(obj, 'onfocus', obj);
    if (previousStatus && !selectedCell) dispatch.call(obj, 'onblur', obj);
    dispatch.call(
        obj,
        'onselection',
        obj,
        ...eventRange,
        origin,
        normalized.map((range) => range.slice())
    );
};

export const updateSelectionFromCoords = function (x1, y1, x2, y2, origin, mode = 'replace') {
    const obj = this;
    const normalized = normalizeSelectionRange(obj, [x1, y1, x2, y2]);
    if (!normalized) return false;
    if (obj.options.multipleSelection !== true) mode = 'replace';
    if (mode === 'replace') return setSelections.call(obj, [normalized.directional], 0, origin);

    let groups = (obj._selectionGroups || getHighlighted.call(obj)).map((range) => range.slice());
    if (mode === 'toggle') {
        const remaining = getHighlighted.call(obj).flatMap((range) => subtractRange(range, normalized.range));
        const removedArea =
            getHighlighted.call(obj).reduce((area, range) => area + (range[2] - range[0] + 1) * (range[3] - range[1] + 1), 0) -
            remaining.reduce((area, range) => area + (range[2] - range[0] + 1) * (range[3] - range[1] + 1), 0);
        const area = (normalized.range[2] - normalized.range[0] + 1) * (normalized.range[3] - normalized.range[1] + 1);
        if (removedArea === area) {
            const ranges = unionRanges(remaining);
            const index = ranges.findIndex((range) => obj.selectedCell && isCellInRanges([range], obj.selectedCell[0], obj.selectedCell[1]));
            return setSelections.call(obj, ranges, index, origin);
        }
    }
    if (mode === 'extend' && groups.length) {
        const index = Math.max(0, Math.min(obj._activeSelectionIndex ?? groups.length - 1, groups.length - 1));
        groups[index] = normalized.directional;
        return setSelections.call(obj, groups, index, origin);
    }
    groups.push(normalized.directional);
    return setSelections.call(obj, groups, groups.length - 1, origin);
};

export const addSelectionFromCoords = function (x1, y1, x2, y2, origin, toggle = false) {
    return updateSelectionFromCoords.call(this, x1, y1, x2, y2, origin, toggle ? 'toggle' : 'add');
};

export const getSelectedColumns = function (visibleOnly) {
    const result = new Set();
    for (const range of getHighlighted.call(this)) {
        for (let x = range[0]; x <= range[2]; x++) {
            if (!visibleOnly || (this.headers[x]?.style.display !== 'none' && this.options.columns[x]?.type !== 'hidden')) result.add(x);
        }
    }
    return Array.from(result).sort((a, b) => a - b);
};

export const refreshSelection = function () {
    if (this.selectedCell) {
        const gesture = this._lastSelectionGesture;
        const groups = this.options.multipleSelection === true ? this._selectionGroups || getHighlighted.call(this) : [this.selectedCell];
        const result = setSelections.call(this, groups, this._activeSelectionIndex, undefined, this.selectedCell);
        if (result !== false) this._lastSelectionGesture = gesture;
        return result;
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

    for (const overlay of obj.highlightCopies || [obj.highlightCopy]) hideOverlay(overlay);

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
    if (getHighlighted.call(obj).length !== 1) return false;

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
    const index = type === 1 ? 1 : 0;
    if (getHighlighted.call(this).some((range) => o <= range[index + 2] && d >= range[index])) this.resetSelection();
};

export const getSelectedRows = function (visibleOnly) {
    const result = new Set();
    for (const range of getHighlighted.call(this)) {
        for (let y = range[1]; y <= range[3]; y++) {
            if (!visibleOnly || this.rows[y]?.element.style.display !== 'none') result.add(y);
        }
    }
    return Array.from(result).sort((a, b) => a - b);
};

export const selectAll = function () {
    return updateSelectionFromCoords.call(this, 0, 0, this.headers.length - 1, this.records.length - 1);
};

export const getSelection = function () {
    return this.selectedCell ? orderRange(this.selectedCell) : null;
};

export const getSelected = function (columnNameOnly) {
    const cells = [];
    const seen = new Set();
    for (const range of getHighlighted.call(this)) {
        for (let y = range[1]; y <= range[3]; y++) {
            if (this.rows[y]?.element.style.display === 'none') continue;
            for (let x = range[0]; x <= range[2]; x++) {
                const record = this.records[y]?.[x];
                if (
                    record &&
                    this.headers[x]?.style.display !== 'none' &&
                    this.options.columns[x]?.type !== 'hidden' &&
                    record.element.style.display !== 'none' &&
                    !seen.has(record.element)
                ) {
                    seen.add(record.element);
                    cells.push({ x, y, record });
                }
            }
        }
    }
    cells.sort((a, b) => a.y - b.y || a.x - b.x);
    return cells.map(({ x, y, record }) => (columnNameOnly ? getCellNameFromCoords(x, y) : record));
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
    return isCellInRanges(getHighlighted.call(this), Number(x), Number(y));
};

export const getHighlighted = function () {
    if (!this.selectedCell) return [];
    return (this.selectedRanges || [orderRange(this.selectedCell)]).map((range) => range.slice());
};
