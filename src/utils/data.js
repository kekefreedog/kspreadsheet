/**
 * Worksheet Data
 *
 * Read and replace worksheet data and cell values.
 *
 * @package    kzarshenas/kspreadsheet
 * @author     kekefreedog <kevin.zarshenas@gmail.com>
 * @copyright  2026 Kévin Zarshenas
 */

/** Dependencies */
import { captureDataState, restoreDataState } from './dataState.js';
import { createRow } from './rows.js';
import { getNumberOfColumns, createCellHeader } from './columns.js';
import { updateCell, updateFormulaChain, updateTable } from './internal.js';
import { getIdFromColumnName } from './internalHelpers.js';
import dispatch from './dispatch.js';
import { setHistory } from './history.js';
import { updatePagination } from './pagination.js';
import { setMerge } from './merges.js';
import { getCoordsFromRange } from './helpers.js';
import { getHighlighted, isSelected } from './selection.js';

/**
 * Replace worksheet data, optionally retaining the current view.
 *
 * @param {Array} data Incoming rows
 * @param {Object} options Optional preserveState and rowKey settings
 * @return {void}
 */
export const setData = function (data, options = {}) {

    // Capture the receiving worksheet
    const obj = this;

    // Snapshot view state before changing data or removing mounted rows
    const state = options?.preserveState === true ? captureDataState.call(obj, data || obj.options.data || [], options) : null;

    // Preserve the existing event policy through internal restoration
    const ignoreEvents = obj.parent.ignoreEvents;

    // Silence selection resets and restoration during an opted-in data replacement
    if(state){

        // Retain user row configuration under its remapped identity
        obj.options.rows = state.rows;

        // Avoid publishing intermediate selection changes
        obj.parent.ignoreEvents = true;

    }

    // Always restore event delivery even if a renderer rejects the new data
    try{

        // Update replacement data and layout
        obj._lastSelectionGesture = null;

        // Check replacement state
        if(obj.selectedCell && obj.highlightBorder){

            // Clear stale selection references before replacing row elements
            obj.resetSelection();

        }

        // Keep cell-creation callbacks active so new cells receive their render styling
        obj.parent.ignoreEvents = ignoreEvents;

        // Update data
        if(data){

            // Update replacement data and layout
            obj.options.data = data;

        }

        // Data
        if(!obj.options.data){

            // Update replacement data and layout
            obj.options.data = [];

        }

        // Prepare data
        if(obj.options.data && obj.options.data[0]){

            // Check replacement state
            if(!Array.isArray(obj.options.data[0])){

                // Update replacement data and layout
                data = [];

                // Visit replacement records
                for(let j = 0; j < obj.options.data.length; j++){

                    // Prepare replacement state
                    const row = [];

                    // Visit replacement records
                    for(let i = 0; i < obj.options.columns.length; i++){

                        // Update replacement data and layout
                        row[i] = obj.options.data[j][obj.options.columns[i].name];

                    }

                    // Update replacement data and layout
                    data.push(row);

                }

                // Update replacement data and layout
                obj.options.data = data;

            }

        }

        // Adjust minimal dimensions
        let j = 0;

        // Prepare replacement state
        let i = 0;

        // Prepare replacement state
        const size_i = (obj.options.columns && obj.options.columns.length) || 0;

        // Prepare replacement state
        const size_j = obj.options.data.length;

        // Prepare replacement state
        const min_i = obj.options.minDimensions[0];

        // Prepare replacement state
        const min_j = obj.options.minDimensions[1];

        // Prepare replacement state
        const max_i = min_i > size_i ? min_i : size_i;

        // Prepare replacement state
        const max_j = min_j > size_j ? min_j : size_j;

        // Visit replacement records
        for(j = 0; j < max_j; j++){

            // Visit replacement records
            for(i = 0; i < max_i; i++){

                // Check replacement state
                if(obj.options.data[j] == undefined){

                    // Update replacement data and layout
                    obj.options.data[j] = [];

                }

                // Check replacement state
                if(obj.options.data[j][i] == undefined){

                    // Update replacement data and layout
                    obj.options.data[j][i] = '';

                }

            }

        }

        // Reset containers
        obj.rows = [];

        // Update replacement data and layout
        obj.results = null;

        // Update replacement data and layout
        obj.records = [];

        // Update replacement data and layout
        obj.history = [];

        // Reset internal controllers
        obj.historyIndex = -1;

        // Reset data
        obj.tbody.innerHTML = '';

        // Prepare replacement state
        let startNumber;

        // Prepare replacement state
        let finalNumber;

        // Lazy loading
        if(obj.options.lazyLoading == true){

            // Load only 100 records
            startNumber = 0;

            // Update replacement data and layout
            finalNumber = obj.options.data.length < 100 ? obj.options.data.length : 100;

            // Check replacement state
            if(obj.options.pagination){

                // Update replacement data and layout
                obj.options.pagination = false;

                // Update replacement data and layout
                console.error('Jspreadsheet: Pagination will be disable due the lazyLoading');

            }
        }else if(obj.options.pagination){

            // Pagination
            if(!obj.pageNumber){

                // Update replacement data and layout
                obj.pageNumber = 0;

            }

            // Prepare replacement state
            var quantityPerPage = obj.options.pagination;

            // Update replacement data and layout
            startNumber = obj.options.pagination * obj.pageNumber;

            // Update replacement data and layout
            finalNumber = obj.options.pagination * obj.pageNumber + obj.options.pagination;

            // Check replacement state
            if(obj.options.data.length < finalNumber){

                // Update replacement data and layout
                finalNumber = obj.options.data.length;

            }
        }else{

            // Update replacement data and layout
            startNumber = 0;

            // Update replacement data and layout
            finalNumber = obj.options.data.length;

        }

        // Ensure headers/cols exist for every column the data requires. The header
        // cells are built once at worksheet creation from the column count known at
        // that time; if setData later supplies rows with more columns than there are
        // headers, createCell would read an undefined obj.headers[i]. Extend them here.
        const numberOfColumns = getNumberOfColumns.call(obj);

        // Check replacement state
        if(obj.headers.length < numberOfColumns){

            // Visit replacement records
            for(let i = obj.headers.length; i < numberOfColumns; i++){

                // Update replacement data and layout
                createCellHeader.call(obj, i);

                // Update replacement data and layout
                obj.headerContainer.appendChild(obj.headers[i]);

                // Update replacement data and layout
                obj.colgroupContainer.appendChild(obj.cols[i].colElement);

            }

        }

        // Append nodes to the HTML
        for(j = 0; j < obj.options.data.length; j++){

            // Create row
            const row = createRow.call(obj, j, obj.options.data[j]);

            // Append line to the table
            if(j >= startNumber && j < finalNumber){

                // Update replacement data and layout
                obj.tbody.appendChild(row.element);

            }

        }

        // Check replacement state
        if(obj.options.lazyLoading == true){

            // Do not create pagination with lazyloading activated
        } else if(obj.options.pagination){

            // Update replacement data and layout
            updatePagination.call(obj);

        }

        // Merge cells
        if(obj.options.mergeCells){

            // Prepare replacement state
            const keys = Object.keys(obj.options.mergeCells);

            // Visit replacement records
            for(let i = 0; i < keys.length; i++){

                // Prepare replacement state
                const num = obj.options.mergeCells[keys[i]];

                // Update replacement data and layout
                setMerge.call(obj, keys[i], num[0], num[1], 1);

            }

        }

        // Update the table with custom configurations if applicable
        updateTable.call(obj);

        // Restore the logical selection and visible lazy window after rebuilding
        if(state){

            // Suppress only the transient search and selection changes during restoration
            obj.parent.ignoreEvents = true;

            // Keep the mounted worksheet view stable across snapshots
            restoreDataState.call(obj, state);

        }

    }finally{

        // Restore the caller's original event delivery policy
        obj.parent.ignoreEvents = ignoreEvents;

    }
};

