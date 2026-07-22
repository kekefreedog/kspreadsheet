import { updateScroll } from './internal.js';
import { loadDown, loadPage, loadUp, loadValidation } from './lazyLoading.js';

// Same "blank" convention already used elsewhere in this codebase (e.g. updateTable's
// spare-row/column detection): a falsy data value (undefined, null, '', 0) counts as empty.
const isCellEmpty = function (obj, x, y) {
    const row = obj.options.data[y];
    return !row || !row[x];
};

const upGet = function (x, y) {
    const obj = this;

    x = parseInt(x);
    y = parseInt(y);
    for (let j = y - 1; j >= 0; j--) {
        if (obj.records[j][x].element.style.display != 'none' && obj.rows[j].element.style.display != 'none') {
            if (obj.records[j][x].element.getAttribute('data-merged')) {
                if (obj.records[j][x].element == obj.records[y][x].element) {
                    continue;
                }
            }
            y = j;
            break;
        }
    }

    return y;
};

/**
 * Ctrl/Cmd + Up: jump to the data edge (matches Excel/Google Sheets) instead of the
 * absolute top of the sheet. The mode is decided by the cell ADJACENT to the current one
 * (one step away), not the current cell itself: if that adjacent cell is blank, skip
 * forward through blanks to the first non-empty cell (or the sheet edge if none); if it has
 * data, skip through the contiguous non-empty run to the last non-empty cell before a blank
 * (or the sheet edge). Reuses upGet for the actual step so hidden rows/merged cells are
 * still respected exactly as they are for a plain single-step arrow press.
 */
const upEdgeGet = function (x, y) {
    const obj = this;

    x = parseInt(x);
    y = parseInt(y);

    const adjacent = upGet.call(obj, x, y);
    if (adjacent === y) {
        return y;
    }

    const skippingBlanks = isCellEmpty(obj, x, adjacent);
    y = adjacent;

    for (;;) {
        const next = upGet.call(obj, x, y);
        if (next === y) {
            return y;
        }

        const nextEmpty = isCellEmpty(obj, x, next);

        if (skippingBlanks) {
            if (!nextEmpty) {
                return next;
            }
            y = next;
        } else {
            if (nextEmpty) {
                return y;
            }
            y = next;
        }
    }
};

const upVisible = function (group, direction) {
    const obj = this;

    let x, y;

    if (group == 0) {
        x = parseInt(obj.selectedCell[0]);
        y = parseInt(obj.selectedCell[1]);
    } else {
        x = parseInt(obj.selectedCell[2]);
        y = parseInt(obj.selectedCell[3]);
    }

    if (direction == 2) {
        // Ctrl/Cmd + Up: smart data-edge jump
        y = upEdgeGet.call(obj, x, y);
    } else if (direction == 0) {
        // Home/End-family "absolute edge of the sheet" (unrelated to data)
        for (let j = 0; j < y; j++) {
            if (obj.records[j][x].element.style.display != 'none' && obj.rows[j].element.style.display != 'none') {
                y = j;
                break;
            }
        }
    } else {
        y = upGet.call(obj, x, y);
    }

    if (group == 0) {
        obj.selectedCell[0] = x;
        obj.selectedCell[1] = y;
    } else {
        obj.selectedCell[2] = x;
        obj.selectedCell[3] = y;
    }
};

export const up = function (shiftKey, ctrlKey) {
    const obj = this;

    if (shiftKey) {
        if (obj.selectedCell[3] > 0) {
            upVisible.call(obj, 1, ctrlKey ? 2 : 1);
        }
    } else {
        if (obj.selectedCell[1] > 0) {
            upVisible.call(obj, 0, ctrlKey ? 2 : 1);
        }
        obj.selectedCell[2] = obj.selectedCell[0];
        obj.selectedCell[3] = obj.selectedCell[1];
    }

    // Update selection
    obj.updateSelectionFromCoords(obj.selectedCell[0], obj.selectedCell[1], obj.selectedCell[2], obj.selectedCell[3]);

    // Change page
    if (obj.options.lazyLoading == true) {
        if (obj.selectedCell[1] == 0 || obj.selectedCell[3] == 0) {
            loadPage.call(obj, 0);
            obj.updateSelectionFromCoords(obj.selectedCell[0], obj.selectedCell[1], obj.selectedCell[2], obj.selectedCell[3]);
        } else {
            if (loadValidation.call(obj)) {
                obj.updateSelectionFromCoords(obj.selectedCell[0], obj.selectedCell[1], obj.selectedCell[2], obj.selectedCell[3]);
            } else {
                const item = parseInt(obj.tbody.firstChild.getAttribute('data-y'));
                if (obj.selectedCell[1] - item < 30) {
                    loadUp.call(obj);
                    obj.updateSelectionFromCoords(obj.selectedCell[0], obj.selectedCell[1], obj.selectedCell[2], obj.selectedCell[3]);
                }
            }
        }
    } else if (obj.options.pagination > 0) {
        const pageNumber = obj.whichPage(obj.selectedCell[3]);
        if (pageNumber != obj.pageNumber) {
            obj.page(pageNumber);
        }
    }

    updateScroll.call(obj, 1);
};

