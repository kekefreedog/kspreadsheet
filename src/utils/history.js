import dispatch from './dispatch.js';
import { injectArray } from './internalHelpers.js';
import { createNestedHeader, updateTableReferences } from './internal.js';
import { setMerge } from './merges.js';
import { updateOrder, updateOrderArrow } from './orderBy.js';
import { conditionalSelectionUpdate, getHighlighted, setSelections } from './selection.js';

/**
 * Copy logical selection state without retaining mutable range arrays or DOM nodes.
 */
export const getSelectionSnapshot = function () {
    return {
        ranges: getHighlighted.call(this).map((range) => range.slice()),
        active: this.selectedCell ? this.selectedCell.map(Number) : null,
    };
};

export const restoreSelectionSnapshot = function (snapshot) {
    if (!snapshot) return;

    const obj = this;
    const ignoreEvents = obj.parent.ignoreEvents;
    obj.parent.ignoreEvents = true;
    try {
        if (!snapshot.ranges.length || !obj.rows.length || !obj.headers.length) {
            obj.resetSelection();
        } else {
            const active = snapshot.active;
            const index = active
                ? snapshot.ranges.findIndex((range) => active[0] >= range[0] && active[0] <= range[2] && active[1] >= range[1] && active[1] <= range[3])
                : snapshot.ranges.length - 1;
            setSelections.call(obj, snapshot.ranges, index < 0 ? snapshot.ranges.length - 1 : index, undefined, active);
        }
    } finally {
        obj.parent.ignoreEvents = ignoreEvents;
    }
};

/**
 * Follow existing cells across structural edits. New rows/columns inside a range
 * stay unselected; deleting or moving an axis can split that range into fragments.
 */
export const remapSelectionSnapshot = function (snapshot, axis, mapIndex) {
    const ranges = [];
    for (const range of snapshot.ranges) {
        const indices = [];
        for (let index = range[axis]; index <= range[axis + 2]; index++) {
            const mapped = mapIndex(index);
            if (mapped != null) indices.push(mapped);
        }
        indices.sort((a, b) => a - b);
        let segment;
        for (const index of indices) {
            if (segment && index === segment[axis + 2] + 1) {
                segment[axis + 2] = index;
            } else {
                segment = range.slice();
                segment[axis] = segment[axis + 2] = index;
                ranges.push(segment);
            }
        }
    }
    let active = snapshot.active && snapshot.active.slice();
    if (active) {
        active[axis] = mapIndex(active[axis]);
        active[axis + 2] = mapIndex(active[axis + 2]);
        const containing = ranges.find(
            (range) => active[axis] != null && active[0] >= range[0] && active[0] <= range[2] && active[1] >= range[1] && active[1] <= range[3]
        );
        if (!containing) {
            active = ranges.length ? ranges[ranges.length - 1].slice() : null;
        } else if (
            active[axis + 2] == null ||
            active[2] < containing[0] ||
            active[2] > containing[2] ||
            active[3] < containing[1] ||
            active[3] > containing[3]
        ) {
            active = containing.slice();
        }
    }
    return { ranges, active };
};

const getMergeSnapshot = (obj) => Object.fromEntries(Object.entries(obj.options.mergeCells || {}).map(([name, range]) => [name, range.slice(0, 2)]));

/**
 * Keep nested header group membership aligned with inserted/deleted/moved columns.
 */
export const getNestedHeadersSnapshot = function () {
    return (this.options.nestedHeaders || []).map((row) => row.map((group) => ({ ...group })));
};

