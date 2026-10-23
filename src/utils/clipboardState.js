let clipboardState = null;

// Textareas and operating-system clipboards normalize CRLF to LF. Compare complete
// normalized strings, never hashes, so unrelated clipboard text cannot restore a mask.
export const normalizeClipboardText = (text) => String(text).replace(/\r\n?/g, '\n');

export const setClipboardState = function (state) {
    clipboardState = state;
};

export const getClipboardState = function (text) {
    if (!clipboardState || typeof text !== 'string') return null;
    const normalized = normalizeClipboardText(text);
    return normalized === normalizeClipboardText(clipboardState.text) || normalized === normalizeClipboardText(clipboardState.rawText) ? clipboardState : null;
};

/**
 * Build a clipboard snapshot without reading values from unselected cells.
 * The mask distinguishes an empty selected cell from a gap in the selection.
 */
export const createSelectionClipboard = function (obj, ranges, delimiter = '\t') {
    const selected = new Map();

    for (const range of ranges) {
        for (let y = range[1]; y <= range[3]; y++) {
            if (!obj.rows[y] || obj.rows[y].element.style.display === 'none') continue;

            for (let x = range[0]; x <= range[2]; x++) {
                const record = obj.records[y] && obj.records[y][x];
                if (!record || obj.headers[x].style.display === 'none' || record.element.style.display === 'none') continue;

                const key = x + ':' + y;
                if (selected.has(key)) continue;

                const type = (obj.options.columns[x] && obj.options.columns[x].type) || obj.options.defaultCellType;
                const value = obj.options.data[y][x];
                const element = record.element;
                // Covered cells of an existing merge retain their logical position, but not a duplicate label.
                const isAnchor = Number(element.getAttribute('data-x')) === x && Number(element.getAttribute('data-y')) === y;
                const label = !isAnchor ? '' : ['checkbox', 'radio', 'image'].includes(type) ? value : element.innerHTML;
                selected.set(key, { x, y, value, label, style: (element.getAttribute('style') || '').replace(/display:\s*none;?/g, '') });
            }
        }
    }

    const cells = Array.from(selected.values()).sort((a, b) => a.y - b.y || a.x - b.x);
    if (!cells.length) return null;

    const preserveGaps = obj.options.copyPreserveGaps !== false;
    let left = Infinity;
    let top = Infinity;
    let right = -1;
    let bottom = -1;
    for (const cell of cells) {
        left = Math.min(left, cell.x);
        top = Math.min(top, cell.y);
        right = Math.max(right, cell.x);
        bottom = Math.max(bottom, cell.y);
    }

    const rows = [];
    let previousRow = -1;
    let rowIndex = -1;
    let columnIndex = 0;
    for (const cell of cells) {
        if (cell.y !== previousRow) {
            previousRow = cell.y;
            rowIndex++;
            columnIndex = 0;
        }
        const y = preserveGaps ? cell.y - top : rowIndex;
        const x = preserveGaps ? cell.x - left : columnIndex++;
        if (!rows[y]) rows[y] = [];
        rows[y][x] = cell;
    }

    const width = preserveGaps ? right - left + 1 : Math.max(...rows.map((row) => row.length));
    const height = preserveGaps ? bottom - top + 1 : rows.length;
    const values = [];
    const labels = [];
    const styles = [];
    const mask = [];
    for (let y = 0; y < height; y++) {
        values[y] = [];
        labels[y] = [];
        styles[y] = [];
        mask[y] = [];
        for (let x = 0; x < width; x++) {
            const cell = rows[y] && rows[y][x];
            values[y][x] = cell ? cell.value : '';
            labels[y][x] = cell ? cell.label : '';
            styles[y][x] = cell ? cell.style : '';
            mask[y][x] = Boolean(cell);
        }
    }

    return {
        width,
        height,
        values,
        labels,
        styles,
        mask,
        ranges: ranges.map((range) => range.slice()),
        rawText: serializeClipboard(values, delimiter),
        text: serializeClipboard(labels, delimiter),
    };
};

export const serializeClipboard = function (rows, delimiter = '\t') {
    return rows
        .map((row) =>
            row
                .map((value) => {
                    const text = value == null ? '' : String(value);
                    return text.includes(delimiter) || /[,\r\n"]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
                })
                .join(delimiter)
        )
        .join('\r\n');
};

const isVisibleIndex = function (obj, index, vertical) {
    if (vertical) return !obj.rows[index] || obj.rows[index].element.style.display !== 'none';
    return !obj.headers[index] || obj.headers[index].style.display !== 'none';
};

const visibleIndices = function (obj, start, end, vertical) {
    const indices = [];
    for (let index = start; index <= end; index++) {
        if (isVisibleIndex(obj, index, vertical)) indices.push(index);
    }
    return indices;
};

const extendIndices = function (obj, start, count, vertical) {
    const indices = [];
    for (let index = start; indices.length < count; index++) {
        if (isVisibleIndex(obj, index, vertical)) indices.push(index);
    }
    return indices;
};

/**
 * Validate every destination before changing any values. Multi-range destinations must
 * fit whole source blocks; a single destination retains normal spreadsheet expansion.
 */
export const createPastePlan = function (obj, x, y, source, ranges) {
    // The active gesture may cover only part of a coalesced range, or run backwards.
    // Paste into the canonical selected union when its origin is selected; an explicit
    // origin elsewhere must not inherit the active selection's unrelated far edge.
    const destinations = ranges.some((range) => x >= range[0] && x <= range[2] && y >= range[1] && y <= range[3]) ? ranges : [[x, y, x, y]];
    const multipleDestinations = destinations.length > 1;
    const targets = new Map();
    const elements = new Set();
    const scalar = source.width === 1 && source.height === 1;

    for (const range of destinations) {
        let columns = visibleIndices(obj, range[0], range[2], false);
        let rows = visibleIndices(obj, range[1], range[3], true);
        if (!columns.length || !rows.length) continue;

        if (multipleDestinations) {
            if (columns.length % source.width || rows.length % source.height) return false;
        } else {
            const width = columns.length >= source.width && columns.length % source.width === 0 ? columns.length : source.width;
            const height = rows.length >= source.height && rows.length % source.height === 0 ? rows.length : source.height;
            columns = extendIndices(obj, range[0], width, false);
            rows = extendIndices(obj, range[1], height, true);
        }

        for (let row = 0; row < rows.length; row++) {
            for (let column = 0; column < columns.length; column++) {
                const sourceY = row % source.height;
                const sourceX = column % source.width;
                if (source.mask && !source.mask[sourceY][sourceX]) continue;

                let targetX = columns[column];
                let targetY = rows[row];
                const record = obj.records[targetY] && obj.records[targetY][targetX];
                if (record && record.element.hasAttribute('data-merged')) {
                    // A scalar may fill a merged cell once; block pastes must not split or overwrite a merge.
                    if (!scalar) return false;
                    targetX = Number(record.element.getAttribute('data-x'));
                    targetY = Number(record.element.getAttribute('data-y'));
                    if (elements.has(record.element)) continue;
                    elements.add(record.element);
                }

                targets.set(targetX + ':' + targetY, {
                    x: targetX,
                    y: targetY,
                    value: source.values[sourceY][sourceX],
                    style: source.styles ? source.styles[sourceY][sourceX] : null,
                });
            }
        }
    }

    const result = Array.from(targets.values()).sort((a, b) => a.y - b.y || a.x - b.x);
    if (!result.length) return false;
    return result;
};
