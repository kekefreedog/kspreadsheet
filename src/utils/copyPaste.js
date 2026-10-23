import jSuites from 'jsuites';

import { parseCSV } from './helpers.js';
import dispatch from './dispatch.js';
import { beginHistoryTransaction, endHistoryTransaction, setHistory } from './history.js';
import { updateCell, updateFormulaChain, updateTable, updateTableReferences } from './internal.js';
import { downGet, rightGet } from './keys.js';
import { getHighlighted, hash, removeCopyingSelection, setSelections, updateHighlightCopy, updateSelectionFromCoords } from './selection.js';
import { getColumnNameFromId } from './internalHelpers.js';
import { createPastePlan, createSelectionClipboard, getClipboardState, normalizeClipboardText, setClipboardState } from './clipboardState.js';

/**
 * Write the clipboard before marking a cut as successful. A rejected copy must never
 * clear source values, even when the browser denies access to the clipboard.
 */
const writeClipboard = function (obj, text, isCut) {
    obj.textarea.value = text;
    obj.textarea.select();

    try {
        const copied = document.execCommand('copy');
        return isCut ? copied === true : copied !== false;
    } catch (e) {
        return false;
    }
};

const copySelections = function (obj, ranges, delimiter, returnData, isCut, processed) {
    const snapshot = createSelectionClipboard(obj, ranges, delimiter);
    if (!snapshot) return false;

    let text = snapshot.text;
    if (!returnData) {
        const selectedRange = obj.getSelection();
        const result = dispatch.call(
            obj,
            'oncopy',
            obj,
            selectedRange,
            text,
            isCut,
            snapshot.ranges.map((range) => range.slice())
        );
        if (result === false) return false;
        if (typeof result === 'string') text = result;
        if (!writeClipboard(obj, text, isCut)) return false;
    }

    // A hook that replaces the text also replaces its meaning: do not restore old values on paste.
    if (processed === true) snapshot.values = snapshot.labels.map((row) => row.slice());
    const changedText = normalizeClipboardText(text) !== normalizeClipboardText(snapshot.text);
    obj.clipboardSelection = !changedText ? snapshot : null;
    obj.clipboardLegacy = null;
    obj.data = changedText || processed === true ? text : snapshot.rawText;
    obj.hashString = hash(obj.data);
    obj.style = snapshot.styles.flat();
    setClipboardState(obj.clipboardSelection ? { ...snapshot, kind: 'selection' } : { kind: 'text', text, rawText: text, styles: null });

    if (!returnData) {
        removeCopyingSelection.call(obj);
        obj.copyingRanges = snapshot.ranges.map((range) => range.slice());
        for (const record of obj.highlighted || []) {
            record.element.classList.add('copying');
            for (const edge of ['left', 'right', 'top', 'bottom']) {
                if (record.element.classList.contains('highlight-' + edge)) record.element.classList.add('copying-' + edge);
            }
        }
        updateHighlightCopy.call(obj);
    }

    return obj.data;
};