export const transformNestedHeaders = function (snapshot, operation, index, count, destination) {
    return snapshot.map((row) => {
        const columns = [];
        for (const group of row) {
            for (let i = 0; i < Number(group.colspan || 1); i++) columns.push(group);
        }
        if (operation === 'insert') {
            const group = columns[index] || columns[columns.length - 1] || { title: '', colspan: 1 };
            columns.splice(index, 0, ...Array(count).fill(group));
        } else if (operation === 'delete') {
            columns.splice(index, count);
        } else {
            columns.splice(destination, 0, columns.splice(index, 1)[0]);
        }
        const groups = [];
        let previous;
        for (const column of columns) {
            if (previous === column && groups.length) groups[groups.length - 1].colspan++;
            else groups.push({ ...column, colspan: 1 });
            previous = column;
        }
        return groups;
    });
};

export const restoreNestedHeaders = function (snapshot) {
    if (!snapshot) return;
    const obj = this;
    obj.thead.querySelectorAll('.jss_nested').forEach((row) => row.remove());
    obj.options.nestedHeaders = snapshot.map((row) => row.map((group) => ({ ...group })));
    for (const row of obj.options.nestedHeaders) obj.thead.insertBefore(createNestedHeader.call(obj, row), obj.headerContainer);
};

/**
 * Group all mutations belonging to one user action into a single undo step.
 */
export const beginHistoryTransaction = function () {
    if (this.ignoreHistory) return;
    if (this.historyTransaction) {
        this.historyTransaction.depth++;
    } else {
        this.historyTransaction = { depth: 1, records: [], selectionBefore: getSelectionSnapshot.call(this), mergesBefore: getMergeSnapshot(this) };
    }
};

export const endHistoryTransaction = function () {
    const transaction = this.historyTransaction;
    if (!transaction || --transaction.depth > 0) return;
    delete this.historyTransaction;
    if (transaction.records.length) {
        setHistory.call(this, {
            action: 'batch',
            records: transaction.records,
            selectionBefore: transaction.selectionBefore,
            selectionAfter: getSelectionSnapshot.call(this),
            mergesBefore: transaction.mergesBefore,
            mergesAfter: getMergeSnapshot(this),
        });
    }
};

/**
 * Initializes a new history record for undo/redo.
 */
export const setHistory = function (changes) {
    const obj = this;
    if (obj.ignoreHistory == true) return;

    changes.selectionBefore = changes.selectionBefore || getSelectionSnapshot.call(obj);
    changes.selectionAfter = changes.selectionAfter || getSelectionSnapshot.call(obj);
    if (obj.historyTransaction) {
        obj.historyTransaction.records.push(changes);
    } else {
        const index = ++obj.historyIndex;
        obj.history = obj.history.slice(0, index);
        obj.history[index] = changes;
    }
};

/**
 * Process row
 */
const historyProcessRow = function (type, historyRecord) {
    const obj = this;

    const rowIndex = !historyRecord.insertBefore ? historyRecord.rowNumber + 1 : +historyRecord.rowNumber;

    if (obj.options.search == true) {
        if (obj.results && obj.results.length != obj.rows.length) {
            obj.resetSearch();
        }
    }

    // Remove row
    if (type == 1) {
        const numOfRows = historyRecord.numOfRows;
        // Remove nodes
        for (let j = rowIndex; j < numOfRows + rowIndex; j++) {
            obj.rows[j].element.remove();
        }
        // Remove references
        obj.records.splice(rowIndex, numOfRows);
        obj.options.data.splice(rowIndex, numOfRows);
        obj.rows.splice(rowIndex, numOfRows);

        conditionalSelectionUpdate.call(obj, 1, rowIndex, numOfRows + rowIndex - 1);
    } else {
        // Insert data
        const records = historyRecord.rowRecords.map((row) => {
            return [...row];
        });
        obj.records = injectArray(obj.records, rowIndex, records);

        const data = historyRecord.rowData.map((row) => {
            return [...row];
        });
        obj.options.data = injectArray(obj.options.data, rowIndex, data);

        obj.rows = injectArray(obj.rows, rowIndex, historyRecord.rowNode);
        // Insert nodes
        let index = 0;
        for (let j = rowIndex; j < historyRecord.numOfRows + rowIndex; j++) {
            obj.tbody.insertBefore(historyRecord.rowNode[index].element, obj.tbody.children[j]);
            index++;
        }
    }

    for (let j = rowIndex; j < obj.rows.length; j++) {
        obj.rows[j].y = j;
    }

    for (let j = rowIndex; j < obj.records.length; j++) {
        for (let i = 0; i < obj.records[j].length; i++) {
            obj.records[j][i].y = j;
        }
    }

    // Respect pagination
    if (obj.options.pagination > 0) {
        obj.page(obj.pageNumber);
    }

    updateTableReferences.call(obj);
};

