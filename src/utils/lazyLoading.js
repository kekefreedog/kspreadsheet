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
 * Sizes of the loaded window
 *
 * `obj.content` scrolls through the loaded rows and nothing else — there is no spacer standing in
 * for the rows that are not loaded yet — so every size here has to be read against the height of
 * the viewport, not against a fixed number of rows :
 *
 *  - `minimumLoadedRows` rows only cover 1.8 viewports of a dense grid on a tall screen. That used
 *    to put the "near the top" and the "near the bottom" bands of `wheelControls` over the same
 *    pixels, so a single scroll tick answered with a loadDown *and* a loadUp that undid each other,
 *    the grid scrolled without ever advancing and a compensated `scrollTop` eventually landed on 0,
 *    which snapped the whole window back to the first row. `loadedRowsLimit` keeps the window at
 *    `viewportsLoaded` viewports so the middle of it stays neutral.
 *  - `loadedEdgeMargin` stays well under the height of one batch, otherwise the scroll correction
 *    of a batch leaves the viewport inside the band it just fired from, the browser reports the
 *    scroll the correction caused and the window keeps walking on its own with nobody touching the
 *    wheel. `batchRows` is three times `prefetchRows` for that reason.
 *
 * `minimumLoadedRows` is the historical window, kept as a floor so short viewports load exactly
 * what they used to.
 */
const minimumLoadedRows = 100;
const maximumLoadedRows = 500;
const viewportsLoaded = 3;
const batchRows = 30;
const prefetchRows = 10;

/**
 * Height of a loaded row, 0 when there is nothing to measure yet
 *
 * Averaged over the whole window rather than read on the first row : rows are not all one line
 * high (a planning cell holding two bookings is twice as tall), and a single tall row at the front
 * would halve every size computed here.
 */
const loadedRowHeight = function (obj) {
    const loaded = obj.tbody.children.length;

    return loaded && obj.tbody.offsetHeight ? obj.tbody.offsetHeight / loaded : 0;
};

/**
 * Rows the lazy loading keeps in the DOM at once
 */
export const loadedRowsLimit = function (obj) {
    const rowHeight = loadedRowHeight(obj);

    // Nothing measurable yet (first render, hidden worksheet, no layout at all) : historical window
    if (!rowHeight || !obj.content || !obj.content.clientHeight) {
        return minimumLoadedRows;
    }

    const rows = Math.ceil(obj.content.clientHeight / rowHeight) * viewportsLoaded;

    return Math.min(maximumLoadedRows, Math.max(minimumLoadedRows, rows));
};

/**
 * Distance to an edge of the loaded window at which more rows are loaded
 */
export const loadedEdgeMargin = function (obj) {
    const range = obj.content ? obj.content.scrollHeight - obj.content.clientHeight : 0;
    const rowHeight = loadedRowHeight(obj);
    const margin = rowHeight ? rowHeight * prefetchRows : 10;

    // A third of the scrollable range at most, so the two bands always leave a neutral middle
    return Math.max(10, Math.min(margin, range / 3));
};

/**
 * Keep what is on screen on screen while the loaded window slides
 *
 * Rows evicted above the viewport (loadDown) or inserted above it (loadUp) shift everything the
 * user is looking at by their own height. `wheelControls` used to answer that with a blind
 * `scrollTop -= clientHeight`, which only matches when a batch happens to be exactly one viewport
 * tall : anywhere else it teleported the viewport, and on a tall screen it teleported it straight
 * into the opposite band. Measuring a row that survives the mutation is exact whatever the size of
 * the batch and whatever the heights of the rows (the planning mixes one and two line rows).
 */
const keepScrollAnchored = function (obj, anchor, mutate) {
    // Nothing to measure against
    if (!anchor || !obj.content) {
        mutate();

        return;
    }

    // Position of the anchor before the window slides
    const before = anchor.offsetTop;

    mutate();

    // The mutation may have evicted the anchor itself
    if (anchor.parentNode !== obj.tbody) {
        return;
    }

    const correction = anchor.offsetTop - before;

    if (correction) {
        obj.content.scrollTop += correction;

        /**
         * The browser reports that correction as a scroll like any other, so remember where it left
         * the viewport : `wheelControls` has to tell it apart from a scroll of the user. Answering
         * our own correction with another batch corrects the scroll again, which is reported again,
         * and the window walks through the whole sheet with nobody touching the wheel. Only a real
         * correction is remembered — at the very bottom of the window a wheel event legitimately
         * leaves `scrollTop` untouched, and that is exactly what asks for the next batch.
         */
        obj.lazyLoadingScrollTop = obj.content.scrollTop;
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
    if (results.length > minimumLoadedRows) {
        const freezeRows = obj.options.freezeRows || 0;
        const limit = loadedRowsLimit(obj);

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
            // The rows land above the anchor, so the viewport has to follow them down
            keepScrollAnchored(obj, anchor, function () {
                for (let j = 0; j < batchRows; j++) {
                    item = item - 1;
                    // Never re-touch/relocate rows that are already permanently present as frozen rows
                    if (item > -1 && (usingResults || item >= freezeRows)) {
                        const insertBeforeEl = (!usingResults && freezeRows && firstNonFrozenChild(obj)) || obj.tbody.firstChild;
                        if (usingResults) {
                            obj.tbody.insertBefore(obj.rows[results[item]].element, insertBeforeEl);
                        } else {
                            obj.tbody.insertBefore(obj.rows[item].element, insertBeforeEl);
                        }
                        // Something moved : the caller has to re-sync the selection overlays whether
                        // or not the window was already full enough to evict from the other end
                        test = 1;
                        if (obj.tbody.children.length > limit) {
                            obj.tbody.removeChild(obj.tbody.lastChild);
                        }
                    }
                }
            });
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
    if (results.length > minimumLoadedRows) {
        const limit = loadedRowsLimit(obj);

        // Get the last element in the page
        const anchor = obj.tbody.lastChild;
        if (!anchor) {
            return test;
        }

        let item = parseInt(anchor.getAttribute('data-y'));
        if (usingResults) {
            item = results.indexOf(item);
        }
        if (item < obj.rows.length - 1) {
            /**
             * The anchor is the row the first append relocates onto itself, so it always survives
             * the batch : the rows are appended after it and the eviction takes them from the other
             * end of a window far longer than one batch.
             */
            keepScrollAnchored(obj, anchor, function () {
                for (let j = 0; j <= batchRows; j++) {
                    if (item < results.length) {
                        if (usingResults) {
                            obj.tbody.appendChild(obj.rows[results[item]].element);
                        } else {
                            obj.tbody.appendChild(obj.rows[item].element);
                        }
                        // Something moved : the caller has to re-sync the selection overlays whether
                        // or not the window was already full enough to evict from the other end
                        test = 1;
                        if (obj.tbody.children.length > limit) {
                            removeOldestLoadedRow(obj, usingResults);
                        }
                    }
                    item = item + 1;
                }
            });
        }
    }

    return test;
};
