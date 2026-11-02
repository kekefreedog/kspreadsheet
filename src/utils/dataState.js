/**
 * Data Update State
 *
 * Preserve the mounted worksheet view while replacing a data snapshot.
 *
 * @package    kzarshenas/kspreadsheet
 * @author     kekefreedog <kevin.zarshenas@gmail.com>
 * @copyright  2026 Kévin Zarshenas
 */

/** Dependencies */
import { getSelectionSnapshot, remapSelectionSnapshot, restoreSelectionSnapshot } from './history.js';
import { updateFrozenRowOffsets } from './freeze.js';

/**
 * Capture Data State
 *
 * @param {Array} data Incoming rows before normalization
 * @param {Object} options Data replacement options
 * @return {Object} Logical selection, row mapping and viewport anchors
 */
export const captureDataState = function(data, options) {

    // Prepare result
    const result = { selection: getSelectionSnapshot.call(this), rows: {}, mounted: [], anchors: [], search: this.searchInput?.value || '', page: this.pageNumber || 0, left: this.content?.scrollLeft || 0, top: this.content?.scrollTop || 0 };

    // Resolve unique incoming identities when the caller supplies stable row keys
    const indices = new Map();

    // Normalize incoming object rows exactly as setData does before reading identities
    const incoming = data.map(row => Array.isArray(row) ? row : this.options.columns.map(column => row[column.name]));

    // Read each existing identity once in its normalized array representation
    const oldKeys = typeof options.rowKey === 'function' ? (this.options.data || []).map(options.rowKey) : [];

    // Count old identities so duplicate rows cannot inherit another row's state
    const counts = new Map();

    // Count each old key before mapping it into the replacement
    for(const key of oldKeys){

        // Track ambiguity without scanning the full dataset for every row
        counts.set(key, (counts.get(key) || 0) + 1);

    }

    // Map identities before replacing the source rows
    if(typeof options.rowKey === 'function'){

        // Index each incoming row once
        incoming.forEach((row, index) => {

            // Read the application's stable row identity
            const key = options.rowKey(row, index);

            // Exclude missing and duplicate identities from restoration
            indices.set(key, key == null || indices.has(key) ? null : index);

        });

    }

    // Map old row coordinates into the incoming snapshot
    const mapped = (this.options.data || []).map((row, index) => typeof options.rowKey === 'function' ? counts.get(oldKeys[index]) === 1 ? indices.get(oldKeys[index]) : null : index < data.length ? index : null);

    // Expose a bounded coordinate mapper for selections and viewport rows
    result.mapRow = index => mapped[index] ?? null;

    // Remap existing row configuration instead of giving resized heights to new people
    for(const [index, config] of Object.entries(this.options.rows || {})){

        // Resolve the row's new position
        const next = result.mapRow(Number(index));

        // Preserve configuration only for surviving rows
        if(next !== null){

            // Copy row settings without sharing the old configuration object
            result.rows[next] = { ...config };

            // Preserve resized heights as CSS lengths rather than rejected unitless values
            if(this.rows[Number(index)]?.element.style.height){

                // Keep the exact applied height for the surviving row
                result.rows[next].height = this.rows[Number(index)].element.style.height;

            }

        }

    }

    // Capture mounted row positions before the browser clamps the emptied scroll container
    if(this.content && this.tbody){

        // Measure the viewport in rendered coordinates
        const viewport = this.content.getBoundingClientRect();

        // Exclude the sticky header from the visible data band
        const top = Math.max(viewport.top, this.thead.getBoundingClientRect().bottom);

        // Record the currently mounted lazy-loading window and visible surviving rows
        for(const row of this.tbody.children){

            // Read the old source row index
            const index = Number(row.getAttribute('data-y'));

            // Resolve the incoming row position
            const next = result.mapRow(index);

            // Exclude deleted rows from viewport anchors
            if(next !== null){

                // Exclude permanently mounted frozen rows from the scrolling window size
                if(this.results || index >= (this.options.freezeRows || 0)){

                    // Retain the old scrolling window's order
                    result.mounted.push(next);

                }

                // Measure this row before rebuilding
                const bounds = row.getBoundingClientRect();

                // Prefer ordinary visible rows to sticky frozen rows
                if(index >= (this.options.freezeRows || 0) && bounds.bottom > top && bounds.top < viewport.bottom && bounds.height){

                    // Keep fallback anchors if a search later hides the first candidate
                    result.anchors.push({ row: next, offset: bounds.top - viewport.top });

                }

            }

        }

    }

    // Follow selected identities without selecting newly inserted rows between them
    result.selection = remapSelectionSnapshot(result.selection, 1, result.mapRow);

    // Preserve only a valid active fragment when disconnected selection is disabled
    if(!this.options.multipleSelection && result.selection.ranges.length > 1){

        // Locate the fragment containing the active cell
        const active = result.selection.active;

        // Keep the active fragment without broadening the selection
        result.selection.ranges = [result.selection.ranges.find(range => active && active[0] >= range[0] && active[0] <= range[2] && active[1] >= range[1] && active[1] <= range[3]) || result.selection.ranges[0]];

        // Keep the active tuple inside the surviving fragment
        result.selection.active = result.selection.ranges[0].slice();

    }

    // Return result
    return result;

};