export const rightGet = function (x, y) {
    const obj = this;

    x = parseInt(x);
    y = parseInt(y);

    for (let i = x + 1; i < obj.headers.length; i++) {
        if (obj.records[y][i].element.style.display != 'none') {
            if (obj.records[y][i].element.getAttribute('data-merged')) {
                if (obj.records[y][i].element == obj.records[y][x].element) {
                    continue;
                }
            }
            x = i;
            break;
        }
    }

    return x;
};

/** Ctrl/Cmd + Right: jump to the data edge — see upEdgeGet for the full explanation. */
const rightEdgeGet = function (x, y) {
    const obj = this;

    x = parseInt(x);
    y = parseInt(y);

    const adjacent = rightGet.call(obj, x, y);
    if (adjacent === x) {
        return x;
    }

    const skippingBlanks = isCellEmpty(obj, adjacent, y);
    x = adjacent;

    for (;;) {
        const next = rightGet.call(obj, x, y);
        if (next === x) {
            return x;
        }

        const nextEmpty = isCellEmpty(obj, next, y);

        if (skippingBlanks) {
            if (!nextEmpty) {
                return next;
            }
            x = next;
        } else {
            if (nextEmpty) {
                return x;
            }
            x = next;
        }
    }
};

const rightVisible = function (group, direction) {
    const obj = this;

    let x, y;

    if (group == 0) {
        x = parseInt(obj.selectedCell[0]);
        y = parseInt(obj.selectedCell[1]);
    } else {
        x = parseInt(obj.selectedCell[2]);
        y = parseInt(obj.selectedCell[3]);
    }

    if (direction == 2) {
        // Ctrl/Cmd + Right: smart data-edge jump
        x = rightEdgeGet.call(obj, x, y);
    } else if (direction == 0) {
        // Home/End-family "absolute edge of the sheet" (unrelated to data)
        for (let i = obj.headers.length - 1; i > x; i--) {
            if (obj.records[y][i].element.style.display != 'none') {
                x = i;
                break;
            }
        }
    } else {
        x = rightGet.call(obj, x, y);
    }

    if (group == 0) {
        obj.selectedCell[0] = x;
        obj.selectedCell[1] = y;
    } else {
        obj.selectedCell[2] = x;
        obj.selectedCell[3] = y;
    }
};

export const right = function (shiftKey, ctrlKey) {
    const obj = this;

    if (shiftKey) {
        if (obj.selectedCell[2] < obj.headers.length - 1) {
            rightVisible.call(obj, 1, ctrlKey ? 2 : 1);
        }
    } else {
        if (obj.selectedCell[0] < obj.headers.length - 1) {
            rightVisible.call(obj, 0, ctrlKey ? 2 : 1);
        }
        obj.selectedCell[2] = obj.selectedCell[0];
        obj.selectedCell[3] = obj.selectedCell[1];
    }

    obj.updateSelectionFromCoords(obj.selectedCell[0], obj.selectedCell[1], obj.selectedCell[2], obj.selectedCell[3]);
    updateScroll.call(obj, 2);
};

export const downGet = function (x, y) {
    const obj = this;

    x = parseInt(x);
    y = parseInt(y);
    for (let j = y + 1; j < obj.rows.length; j++) {
        if (obj.records[j][x].element.style.display != 'none' && obj.rows[j].element.style.display != 'none') {
            if (obj.records[j][x].element.getAttribute('data-merged')) {
                if (obj.records[j][x].element == obj.records[y][x].element) {
                    continue;
                }
            }
            y = j;
            break;
        }
    }

    return y;
};