/**
 * Process column
 */
const historyProcessColumn = function (type, historyRecord) {
    const obj = this;

    const columnIndex = !historyRecord.insertBefore ? historyRecord.columnNumber + 1 : historyRecord.columnNumber;

    // Remove column
    if (type == 1) {
        const numOfColumns = historyRecord.numOfColumns;

        obj.options.columns.splice(columnIndex, numOfColumns);
        for (let i = columnIndex; i < numOfColumns + columnIndex; i++) {
            obj.headers[i].parentNode.removeChild(obj.headers[i]);
            obj.cols[i].colElement.parentNode.removeChild(obj.cols[i].colElement);
        }
        obj.headers.splice(columnIndex, numOfColumns);
        obj.cols.splice(columnIndex, numOfColumns);
        for (let j = 0; j < historyRecord.data.length; j++) {
            for (let i = columnIndex; i < numOfColumns + columnIndex; i++) {
                obj.records[j][i].element.parentNode.removeChild(obj.records[j][i].element);
            }
            obj.records[j].splice(columnIndex, numOfColumns);
            obj.options.data[j].splice(columnIndex, numOfColumns);
        }
        // Process footers
        if (obj.options.footers) {
            for (let j = 0; j < obj.options.footers.length; j++) {
                obj.options.footers[j].splice(columnIndex, numOfColumns);
            }
        }
    } else {
        // Insert data
        obj.options.columns = injectArray(obj.options.columns, columnIndex, historyRecord.columns);
        obj.headers = injectArray(obj.headers, columnIndex, historyRecord.headers);
        obj.cols = injectArray(obj.cols, columnIndex, historyRecord.cols);

        let index = 0;
        for (let i = columnIndex; i < historyRecord.numOfColumns + columnIndex; i++) {
            obj.headerContainer.insertBefore(historyRecord.headers[index], obj.headerContainer.children[i + 1]);
            obj.colgroupContainer.insertBefore(historyRecord.cols[index].colElement, obj.colgroupContainer.children[i + 1]);
            index++;
        }

        for (let j = 0; j < historyRecord.data.length; j++) {
            obj.options.data[j] = injectArray(obj.options.data[j], columnIndex, historyRecord.data[j]);
            obj.records[j] = injectArray(obj.records[j], columnIndex, historyRecord.records[j]);
            let index = 0;
            for (let i = columnIndex; i < historyRecord.numOfColumns + columnIndex; i++) {
                obj.rows[j].element.insertBefore(historyRecord.records[j][index].element, obj.rows[j].element.children[i + 1]);
                index++;
            }
        }
        // Process footers
        if (obj.options.footers) {
            for (let j = 0; j < obj.options.footers.length; j++) {
                obj.options.footers[j] = injectArray(obj.options.footers[j], columnIndex, historyRecord.footers[j]);
            }
        }
    }

    for (let i = columnIndex; i < obj.cols.length; i++) {
        obj.cols[i].x = i;
    }

    for (let j = 0; j < obj.records.length; j++) {
        for (let i = columnIndex; i < obj.records[j].length; i++) {
            obj.records[j][i].x = i;
        }
    }

    updateTableReferences.call(obj);
};

/**
 * Replay a single record or an atomic group without publishing partial selections.
 */
