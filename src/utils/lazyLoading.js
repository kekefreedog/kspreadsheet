/**
 * Frozen rows (freezeRows) always remain in the DOM regardless of the lazy-loading window
 * — they're pinned via CSS `position: sticky` and rely on being physically present at all
 * times. Without this, the windowing logic below (which treats `tbody.firstChild` as "the
 * oldest loaded row" and blindly evicts/relocates it) would evict the frozen rows as soon as
 * the window slides past the initial page, since they sit at the very front of `tbody`.
 *
 * This only applies to the plain (non search/filter) lazy-loading path: when `obj.results`
 * reorders/filters which rows are shown, "frozen by original row index" doesn't map onto
 * that cleanly, so that path is left untouched (matches prior behavior).
 */
export const firstNonFrozenChild = function (obj) {
    const freezeRows = obj.options.freezeRows || 0;
    let child = obj.tbody.firstChild;
    while (child && parseInt(child.getAttribute('data-y')) < freezeRows) {
        child = child.nextSibling;
    }
    return child;
};

const removeOldestLoadedRow = function (obj, usingResults) {
    if (obj.options.freezeRows && !usingResults) {
        const child = firstNonFrozenChild(obj);
        if (child) {
            obj.tbody.removeChild(child);
        }
    } else {
        obj.tbody.removeChild(obj.tbody.firstChild);
    }
};

/**
 * Go to a page in a lazyLoading
 */
export const loadPage = function (pageNumber) {
    const obj = this;

    // Search
    const usingResults = (obj.options.search == true || obj.options.filters == true) && obj.results;
    const results = usingResults ? obj.results : obj.rows;

    // Per page
    const quantityPerPage = 100;

    // pageNumber
    if (pageNumber == null || pageNumber == -1) {
        // Last page
        pageNumber = Math.ceil(results.length / quantityPerPage) - 1;
    }

    let startRow = pageNumber * quantityPerPage;
    let finalRow = pageNumber * quantityPerPage + quantityPerPage;
    if (finalRow > results.length) {
        finalRow = results.length;
    }
    startRow = finalRow - 100;
    if (startRow < 0) {
        startRow = 0;
    }

    const freezeRows = !usingResults ? obj.options.freezeRows || 0 : 0;

    // Appeding items
    for (let j = startRow; j < finalRow; j++) {
        // Frozen rows are already permanently present at the front of tbody — appending
        // them again would relocate them (appendChild moves an already-attached node),
        // breaking their pinned position.
        if (j < freezeRows) {
            continue;
        }

        if (usingResults) {
            obj.tbody.appendChild(obj.rows[results[j]].element);
        } else {
            obj.tbody.appendChild(obj.rows[j].element);
        }

        if (obj.tbody.children.length > quantityPerPage) {
            removeOldestLoadedRow(obj, usingResults);
        }
    }
};

export const loadValidation = function () {
    const obj = this;

    if (obj.selectedCell) {
        const firstChild = (obj.options.freezeRows && firstNonFrozenChild(obj)) || obj.tbody.firstChild;
        const currentPage = parseInt(firstChild.getAttribute('data-y')) / 100;
        const selectedPage = parseInt(obj.selectedCell[3] / 100);
        const totalPages = parseInt(obj.rows.length / 100);

        if (currentPage != selectedPage && selectedPage <= totalPages) {
            if (!Array.prototype.indexOf.call(obj.tbody.children, obj.rows[obj.selectedCell[3]].element)) {
                obj.loadPage(selectedPage);
                return true;
            }
        }
    }

    return false;
};

export const loadUp = function () {
    const obj = this;

    // Search
    const usingResults = (obj.options.search == true || obj.options.filters == true) && obj.results;
    const results = usingResults ? obj.results : obj.rows;

    let test = 0;
    if (results.length > 100) {
        const freezeRows = obj.options.freezeRows || 0;

        // Get the first (non-frozen) element in the page
        const anchor = (!usingResults && freezeRows && firstNonFrozenChild(obj)) || obj.tbody.firstChild;
        if (!anchor) {
            return test;
        }

        let item = parseInt(anchor.getAttribute('data-y'));
        if (usingResults) {
            item = results.indexOf(item);
        }
        if (item > 0) {
            for (let j = 0; j < 30; j++) {
                item = item - 1;
                // Never re-touch/relocate rows that are already permanently present as frozen rows
                if (item > -1 && (usingResults || item >= freezeRows)) {
                    const insertBeforeEl = (!usingResults && freezeRows && firstNonFrozenChild(obj)) || obj.tbody.firstChild;
                    if (usingResults) {
                        obj.tbody.insertBefore(obj.rows[results[item]].element, insertBeforeEl);
                    } else {
                        obj.tbody.insertBefore(obj.rows[item].element, insertBeforeEl);
                    }
                    if (obj.tbody.children.length > 100) {
                        obj.tbody.removeChild(obj.tbody.lastChild);
                        test = 1;
                    }
                }
            }
        }
    }
    return test;
};

export const loadDown = function () {
    const obj = this;

    // Search
    const usingResults = (obj.options.search == true || obj.options.filters == true) && obj.results;
    const results = usingResults ? obj.results : obj.rows;

    let test = 0;
    if (results.length > 100) {
        // Get the last element in the page
        let item = parseInt(obj.tbody.lastChild.getAttribute('data-y'));
        if (usingResults) {
            item = results.indexOf(item);
        }
        if (item < obj.rows.length - 1) {
            for (let j = 0; j <= 30; j++) {
                if (item < results.length) {
                    if (usingResults) {
                        obj.tbody.appendChild(obj.rows[results[item]].element);
                    } else {
                        obj.tbody.appendChild(obj.rows[item].element);
                    }
                    if (obj.tbody.children.length > 100) {
                        removeOldestLoadedRow(obj, usingResults);
                        test = 1;
                    }
                }
                item = item + 1;
            }
        }
    }

    return test;
};