/**
 * Get the value from a cell
 *
 * @param object cell
 * @return string value
 */
export const getValue = function (cell, processedValue) {
    const obj = this;

    let x;
    let y;

    if (typeof cell !== 'string') {
        return null;
    }

    cell = getIdFromColumnName(cell, true);
    x = cell[0];
    y = cell[1];

    let value = null;

    if (x != null && y != null) {
        if (obj.records[y] && obj.records[y][x] && processedValue) {
            value = obj.records[y][x].element.innerHTML;
        } else {
            if (obj.options.data[y] && obj.options.data[y][x] != 'undefined') {
                value = obj.options.data[y][x];
            }
        }
    }

    return value;
};

/**
 * Get the value from a coords
 *
 * @param int x
 * @param int y
 * @return string value
 */
export const getValueFromCoords = function (x, y, processedValue) {
    const obj = this;

    let value = null;

    if (x != null && y != null) {
        if (obj.records[y] && obj.records[y][x] && processedValue) {
            value = obj.records[y][x].element.innerHTML;
        } else {
            if (obj.options.data[y] && obj.options.data[y][x] != 'undefined') {
                value = obj.options.data[y][x];
            }
        }
    }

    return value;
};

/**
 * Set a cell value
 *
 * @param mixed cell destination cell
 * @param string value value
 * @return void
 */