const applyHistoryRecord = function (record, backwards) {
    const obj = this;
    if (record.action === 'batch') {
        const mergesChanged = JSON.stringify(record.mergesBefore) !== JSON.stringify(record.mergesAfter);
        if (mergesChanged) obj.destroyMerge();
        const records = backwards ? record.records.slice().reverse() : record.records;
        for (const child of records) applyHistoryRecord.call(obj, child, backwards);
        if (mergesChanged) {
            const merges = backwards ? record.mergesBefore : record.mergesAfter;
            for (const [cell, range] of Object.entries(merges || {})) setMerge.call(obj, cell, range[0], range[1], true);
        }
    } else if (record.action === 'insertRow' || record.action === 'deleteRow') {
        historyProcessRow.call(obj, (record.action === 'insertRow') === backwards ? 1 : 0, record);
    } else if (record.action === 'insertColumn' || record.action === 'deleteColumn') {
        historyProcessColumn.call(obj, (record.action === 'insertColumn') === backwards ? 1 : 0, record);
    } else if (record.action === 'moveRow' || record.action === 'moveColumn') {
        obj[record.action](backwards ? record.newValue : record.oldValue, backwards ? record.oldValue : record.newValue);
    } else if (record.action === 'setMerge') {
        if (backwards) obj.removeMerge(record.column, record.data);
        else setMerge.call(obj, record.column, record.colspan, record.rowspan, 1);
    } else if (record.action === 'setStyle') {
        obj.setStyle(backwards ? record.oldValue : record.newValue, null, null, 1);
    } else if (record.action === 'setWidth') {
        obj.setWidth(record.column, backwards ? record.oldValue : record.newValue);
    } else if (record.action === 'setHeight') {
        obj.setHeight(record.row, backwards ? record.oldValue : record.newValue);
    } else if (record.action === 'setHeader') {
        obj.setHeader(record.column, backwards ? record.oldValue : record.newValue);
    } else if (record.action === 'setComments') {
        obj.setComments(backwards ? record.oldValue : record.newValue);
    } else if (record.action === 'orderBy') {
        const rows = [];
        if (backwards) {
            for (let j = 0; j < record.rows.length; j++) rows[record.rows[j]] = j;
        }
        updateOrderArrow.call(obj, record.column, backwards ? (record.order ? 0 : 1) : record.order);
        updateOrder.call(obj, backwards ? rows : record.rows);
    } else if (record.action === 'setValue') {
        obj.setValue(backwards ? record.records.map((record) => ({ x: record.x, y: record.y, value: record.oldValue })) : record.records);
        if (record.oldStyle) obj.resetStyle(backwards ? record.oldStyle : record.newStyle);
    }
    const nestedHeaders = backwards ? record.nestedHeadersBefore : record.nestedHeadersAfter;
    if (nestedHeaders) restoreNestedHeaders.call(obj, nestedHeaders);
};

const replayHistory = function (backwards) {
    const obj = this;
    const index = backwards ? obj.historyIndex : obj.historyIndex + 1;
    if (index < 0 || index >= obj.history.length) return;

    const record = obj.history[index];
    const ignoreEvents = obj.parent.ignoreEvents;
    const ignoreHistory = obj.ignoreHistory;
    obj.parent.ignoreEvents = true;
    obj.ignoreHistory = true;
    try {
        applyHistoryRecord.call(obj, record, backwards);
        const snapshot = backwards ? record.selectionBefore : record.selectionAfter;
        if (snapshot) restoreSelectionSnapshot.call(obj, snapshot);
        else if (record.selection) obj.updateSelectionFromCoords(...record.selection);
        obj.historyIndex += backwards ? -1 : 1;
    } finally {
        obj.parent.ignoreEvents = ignoreEvents;
        obj.ignoreHistory = ignoreHistory;
    }
    dispatch.call(obj, backwards ? 'onundo' : 'onredo', obj, record);
};

export const undo = function () {
    replayHistory.call(this, true);
};

export const redo = function () {
    replayHistory.call(this, false);
};