/**
 * Restore Data State
 *
 * @param {Object} state Captured state from before data replacement
 * @return {void}
 */
export const restoreDataState = function(state) {

    // Reapply the current text search to fresh rows before restoring the viewport
    if(state.search){

        // Include newly arrived matching rows in the current search
        this.search(state.search);

    }

    // Resolve the current visible row order after search reconciliation
    const visible = this.results || this.rows.map((row, index) => index);

    // Locate the first surviving visible anchor
    const anchor = state.anchors.find(item => visible.includes(item.row));

    // Restore the lazy window rather than returning to the first hundred rows
    if(this.options.lazyLoading){

        // Keep enough rows to cover the previous mounted window
        const count = Math.max(100, state.mounted.length);

        // Locate the previous window start in the new row order
        let start = Math.max(0, visible.indexOf(state.mounted[0]));

        // Keep the viewport anchor within the replacement window after reordering
        if(anchor){

            // Resolve its new visible index
            const index = visible.indexOf(anchor.row);

            // Shift the window only when the old start no longer covers the anchor
            if(index < start || index >= start + count){

                // Leave space above the visible anchor
                start = Math.max(0, index - Math.floor(count / 3));

            }

        }

        // Bound the window at the end of a shortened result
        start = Math.min(start, Math.max(0, visible.length - count));

        // Replace only the mounted rows, retaining the viewport element
        this.tbody.replaceChildren();

        // Keep frozen rows physically present before the scrolling window
        for(let index = 0; index < (this.results ? 0 : this.options.freezeRows || 0); index++){

            // Ignore frozen rows outside a shortened dataset
            if(this.rows[index]){

                // Mount the sticky row once
                this.tbody.append(this.rows[index].element);

            }

        }

        // Mount the current scrolling window in source or search order
        for(const index of visible.slice(start, start + count)){

            // Avoid relocating an already mounted frozen row
            if(this.rows[index].element.parentElement !== this.tbody){

                // Mount the surviving or newly arrived row
                this.tbody.append(this.rows[index].element);

            }

        }

    }else if(this.options.pagination){

        // Preserve the current page, clamped to the available result
        this.page(Math.min(state.page, Math.max(0, Math.ceil(visible.length / this.options.pagination) - 1)));

    }

    // Refresh sticky offsets for remapped row heights
    updateFrozenRowOffsets.call(this);

    // Restore selection without scrolling the visible window to an offscreen active cell
    restoreSelectionSnapshot.call(this, state.selection);

    // Restore scroll only on an existing viewport
    if(this.content){

        // Restore horizontal position without changing column widths or zoom
        this.content.scrollLeft = state.left;

        // Restore the original pixel offset as a baseline
        this.content.scrollTop = state.top;

        // Keep the same surviving row at the same visual position
        if(anchor && this.rows[anchor.row]?.element.parentElement === this.tbody){

            // Measure the retained viewport after rebuilding the rows
            const viewport = this.content.getBoundingClientRect();

            // Account for CSS scaling on ancestors of the scroll container
            const scale = this.content.offsetHeight ? viewport.height / this.content.offsetHeight : 1;

            // Measure the new anchor position relative to the same viewport
            const offset = this.rows[anchor.row].element.getBoundingClientRect().top - viewport.top;

            // Compensate for inserted rows and changed row heights above the anchor
            this.content.scrollTop += (offset - anchor.offset) / (scale || 1);

        }

        // Prevent the synthetic scroll event from advancing the lazy window again
        this.lazyLoadingScrollTop = this.content.scrollTop;

    }

};
