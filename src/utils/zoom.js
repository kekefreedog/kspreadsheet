/**
 * Get Zoom
 *
 * @param object cell
 * @return void
 */
export const getZoom = function () {
    return this.zoom;
};

/**
 * Reset Zoom
 *
 * @return void
 */
export const resetZoom = function () {
    this.zoom = this.options.defaultZoom ? Number(this.options.defaultZoom) : this.parent.config.defaultZoom ? Number(this.parent.config.defaultZoom) : 100;

    this.setZoom(this.zoom);
};

/**
 * Set Zoom
 *
 * @param zoomValue
 * @return void
 */
export const setZoom = function (zoomValue) {
    if (zoomValue >= this.zoomMin && zoomValue <= this.zoomMax) {
        const updateOverlays = () => {
            if (this.highlightBorder) {
                import('./selection.js').then(({ updateHighlightBorder, updateHighlightCopy }) => {
                    updateHighlightBorder.call(this);
                    updateHighlightCopy.call(this);
                });
            }
        };

        if ('parentElement' in this.table && this.table.parentElement && this.options.tableOverflow === true) {
            // Get the current scroll and size properties
            const oldScrollWidth = this.table.parentElement.scrollWidth;
            const oldScrollHeight = this.table.parentElement.scrollHeight;
            const oldScrollLeft = this.table.parentElement.scrollLeft;
            const oldScrollTop = this.table.parentElement.scrollTop;

            this.zoom = zoomValue;

            // Apply zoom by updating CSS
            this.table.style.zoom = this.zoom / 100;

            // Allow some time for rendering the new dimensions after zoom
            setTimeout(() => {
                // Get the new scroll and size properties after zoom
                const newScrollWidth = this.table.parentElement.scrollWidth;
                const newScrollHeight = this.table.parentElement.scrollHeight;

                // Only rescale the scroll position if there was something to scroll in the first place.
                // Otherwise (e.g. zoom applied before data is loaded) the ratio is meaningless and would
                // stomp over whatever scroll position was set in the meantime.
                if (oldScrollWidth > 0 && oldScrollHeight > 0) {
                    // Calculate the width and height ratios
                    const widthRatio = newScrollWidth / oldScrollWidth;
                    const heightRatio = newScrollHeight / oldScrollHeight;

                    // Calculate the new scroll positions
                    const newScrollLeft = Math.round(oldScrollLeft * widthRatio);
                    const newScrollTop = Math.round(oldScrollTop * heightRatio);

                    // Apply the new scroll positions
                    this.table.parentElement.scrollLeft = newScrollLeft;
                    this.table.parentElement.scrollTop = newScrollTop;
                }

                updateOverlays();
            }, 0); // 0ms delay ensures it waits for rendering updates
        } else {
            this.zoom = zoomValue;

            // Apply zoom by updating CSS
            this.table.style.zoom = this.zoom / 100;

            setTimeout(() => {
                updateOverlays();
            }, 0);
        }
    }

    return this.zoom;
};

/**
 * Zoom In
 *
 * @return void
 */
export const zoomIn = function () {
    var zoomValue = this.getZoom() + this.zoomStep;

    return this.setZoom(zoomValue);
};

/**
 * Zoom Out
 *
 * @return void
 */
export const zoomOut = function () {
    var zoomValue = this.getZoom() - this.zoomStep;

    return this.setZoom(zoomValue);
};