const pasteSelections = function (obj, x, y, data, snapshot, ranges) {
    if (obj.options.editable === false) return false;
    x = Number(x);
    y = Number(y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return false;

    let values = snapshot ? snapshot.values.map((row) => row.slice()) : parseCSV(data, '\t');
    if (!values.length || !values[0].length) return false;

    const width = Math.max(...values.map((row) => row.length));
    const height = values.length;
    values = values.map((row) => Array.from({ length: width }, (_, index) => (row[index] == null ? '' : row[index])));
    const source = { values, width, height, mask: snapshot && snapshot.mask, styles: snapshot && snapshot.styles };

    // Reject incompatible blocks before invoking the hook or changing worksheet dimensions.
    let targets = createPastePlan(obj, x, y, source, ranges);
    if (!targets) return false;

    const ret = dispatch.call(
        obj,
        'onbeforepaste',
        obj,
        values.map((row) => row.map((value) => ({ value }))),
        x,
        y,
        ranges.map((range) => range.slice())
    );
    if (ret === false) return false;
    if (ret) {
        const replacement = typeof ret === 'string' ? parseCSV(ret, '\t') : ret;
        if (!Array.isArray(replacement) || replacement.length !== height || replacement.some((row) => !Array.isArray(row) || row.length !== width))
            return false;
        source.values = replacement.map((row) => row.map((value) => (value && typeof value === 'object' && 'value' in value ? value.value : value)));
        targets = createPastePlan(obj, x, y, source, ranges);
        if (!targets) return false;
    }

    let maxX = 0;
    let maxY = 0;
    for (const target of targets) {
        maxX = Math.max(maxX, target.x);
        maxY = Math.max(maxY, target.y);
    }
    const insertColumns = Math.max(0, maxX + 1 - obj.headers.length);
    const insertRows = Math.max(0, maxY + 1 - obj.rows.length);
    if ((insertColumns && obj.options.allowInsertColumn === false) || (insertRows && obj.options.allowInsertRow === false)) return false;

    // Expanding a filtered or merged sheet can prompt or change the coordinates. Keep that
    // ambiguous case atomic by requiring an existing destination for a multi-range paste.
    if ((insertColumns || insertRows) && ((obj.options.mergeCells && Object.keys(obj.options.mergeCells).length) || obj.results)) return false;

    if (insertColumns) {
        const columns = Array.from({ length: insertColumns }, (_, index) => ({ column: obj.headers.length + index, options: {} }));
        if (dispatch.call(obj, 'onbeforeinsertcolumn', obj, columns) === false) return false;
    }
    if (insertRows) {
        const rows = Array.from({ length: insertRows }, (_, index) => ({
            row: obj.rows.length + index,
            data: Array(obj.headers.length + insertColumns).fill(''),
        }));
        if (dispatch.call(obj, 'onbeforeinsertrow', obj, rows) === false) return false;
    }

    const records = [];
    const pasted = [];
    const radioBefore = new Map();
    const radioTargets = new Set();
    const newStyle = {};
    const oldStyle = {};
    const previousApproval = obj._clipboardInsertApproved;
    const previousSkip = obj.skipUpdateTableReferences;
    beginHistoryTransaction.call(obj);
    try {
        obj._clipboardInsertApproved = true;
        obj.skipUpdateTableReferences = true;
        if (insertColumns) obj.insertColumn(insertColumns);
        if (insertRows) obj.insertRow(insertRows);
        obj.skipUpdateTableReferences = previousSkip;
        if ((insertColumns || insertRows) && !previousSkip) updateTableReferences.call(obj);

        for (const target of targets) {
            const cell = obj.records[target.y] && obj.records[target.y][target.x];
            if (!cell || cell.element.classList.contains('readonly')) continue;

            let value = target.value;
            const column = obj.options.columns[target.x];
            const type = (column && column.type) || obj.options.defaultCellType;
            if (type === 'radio') {
                const checked = value == 1 || value === true || value === 'true' || value === 'TRUE';
                if (
                    checked &&
                    obj.options.data.some(
                        (row, index) => index !== target.y && row[target.x] && obj.records[index][target.x].element.classList.contains('readonly')
                    )
                )
                    continue;
                if (!radioBefore.has(target.x))
                    radioBefore.set(
                        target.x,
                        obj.options.data.map((row) => row[target.x])
                    );
            }
            if (column && column.type === 'calendar')
                value = jSuites.calendar.extractDateFromString(value, (column.options && column.options.format) || 'YYYY-MM-DD');

            const record = updateCell.call(obj, target.x, target.y, value);
            if (!Object.prototype.hasOwnProperty.call(record, 'value')) continue;
            if (type === 'radio') {
                radioTargets.add(target.x + ':' + target.y);
            } else {
                records.push(record);
                updateFormulaChain.call(obj, target.x, target.y, records);
            }
            if (target.style !== null) {
                const name = getColumnNameFromId([target.x, target.y]);
                oldStyle[name] = obj.getStyle(name) || '';
                newStyle[name] = target.style;
                cell.element.setAttribute('style', target.style);
            }
            pasted.push({ x: target.x, y: target.y, value: record.value });
        }

        // Checking a radio changes its column group, including siblings outside the selection.
        // Capture final values once so undo restores the entire group and dependent formulas.
        for (const [column, before] of radioBefore) {
            for (let row = 0; row < obj.rows.length; row++) {
                const value = obj.options.data[row][column];
                const input = obj.records[row][column].element.querySelector('input[type="radio"]');
                if (input) input.checked = value === true;
                if (before[row] !== value || radioTargets.has(column + ':' + row)) {
                    records.push({ x: column, y: row, col: column, row, value, oldValue: before[row] });
                    updateFormulaChain.call(obj, column, row, records);
                }
            }
        }
        for (const target of pasted) {
            if (radioBefore.has(target.x)) target.value = obj.options.data[target.y][target.x];
        }

        if (records.length) {
            // Build spans of actual targets, not a bounding rectangle which would select the gaps.
            const spans = [];
            for (const target of targets) {
                const previous = spans[spans.length - 1];
                if (previous && previous[1] === target.y && previous[2] + 1 === target.x) previous[2] = target.x;
                else spans.push([target.x, target.y, target.x, target.y]);
            }
            const selected = [];
            const columns = new Map();
            for (const span of spans) {
                const key = span[0] + ':' + span[2];
                const previous = columns.get(key);
                if (previous && previous[3] + 1 === span[1]) previous[3] = span[3];
                else {
                    selected.push(span);
                    columns.set(key, span);
                }
            }
            const activeIndex = selected.findIndex((range) => x >= range[0] && x <= range[2] && y >= range[1] && y <= range[3]);
            setSelections.call(obj, selected, activeIndex < 0 ? 0 : activeIndex);
            setHistory.call(obj, { action: 'setValue', records, selection: obj.selectedCell, newStyle, oldStyle });
            updateTable.call(obj);
            dispatch.call(obj, 'onpaste', obj, pasted);
            dispatch.call(
                obj,
                'onafterchanges',
                obj,
                records.map((record) => ({ x: record.x, y: record.y, value: record.value, oldValue: record.oldValue }))
            );
        }
    } finally {
        obj._clipboardInsertApproved = previousApproval;
        obj.skipUpdateTableReferences = previousSkip;
        endHistoryTransaction.call(obj);
    }

    removeCopyingSelection.call(obj);
};

/**
 * Copy method
 *
 * @param bool highlighted - Get only highlighted cells
 * @param delimiter - \t default to keep compatibility with excel
 * @return string value
 */
export const copy = function (highlighted, delimiter, returnData, includeHeaders, download, isCut, processed) {
    const obj = this;

    const ranges = getHighlighted.call(obj);
    if (highlighted && !ranges.length) return false;
    if (highlighted && ranges.length > 1 && !download) {
        return copySelections(obj, ranges, delimiter || '\t', returnData, isCut, processed);
    }

    if (!delimiter) {
        delimiter = '\t';
    }

    const div = new RegExp(delimiter, 'ig');

    // Controls
    const header = [];
    let col = [];
    let colLabel = [];
    const row = [];
    const rowLabel = [];
    const x = obj.options.data[0].length;
    const y = obj.options.data.length;
    let tmp = '';
    let copyHeader = false;
    let headers = '';
    let nestedHeaders = '';
    let numOfCols = 0;
    let numOfRows = 0;

    // Partial copy
    let copyX = 0;
    let copyY = 0;
    let isPartialCopy = true;
    // Go through the columns to get the data
    for (let j = 0; j < y; j++) {
        for (let i = 0; i < x; i++) {
            // If cell is highlighted
            if (!highlighted || obj.records[j][i].element.classList.contains('highlight')) {
                if (copyX <= i) {
                    copyX = i;
                }
                if (copyY <= j) {
                    copyY = j;
                }
            }
        }
    }
    if (x === copyX + 1 && y === copyY + 1) {
        isPartialCopy = false;
    }

    if (download && (obj.parent.config.includeHeadersOnDownload == true || includeHeaders)) {
        // Nested headers
        if (obj.options.nestedHeaders && obj.options.nestedHeaders.length > 0) {
            tmp = obj.options.nestedHeaders;

            for (let j = 0; j < tmp.length; j++) {
                const nested = [];
                for (let i = 0; i < tmp[j].length; i++) {
                    const colspan = parseInt(tmp[j][i].colspan);
                    nested.push(tmp[j][i].title);
                    for (let c = 0; c < colspan - 1; c++) {
                        nested.push('');
                    }
                }
                nestedHeaders += nested.join(delimiter) + '\r\n';
            }
        }

        copyHeader = true;
    }

    // Reset container
    obj.style = [];

    // Go through the columns to get the data
    for (let j = 0; j < y; j++) {
        col = [];
        colLabel = [];

        for (let i = 0; i < x; i++) {
            // If cell is highlighted
            if (!highlighted || obj.records[j][i].element.classList.contains('highlight')) {
                if (copyHeader == true) {
                    header.push(obj.headers[i].textContent);
                }
                // Values
                let value = obj.options.data[j][i];
                if (value.match && (value.match(div) || value.match(/,/g) || value.match(/\n/) || value.match(/"/))) {
                    value = value.replace(new RegExp('"', 'g'), '""');
                    value = '"' + value + '"';
                }
                col.push(value);

                // Labels
                let label;

                const colType = (obj.options.columns && obj.options.columns[i] && obj.options.columns[i].type) || obj.options.defaultCellType;
                if (colType == 'checkbox' || colType == 'radio' || colType == 'image') {
                    // The rendered cell is an <img> element; the clipboard should carry the raw
                    // value (data:image/URL) so pasting it back reconstructs the image, not the
                    // literal `<img src="...">` markup.
                    label = value;
                } else {
                    label = obj.records[j][i].element.innerHTML;
                    if (label.match && (label.match(div) || label.match(/,/g) || label.match(/\n/) || label.match(/"/))) {
                        // Scape double quotes
                        label = label.replace(new RegExp('"', 'g'), '""');
                        label = '"' + label + '"';
                    }
                }
                colLabel.push(label);

                // Get style
                tmp = obj.records[j][i].element.getAttribute('style') || '';
                tmp = tmp.replace('display: none;', '');
                obj.style.push(tmp ? tmp : '');
            }
        }

        if (col.length) {
            if (copyHeader) {
                numOfCols = col.length;
                row.push(header.join(delimiter));
            }
            row.push(col.join(delimiter));
        }
        if (colLabel.length) {
            numOfRows++;
            if (copyHeader) {
                rowLabel.push(header.join(delimiter));
                copyHeader = false;
            }
            rowLabel.push(colLabel.join(delimiter));
        }
    }

    if (x == numOfCols && y == numOfRows) {
        headers = nestedHeaders;
    }

    // Final string
    const str = headers + row.join('\r\n');
    let strLabel = headers + rowLabel.join('\r\n');
    const originalLabel = strLabel;

    // Create a hidden textarea to copy the values
    if (!returnData) {
        // Paste event
        const selectedRange = [
            Math.min(obj.selectedCell[0], obj.selectedCell[2]),
            Math.min(obj.selectedCell[1], obj.selectedCell[3]),
            Math.max(obj.selectedCell[0], obj.selectedCell[2]),
            Math.max(obj.selectedCell[1], obj.selectedCell[3]),
        ];

        const result = dispatch.call(
            obj,
            'oncopy',
            obj,
            selectedRange,
            strLabel,
            isCut,
            ranges.map((range) => range.slice())
        );

        if (result) {
            strLabel = result;
        } else if (result === false) {
            return false;
        }

        if (!writeClipboard(obj, strLabel, isCut)) return false;
    }

    // Keep data
    if (processed == true || strLabel !== originalLabel) {
        obj.data = strLabel;
    } else {
        obj.data = str;
    }
    // Keep non visible information
    obj.hashString = hash.call(obj, obj.data);
    if (!download) {
        obj.clipboardSelection = null;
        obj.clipboardLegacy = {
            text: strLabel,
            rawText: obj.data,
            styles: strLabel === originalLabel ? obj.style.slice() : null,
        };
        setClipboardState({ ...obj.clipboardLegacy, kind: 'text' });
    }

    // Any exiting border should go
    if (!returnData) {
        removeCopyingSelection.call(obj);
        obj.copyingRanges = ranges.map((range) => range.slice());

        // Border
        if (obj.highlighted) {
            for (let i = 0; i < obj.highlighted.length; i++) {
                obj.highlighted[i].element.classList.add('copying');
                if (obj.highlighted[i].element.classList.contains('highlight-left')) {
                    obj.highlighted[i].element.classList.add('copying-left');
                }
                if (obj.highlighted[i].element.classList.contains('highlight-right')) {
                    obj.highlighted[i].element.classList.add('copying-right');
                }
                if (obj.highlighted[i].element.classList.contains('highlight-top')) {
                    obj.highlighted[i].element.classList.add('copying-top');
                }
                if (obj.highlighted[i].element.classList.contains('highlight-bottom')) {
                    obj.highlighted[i].element.classList.add('copying-bottom');
                }
            }
        }
        updateHighlightCopy.call(obj);
    }

    return obj.data;
};

/**
 * Jspreadsheet paste method
 *
 * @param x target column
 * @param y target row
 * @param data paste data. if data hash is the same as the copied data, apply style from copied cells
 * @return string value
 */
const pasteLegacy = function (x, y, data) {
    const obj = this;

    // Controls
    const copied = getClipboardState(data);
    let style = copied && copied.styles ? copied.styles.slice() : null;

    // Depending on the behavior
    if (copied) {
        data = copied.rawText;
    }

    // Split new line
    data = parseCSV(data, '\t');

    const ex = obj.selectedCell ? obj.selectedCell[2] : x;
    const ey = obj.selectedCell ? obj.selectedCell[3] : y;

    const w = ex - x + 1;
    const h = ey - y + 1;

    // Modify data to allow wor extending paste range in multiples of input range
    const srcW = data[0].length;
    if ((w > 1) & Number.isInteger(w / srcW)) {
        const repeats = w / srcW;
        if (style) {
            const newStyle = [];
            for (let i = 0; i < style.length; i += srcW) {
                const chunk = style.slice(i, i + srcW);
                for (let j = 0; j < repeats; j++) {
                    newStyle.push(...chunk);
                }
            }
            style = newStyle;
        }

        const arrayB = data.map(function (row, i) {
            const arrayC = Array.apply(null, { length: repeats * row.length }).map(function (e, i) {
                return row[i % row.length];
            });
            return arrayC;
        });
        data = arrayB;
    }
    const srcH = data.length;
    if ((h > 1) & Number.isInteger(h / srcH)) {
        const repeats = h / srcH;
        if (style) {
            const newStyle = [];
            for (let j = 0; j < repeats; j++) {
                newStyle.push(...style);
            }
            style = newStyle;
        }
        const arrayB = Array.apply(null, { length: repeats * srcH }).map(function (e, i) {
            return data[i % srcH];
        });
        data = arrayB;
    }

    // Paste filter
    const ret = dispatch.call(
        obj,
        'onbeforepaste',
        obj,
        data.map(function (row) {
            return row.map(function (item) {
                return { value: item };
            });
        }),
        x,
        y
    );

    if (ret === false) {
        return false;
    } else if (ret) {
        data = ret;
    }

    if (x != null && y != null && data) {
        // Records
        let i = 0;
        let j = 0;
        const records = [];
        const newStyle = {};
        const oldStyle = {};
        let styleIndex = 0;

        // Index
        let colIndex = parseInt(x);
        let rowIndex = parseInt(y);
        let row = null;

        const hiddenColCount = obj.headers.slice(colIndex).filter((x) => x.style.display === 'none').length;
        const expandedColCount = colIndex + hiddenColCount + data[0].length;
        const currentColCount = obj.headers.length;
        if (expandedColCount > currentColCount) {
            obj.skipUpdateTableReferences = true;
            obj.insertColumn(expandedColCount - currentColCount);
        }
        const hiddenRowCount = obj.rows.slice(rowIndex).filter((x) => x.element.style.display === 'none').length;
        const expandedRowCount = rowIndex + hiddenRowCount + data.length;
        const currentRowCount = obj.rows.length;
        if (expandedRowCount > currentRowCount) {
            obj.skipUpdateTableReferences = true;
            obj.insertRow(expandedRowCount - currentRowCount);
        }

        if (obj.skipUpdateTableReferences) {
            obj.skipUpdateTableReferences = false;
            updateTableReferences.call(obj);
        }

        // Go through the columns to get the data
        while ((row = data[j])) {
            i = 0;
            colIndex = parseInt(x);

            while (row[i] != null) {
                let value = row[i];

                if (obj.options.columns && obj.options.columns[i] && obj.options.columns[i].type == 'calendar') {
                    value = jSuites.calendar.extractDateFromString(
                        value,
                        (obj.options.columns[i].options && obj.options.columns[i].options.format) || 'YYYY-MM-DD'
                    );
                }

                // Update and keep history
                const record = updateCell.call(obj, colIndex, rowIndex, value);
                // Keep history
                records.push(record);
                // Update all formulas in the chain
                updateFormulaChain.call(obj, colIndex, rowIndex, records);
                // Style
                if (style && style[styleIndex]) {
                    const columnName = getColumnNameFromId([colIndex, rowIndex]);
                    newStyle[columnName] = style[styleIndex];
                    oldStyle[columnName] = obj.getStyle(columnName);
                    obj.records[rowIndex][colIndex].element.setAttribute('style', style[styleIndex]);
                    styleIndex++;
                }
                i++;
                if (row[i] != null) {
                    if (colIndex >= obj.headers.length - 1) {
                        // If the pasted column is out of range, create it if possible
                        if (obj.options.allowInsertColumn != false) {
                            obj.insertColumn();
                            // Otherwise skip the pasted data that overflows
                        } else {
                            break;
                        }
                    }
                    colIndex = rightGet.call(obj, colIndex, rowIndex);
                }
            }

            j++;
            if (data[j]) {
                if (rowIndex >= obj.rows.length - 1) {
                    // If the pasted row is out of range, create it if possible
                    if (obj.options.allowInsertRow != false) {
                        obj.insertRow();
                        // Otherwise skip the pasted data that overflows
                    } else {
                        break;
                    }
                }
                rowIndex = downGet.call(obj, x, rowIndex);
            }
        }

        // Select the new cells
        updateSelectionFromCoords.call(obj, x, y, colIndex, rowIndex);

        // Update history
        setHistory.call(obj, {
            action: 'setValue',
            records: records,
            selection: obj.selectedCell,
            newStyle: newStyle,
            oldStyle: oldStyle,
        });

        // Update table
        updateTable.call(obj);

        // Paste event
        const eventRecords = [];

        for (let j = 0; j < data.length; j++) {
            for (let i = 0; i < data[j].length; i++) {
                eventRecords.push({
                    x: i + x,
                    y: j + y,
                    value: data[j][i],
                });
            }
        }

        dispatch.call(obj, 'onpaste', obj, eventRecords);

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
    }

    removeCopyingSelection.call(obj);
};

/**
 * Paste into the active rectangle or the complete disconnected selection.
 * Exact clipboard text matching prevents hash collisions from reviving unrelated values/styles.
 */
export const paste = function (x, y, data) {
    const obj = this;

    if (typeof data !== 'string' || x == null || y == null || obj.options.editable === false) return false;
    const ranges = getHighlighted.call(obj);
    const copied = getClipboardState(data);
    let snapshot = copied && copied.kind === 'selection' ? copied : null;

    if (!snapshot && (ranges.length > 1 || obj.options.multipleSelection === true) && copied) {
        const values = parseCSV(copied.rawText, '\t');
        const width = values[0].length;
        snapshot = {
            values,
            width,
            height: values.length,
            mask: values.map((row) => row.map(() => true)),
            styles: copied.styles && values.map((row, y) => row.map((_, x) => copied.styles[y * width + x] || '')),
        };
    }

    if (snapshot || ranges.length > 1 || obj.options.multipleSelection === true) return pasteSelections(obj, x, y, data, snapshot, ranges);

    return pasteLegacy.call(obj, x, y, data);
};