export const setValue = function (cell, value, force) {
    const obj = this;

    const records = [];

    if (typeof cell == 'string') {
        const columnId = getIdFromColumnName(cell, true);
        const x = columnId[0];
        const y = columnId[1];

        // Update cell
        records.push(updateCell.call(obj, x, y, value, force));

        // Update all formulas in the chain
        updateFormulaChain.call(obj, x, y, records);
    } else {
        let x = null;
        let y = null;
        if (cell && cell.getAttribute) {
            x = cell.getAttribute('data-x');
            y = cell.getAttribute('data-y');
        }

        // Update cell
        if (x != null && y != null) {
            records.push(updateCell.call(obj, x, y, value, force));

            // Update all formulas in the chain
            updateFormulaChain.call(obj, x, y, records);
        } else {
            const keys = Object.keys(cell);
            if (keys.length > 0) {
                for (let i = 0; i < keys.length; i++) {
                    let x, y;

                    if (typeof cell[i] == 'string') {
                        const columnId = getIdFromColumnName(cell[i], true);
                        x = columnId[0];
                        y = columnId[1];
                    } else {
                        if (cell[i].x != null && cell[i].y != null) {
                            x = cell[i].x;
                            y = cell[i].y;
                            // Flexible setup
                            if (cell[i].value != null) {
                                value = cell[i].value;
                            }
                        } else {
                            x = cell[i].getAttribute('data-x');
                            y = cell[i].getAttribute('data-y');
                        }
                    }

                    // Update cell
                    if (x != null && y != null) {
                        records.push(updateCell.call(obj, x, y, value, force));

                        // Update all formulas in the chain
                        updateFormulaChain.call(obj, x, y, records);
                    }
                }
            }
        }
    }

    // Update history
    setHistory.call(obj, {
        action: 'setValue',
        records: records,
        selection: obj.selectedCell,
    });

    // Update table with custom configurations if applicable
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

/**
 * Set a cell value based on coordinates
 *
 * @param int x destination cell
 * @param int y destination cell
 * @param string value
 * @return void
 */
export const setValueFromCoords = function (x, y, value, force) {
    const obj = this;

    const records = [];
    records.push(updateCell.call(obj, x, y, value, force));

    // Update all formulas in the chain
    updateFormulaChain.call(obj, x, y, records);

    // Update history
    setHistory.call(obj, {
        action: 'setValue',
        records: records,
        selection: obj.selectedCell,
    });

    // Update table with custom configurations if applicable
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

/**
 * Get the whole table data
 *
 * @param bool get highlighted cells only
 * @return array data
 */
export const getData = function (highlighted, processed, delimiter, asJson) {
    const obj = this;

    // Control vars
    const dataset = [];
    let px = 0;
    let py = 0;

    // Column and row length
    const x = Math.max(
        ...obj.options.data.map(function (row) {
            return row.length;
        })
    );
    const y = obj.options.data.length;
    const ranges = highlighted ? getHighlighted.call(obj) : [];
    const preserveGaps = ranges.length > 1 && obj.options.copyPreserveGaps !== false;
    const left = preserveGaps ? Math.min(...ranges.map((range) => range[0])) : 0;
    const top = preserveGaps ? Math.min(...ranges.map((range) => range[1])) : 0;
    const right = preserveGaps ? Math.max(...ranges.map((range) => range[2])) + 1 : x;
    const bottom = preserveGaps ? Math.max(...ranges.map((range) => range[3])) + 1 : y;

    // Go through the columns to get the data
    for (let j = top; j < bottom; j++) {
        px = 0;
        for (let i = left; i < right; i++) {
            const selected =
                !highlighted ||
                (isSelected.call(obj, i, j) &&
                    obj.records[j][i].element.style.display !== 'none' &&
                    obj.rows[j].element.style.display !== 'none' &&
                    obj.headers[i].style.display !== 'none' &&
                    obj.options.columns[i]?.type !== 'hidden');
            if (preserveGaps && !selected) {
                if (!dataset[py]) dataset[py] = [];
                dataset[py][px++] = '';
                continue;
            }
            // Cell selected or fullset
            if (selected) {
                // Get value
                if (!dataset[py]) {
                    dataset[py] = [];
                }
                if (processed) {
                    // The rendered cell is an <img> element; the "processed" value should be
                    // the raw source (data:image/URL), not the literal `<img src="...">`
                    // markup that `.innerHTML` would give here — mirrors the checkbox/radio
                    // handling right below and the same fix applied to copy() in copyPaste.js.
                    const colType = (obj.options.columns && obj.options.columns[i] && obj.options.columns[i].type) || obj.options.defaultCellType;
                    if (colType == 'image') {
                        dataset[py][px] = obj.options.data[j][i];
                    } else {
                        dataset[py][px] = obj.records[j][i].element.innerHTML;
                    }
                } else {
                    dataset[py][px] = obj.options.data[j][i];
                }
                px++;
            }
        }
        if (px > 0) {
            py++;
        }
    }

    if (delimiter) {
        return (
            dataset
                .map(function (row) {
                    return row.join(delimiter);
                })
                .join('\r\n') + '\r\n'
        );
    }

    if (asJson) {
        return dataset.map(function (row) {
            const resultRow = {};

            row.forEach(function (item, index) {
                resultRow[index] = item;
            });

            return resultRow;
        });
    }

    return dataset;
};

export const getDataFromRange = function (range, processed) {
    const obj = this;

    const coords = getCoordsFromRange(range);

    const dataset = [];

    for (let y = coords[1]; y <= coords[3]; y++) {
        dataset.push([]);

        for (let x = coords[0]; x <= coords[2]; x++) {
            if (processed) {
                // Same reasoning as getData() above: an image cell's "processed" value should
                // be the raw source, not the literal `<img src="...">` markup.
                const colType = (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type) || obj.options.defaultCellType;
                if (colType == 'image') {
                    dataset[dataset.length - 1].push(obj.options.data[y][x]);
                } else {
                    dataset[dataset.length - 1].push(obj.records[y][x].element.innerHTML);
                }
            } else {
                dataset[dataset.length - 1].push(obj.options.data[y][x]);
            }
        }
    }

    return dataset;
};