/** Ctrl/Cmd + Down: jump to the data edge — see upEdgeGet for the full explanation. */
const downEdgeGet = function (x, y) {
    const obj = this;

    x = parseInt(x);
    y = parseInt(y);

    const adjacent = downGet.call(obj, x, y);
    if (adjacent === y) {
        return y;
    }

    const skippingBlanks = isCellEmpty(obj, x, adjacent);
    y = adjacent;

    for (;;) {
        const next = downGet.call(obj, x, y);
        if (next === y) {
            return y;
        }

        const nextEmpty = isCellEmpty(obj, x, next);

        if (skippingBlanks) {
            if (!nextEmpty) {
                return next;
            }
            y = next;
        } else {
            if (nextEmpty) {
                return y;
            }
            y = next;
        }
    }
};

const downVisible = function (group, direction) {
    const obj = this;

    let x, y;

    if (group == 0) {
        x = parseInt(obj.selectedCell[0]);
        y = parseInt(obj.selectedCell[1]);
    } else {
        x = parseInt(obj.selectedCell[2]);
        y = parseInt(obj.selectedCell[3]);
    }

    if (direction == 2) {
        // Ctrl/Cmd + Down: smart data-edge jump
        y = downEdgeGet.call(obj, x, y);
    } else if (direction == 0) {
        // Home/End-family "absolute edge of the sheet" (unrelated to data)
        for (let j = obj.rows.length - 1; j > y; j--) {
            if (obj.records[j][x].element.style.display != 'none' && obj.rows[j].element.style.display != 'none') {
                y = j;
                break;
            }
        }
    } else {
        y = downGet.call(obj, x, y);
    }

    if (group == 0) {
        obj.selectedCell[0] = x;
        obj.selectedCell[1] = y;
    } else {
        obj.selectedCell[2] = x;
        obj.selectedCell[3] = y;
    }
};

export const down = function (shiftKey, ctrlKey) {
    const obj = this;

    if (shiftKey) {
        if (obj.selectedCell[3] < obj.records.length - 1) {
            downVisible.call(obj, 1, ctrlKey ? 2 : 1);
        }
    } else {
        if (obj.selectedCell[1] < obj.records.length - 1) {
            downVisible.call(obj, 0, ctrlKey ? 2 : 1);
        }
        obj.selectedCell[2] = obj.selectedCell[0];
        obj.selectedCell[3] = obj.selectedCell[1];
    }

    obj.updateSelectionFromCoords(obj.selectedCell[0], obj.selectedCell[1], obj.selectedCell[2], obj.selectedCell[3]);

    // Change page
    if (obj.options.lazyLoading == true) {
        if (obj.selectedCell[1] == obj.records.length - 1 || obj.selectedCell[3] == obj.records.length - 1) {
            loadPage.call(obj, -1);
            obj.updateSelectionFromCoords(obj.selectedCell[0], obj.selectedCell[1], obj.selectedCell[2], obj.selectedCell[3]);
        } else {
            if (loadValidation.call(obj)) {
                obj.updateSelectionFromCoords(obj.selectedCell[0], obj.selectedCell[1], obj.selectedCell[2], obj.selectedCell[3]);
            } else {
                const item = parseInt(obj.tbody.lastChild.getAttribute('data-y'));
                if (item - obj.selectedCell[3] < 30) {
                    loadDown.call(obj);
                    obj.updateSelectionFromCoords(obj.selectedCell[0], obj.selectedCell[1], obj.selectedCell[2], obj.selectedCell[3]);
                }
            }
        }
    } else if (obj.options.pagination > 0) {
        const pageNumber = obj.whichPage(obj.selectedCell[3]);
        if (pageNumber != obj.pageNumber) {
            obj.page(pageNumber);
        }
    }

    updateScroll.call(obj, 3);
};

const leftGet = function (x, y) {
    const obj = this;

    x = parseInt(x);
    y = parseInt(y);
    for (let i = x - 1; i >= 0; i--) {
        if (obj.records[y][i].element.style.display != 'none') {
            if (obj.records[y][i].element.getAttribute('data-merged')) {
                if (obj.records[y][i].element == obj.records[y][x].element) {
                    continue;
                }
            }
            x = i;
            break;
        }
    }

    return x;
};

/** Ctrl/Cmd + Left: jump to the data edge — see upEdgeGet for the full explanation. */
const leftEdgeGet = function (x, y) {
    const obj = this;

    x = parseInt(x);
    y = parseInt(y);

    const adjacent = leftGet.call(obj, x, y);
    if (adjacent === x) {
        return x;
    }

    const skippingBlanks = isCellEmpty(obj, adjacent, y);
    x = adjacent;

    for (;;) {
        const next = leftGet.call(obj, x, y);
        if (next === x) {
            return x;
        }

        const nextEmpty = isCellEmpty(obj, next, y);

        if (skippingBlanks) {
            if (!nextEmpty) {
                return next;
            }
            x = next;
        } else {
            if (nextEmpty) {
                return x;
            }
            x = next;
        }
    }
};

