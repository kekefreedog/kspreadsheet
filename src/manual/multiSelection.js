/** Human checks for disconnected selections, using the existing QA runner. */
export const createMultiSelectionScenarios = function (jspreadsheet, root, extra) {
    const data = (rows = 12, columns = 8) =>
        Array.from({ length: rows }, (_, y) => Array.from({ length: columns }, (_, x) => String.fromCharCode(65 + x) + (y + 1)));

    const button = (label, action) => {
        const element = document.createElement('button');
        element.textContent = label;
        element.style.cssText = 'margin:4px;padding:6px 10px;';
        // Keep the current selection when a test control operates on it.
        element.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
        element.addEventListener('click', action);
        extra.appendChild(element);
    };

    const mount = (options = {}) => {
        const status = document.createElement('output');
        status.style.cssText = 'display:block;margin:8px;font:14px monospace;';
        extra.appendChild(status);
        const instances = jspreadsheet(root, {
            toolbar: true,
            onselection: (sheet) => {
                status.textContent = 'Selected: ' + sheet.getSelected(true).join(', ');
            },
            worksheets: [
                {
                    multipleSelection: true,
                    data: data(),
                    columns: Array.from({ length: 8 }, () => ({ width: 105 })),
                    ...options,
                },
            ],
        });
        const sheet = instances[0];
        button('Undo', () => sheet.undo());
        button('Redo', () => sheet.redo());
        return sheet;
    };

    const clipboard = (preserveGaps) => {
        const values = data();
        values[0][0] = 'ALPHA';
        values[2][2] = '=1+2';
        for (let y = 5; y < 8; y++) for (let x = 5; x < 8; x++) values[y][x] = 'KEEP';
        const sheet = mount({ data: values, ...(preserveGaps ? {} : { copyPreserveGaps: false }) });
        sheet.setStyle('C3', 'color', 'red');
        button('Select source', () =>
            sheet.setSelections(
                preserveGaps
                    ? [
                          [0, 0, 0, 0],
                          [2, 2, 2, 2],
                      ]
                    : [
                          [0, 0, 0, 0],
                          [2, 0, 2, 0],
                          [2, 2, 2, 2],
                      ]
            )
        );
        const preview = document.createElement('textarea');
        preview.setAttribute('aria-label', 'External clipboard preview');
        preview.placeholder = 'Paste here to inspect plain clipboard text';
        preview.style.cssText = 'display:block;width:360px;height:70px;margin:8px;';
        extra.appendChild(preview);
        return sheet;
    };

    return [
        {
            name: 'Multiple selection: click, drag, keyboard and formatting',
            check: 'Click A1, then Ctrl-click (Windows/Linux) or Cmd-click (Mac) C3. Only A1 and C3 should be selected. Modifier-click A1 again to remove it. Modifier-drag E5:F6 to add a rectangle, then Shift-arrow to extend only that active range. Right-click inside a selection should keep the others. Try bold/color and Delete: gaps must stay unchanged. Ctrl/Cmd+Z restores deleted values together; Ctrl/Cmd+Shift+Z reapplies the deletion. Ctrl/Cmd+Y also redoes. Escape keeps one active cell. Plain click or an arrow returns to one selection. The fill handle must disappear for disconnected ranges.',
            render: () => mount(),
        },
        {
            name: 'Multiple selection: copy keeps gaps by default',
            check: 'Click Select source, then Ctrl/Cmd+C. Click F6 and paste: F6 becomes ALPHA, H8 becomes a red 3 (formula =1+2), and every KEEP cell between them remains unchanged. Undo restores both destinations together. Repeat the copy and paste into the preview box: it should have 3 rows and 3 columns with blank gaps. Cut the source with Ctrl/Cmd+X: only A1 and C3 clear; Undo restores both.',
            render: () => clipboard(true),
        },
        {
            name: 'Multiple selection: compact copy option',
            check: 'copyPreserveGaps is false here. Click Select source, copy, click F6 and paste. F6=ALPHA, G6=C1, F7=3 (red formula). G7 remains KEEP: the padded empty field is a gap, not a selected empty cell. The preview box should show two rows: ALPHA and C1 on the first, 3 on the second. Undo should restore all changed destinations in one step.',
            render: () => clipboard(false),
        },
        {
            name: 'Multiple selection: scalar and block paste',
            check: 'Select compatible blocks, then Paste 2x2: A1:B2 and E5:F6 both receive the same four values; gaps remain unchanged. Undo once restores both. Select incompatible blocks, then Paste 2x2: no cell may change, and the result should say Rejected. Paste scalar should fill all selected cells even when the ranges have different shapes. Also select B2 back to A1 by dragging backwards: scalar paste should fill the whole rectangle.',
            render() {
                const sheet = mount();
                const result = document.createElement('output');
                button('Select compatible blocks', () =>
                    sheet.setSelections([
                        [0, 0, 1, 1],
                        [4, 4, 5, 5],
                    ])
                );
                button('Select incompatible blocks', () =>
                    sheet.setSelections([
                        [0, 0, 1, 1],
                        [4, 4, 4, 4],
                    ])
                );
                const paste = (text) => {
                    if (!sheet.selectedCell) return;
                    result.textContent = sheet.paste(sheet.selectedCell[0], sheet.selectedCell[1], text) === false ? 'Rejected — cells unchanged' : 'Pasted';
                };
                button('Paste 2x2', () => paste('one\ttwo\nthree\tfour'));
                button('Paste scalar', () => paste('FILLED'));
                extra.appendChild(result);
                return sheet;
            },
        },
        {
            name: 'Multiple selection: nested headers, frozen cells, merges and zoom',
            check: 'B2:C3 is merged and crosses both frozen boundaries. Select A2:F7: there must be no extra selection line between rows 2/3 or columns B/C, including through the merge. Zoom to 80%, 100%, and 150%: the fill handle must follow the bottom-right corner immediately (or hide if covered by the footer). Select B2, then modifier-click F6: the merged cell must select as a whole. Copy and scroll both ways: outlines stay aligned and stop at the pinned footer, without internal dashed lines. Click First, then modifier-click Last: only those column groups select. Repeat with separate row headers. Merging disconnected ranges must leave them unchanged.',
            render() {
                const sheet = mount({
                    data: data(40),
                    freezeRows: 2,
                    freezeColumns: 2,
                    mergeCells: { B2: [2, 2] },
                    nestedHeaders: [
                        [
                            { title: 'First', colspan: 2 },
                            { title: 'Middle', colspan: 4 },
                            { title: 'Last', colspan: 2 },
                        ],
                    ],
                    tableOverflow: true,
                    tableWidth: '760px',
                    tableHeight: '330px',
                    footers: [['Pinned footer']],
                    stickyFooter: true,
                });
                for (const zoom of [80, 100, 150]) button('Zoom ' + zoom + '%', () => sheet.setZoom(zoom));
                return sheet;
            },
        },
        {
            name: 'Multiple selection: delete rows/columns and undo',
            check: 'Select rows 2 and 4, then Delete selected rows: only those two rows disappear; original rows 1, 3, and 5 remain. Undo once restores both rows and their selection; Redo removes both. Restart this test, then repeat with columns B and D. Drag the edge of a selected row/column header to resize: only the selected headers should resize. Undo restores their sizes. Nested headers should stay aligned after column deletion and undo.',
            render() {
                const sheet = mount({
                    nestedHeaders: [
                        [
                            { title: 'First half', colspan: 4 },
                            { title: 'Second half', colspan: 4 },
                        ],
                    ],
                });
                button('Select rows 2 and 4', () =>
                    sheet.setSelections([
                        [0, 1, 7, 1],
                        [0, 3, 7, 3],
                    ])
                );
                button('Delete selected rows', () => sheet.deleteRow());
                button('Select columns B and D', () =>
                    sheet.setSelections([
                        [1, 0, 1, sheet.rows.length - 1],
                        [3, 0, 3, sheet.rows.length - 1],
                    ])
                );
                button('Delete selected columns', () => sheet.deleteColumn());
                return sheet;
            },
        },
        {
            name: 'Multiple selection: pagination',
            check: 'Select A1 and C12 with the button. Only A1 is visible on page 1. Go to page 2: C12 must have its outline. Return to page 1: A1 stays selected. Copy and paste into another spreadsheet or text editor: both values must be present, with their row and column gaps. Delete should clear both selected cells across pages; Undo restores both.',
            render() {
                const sheet = mount({ data: data(30), pagination: 10, paginationOptions: [10] });
                button('Select A1 and C12', () =>
                    sheet.setSelections([
                        [0, 0, 0, 0],
                        [2, 11, 2, 11],
                    ])
                );
                return sheet;
            },
        },
        {
            name: 'Multiple selection: lazy loading',
            check: 'Select A1 and C251 with the button. Scroll down to row 251: C251 should be selected. Scroll back to the top: A1 should still be selected. No outline should float over unrelated rows. Delete and Undo should affect both cells, including the one outside the visible window. Try modifier-clicking additional cells after scrolling.',
            render() {
                const sheet = mount({ data: data(300), lazyLoading: true, tableOverflow: true, tableHeight: '330px', tableWidth: '900px' });
                button('Select A1 and C251', () =>
                    sheet.setSelections([
                        [0, 0, 0, 0],
                        [2, 250, 2, 250],
                    ])
                );
                return sheet;
            },
        },
        {
            name: 'Multiple selection: readonly cells and checkboxes',
            check: 'A3 is readonly. Select A1, A3, and A5 with modifier-clicks on the cells, then press Space: A1 and A5 toggle, A3 stays checked. Undo restores the two changes together. Modifier-click directly on a checkbox: selection changes but its value must not toggle. Select B1 and B3 and press Space: only the active radio may be checked; Undo restores the previous radio. Delete and paste must also preserve readonly A3.',
            render() {
                const sheet = mount({
                    data: Array.from({ length: 8 }, (_, y) => [y === 2, y === 0, 'Row ' + (y + 1)]),
                    columns: [{ type: 'checkbox', width: 150 }, { type: 'radio', width: 150 }, { width: 180 }],
                });
                sheet.setReadOnly('A3', true);
                return sheet;
            },
        },
        {
            name: 'Selection offset: centered table with a tall row',
            check: 'Click cells along this centered table, especially the last cell and the bottom edge. Selection borders must line up with the cell borders. Selecting must not add a scrollbar, move the table sideways, or shift the border. Modifier-click separate cells and confirm each outline remains aligned. This reproduces the client submission layout.',
            render() {
                const style = document.createElement('style');
                style.textContent =
                    '#root .jss_container{width:100%} #root .jss_content{display:block;width:100%!important;overflow:auto;max-height:450px} #root .jss_worksheet{margin:auto}';
                extra.appendChild(style);
                return mount({
                    data: [['Package', 'Asset', 'Version', 'For', 'Line\n'.repeat(14)]],
                    columns: [150, 150, 200, 150, 150].map((width) => ({ width, wordWrap: true })),
                    tableOverflow: true,
                    tableWidth: '100%',
                });
            },
        },
        {
            name: 'Multiple selection: add/remove ranges with Cmd/Ctrl and Shift',
            check: 'Select A1:D4. Hold Cmd (Mac) or Ctrl (Windows/Linux) and drag B2:C3: those four cells become unselected, leaving a hole. Shrink the drag to B2:C2: B3/C3 become selected again. Release, then Cmd/Ctrl+Shift-click D4: removal expands from B2 to D4. Cmd/Ctrl+Shift-click C2: removal shrinks back to B2:C2 and restores the other cells. Starting a modified drag on an unselected cell adds a rectangle; starting on a selected cell removes one. Cmd/Ctrl-click F6, then Cmd/Ctrl+Shift-click H8: F6:H8 is added while the earlier selection and hole remain. Delete affects only selected cells; Undo restores their values and selection together. Repeat with row or column headers.',
            render: () => mount(),
        },
    ].map((scenario) => ({ ...scenario, suite: 'multi-selection' }));
};