const leftVisible = function (group, direction) {
    const obj = this;

    let x, y;

    if (group == 0) {
        x = parseInt(obj.selectedCell[0]);
        y = parseInt(obj.selectedCell[1]);
    } else {
        x = parseInt(obj.selectedCell[2]);
        y = parseInt(obj.selectedCell[3]);
    }

    if (direction == 2) {
        // Ctrl/Cmd + Left: smart data-edge jump
        x = leftEdgeGet.call(obj, x, y);
    } else if (direction == 0) {
        // Home/End-family "absolute edge of the sheet" (unrelated to data)
        for (let i = 0; i < x; i++) {
            if (obj.records[y][i].element.style.display != 'none') {
                x = i;
                break;
            }
        }
    } else {
        x = leftGet.call(obj, x, y);
    }

    if (group == 0) {
        obj.selectedCell[0] = x;
        obj.selectedCell[1] = y;
    } else {
        obj.selectedCell[2] = x;
        obj.selectedCell[3] = y;
    }
};

export const left = function (shiftKey, ctrlKey) {
    const obj = this;

    if (shiftKey) {
        if (obj.selectedCell[2] > 0) {
            leftVisible.call(obj, 1, ctrlKey ? 2 : 1);
        }
    } else {
        if (obj.selectedCell[0] > 0) {
            leftVisible.call(obj, 0, ctrlKey ? 2 : 1);
        }
        obj.selectedCell[2] = obj.selectedCell[0];
        obj.selectedCell[3] = obj.selectedCell[1];
    }

    obj.updateSelectionFromCoords(obj.selectedCell[0], obj.selectedCell[1], obj.selectedCell[2], obj.selectedCell[3]);
    updateScroll.call(obj, 0);
};

export const first = function (shiftKey, ctrlKey) {
    const obj = this;

    if (shiftKey) {
        if (ctrlKey) {
            obj.selectedCell[3] = 0;
        } else {
            leftVisible.call(obj, 1, 0);
        }
    } else {
        if (ctrlKey) {
            obj.selectedCell[1] = 0;
        } else {
            leftVisible.call(obj, 0, 0);
        }
        obj.selectedCell[2] = obj.selectedCell[0];
        obj.selectedCell[3] = obj.selectedCell[1];
    }

    // Change page
    if (obj.options.lazyLoading == true && (obj.selectedCell[1] == 0 || obj.selectedCell[3] == 0)) {
        loadPage.call(obj, 0);
    } else if (obj.options.pagination > 0) {
        const pageNumber = obj.whichPage(obj.selectedCell[3]);
        if (pageNumber != obj.pageNumber) {
            obj.page(pageNumber);
        }
    }

    obj.updateSelectionFromCoords(obj.selectedCell[0], obj.selectedCell[1], obj.selectedCell[2], obj.selectedCell[3]);
    updateScroll.call(obj, 1);
};

export const last = function (shiftKey, ctrlKey) {
    const obj = this;

    if (shiftKey) {
        if (ctrlKey) {
            obj.selectedCell[3] = obj.records.length - 1;
        } else {
            rightVisible.call(obj, 1, 0);
        }
    } else {
        if (ctrlKey) {
            obj.selectedCell[1] = obj.records.length - 1;
        } else {
            rightVisible.call(obj, 0, 0);
        }
        obj.selectedCell[2] = obj.selectedCell[0];
        obj.selectedCell[3] = obj.selectedCell[1];
    }

    // Change page
    if (obj.options.lazyLoading == true && (obj.selectedCell[1] == obj.records.length - 1 || obj.selectedCell[3] == obj.records.length - 1)) {
        loadPage.call(obj, -1);
    } else if (obj.options.pagination > 0) {
        const pageNumber = obj.whichPage(obj.selectedCell[3]);
        if (pageNumber != obj.pageNumber) {
            obj.page(pageNumber);
        }
    }

    obj.updateSelectionFromCoords(obj.selectedCell[0], obj.selectedCell[1], obj.selectedCell[2], obj.selectedCell[3]);
    updateScroll.call(obj, 3);
};
