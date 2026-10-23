const { expect } = require('chai');
const jspreadsheet = require('../dist/index.js');

describe('Separate cell and range selections', () => {
    const createWorksheet = (options = {}, callbacks = {}) =>
        jspreadsheet(root, {
            ...callbacks,
            worksheets: [{ minDimensions: [8, 8], multipleSelection: true, ...options }],
        })[0];

    it('keeps separate cells and leaves intervening cells unselected', () => {
        const worksheet = createWorksheet();
        worksheet.setSelections([
            [0, 0, 0, 0],
            [2, 3, 2, 3],
            [5, 1, 5, 1],
        ]);

        expect(worksheet.getSelected(true)).to.deep.equal(['A1', 'F2', 'C4']);
        expect(worksheet.getSelection()).to.deep.equal([5, 1, 5, 1]);
        expect(worksheet.isSelected(1, 1)).to.equal(false);
        expect(worksheet.records[1][1].element.classList.contains('highlight')).to.equal(false);
        expect(worksheet.getSelectedColumns()).to.deep.equal([0, 2, 5]);
        expect(worksheet.getSelectedRows()).to.deep.equal([0, 1, 3]);
    });

    it('deduplicates overlapping ranges without filling the missing corner', () => {
        const worksheet = createWorksheet();
        worksheet.setSelections([
            [0, 0, 1, 1],
            [1, 1, 2, 2],
        ]);

        expect(worksheet.getSelected(true)).to.deep.equal(['A1', 'B1', 'A2', 'B2', 'C2', 'B3', 'C3']);
        expect(worksheet.highlighted).to.have.length(7);
        expect(worksheet.isSelected(2, 0)).to.equal(false);
        expect(worksheet.isSelected(0, 2)).to.equal(false);
    });

    it('subtracts a selected cell without losing surrounding selections', () => {
        const worksheet = createWorksheet();
        worksheet.setSelections([[0, 0, 2, 2]]);
        worksheet.addSelectionFromCoords(1, 1, 1, 1, true);

        expect(worksheet.getSelected(true)).to.deep.equal(['A1', 'B1', 'C1', 'A2', 'C2', 'A3', 'B3', 'C3']);
        expect(worksheet.isSelected(1, 1)).to.equal(false);
        worksheet.addSelectionFromCoords(1, 1);
        expect(worksheet.getHighlighted()).to.deep.equal([[0, 0, 2, 2]]);
    });

    it('preserves the active range direction and accepts an explicit active range', () => {
        const worksheet = createWorksheet();
        worksheet.setSelections(
            [
                [3, 3, 1, 1],
                [6, 6, 6, 6],
            ],
            0
        );

        expect(worksheet.selectedCell).to.deep.equal([3, 3, 1, 1]);
        expect(worksheet.getSelection()).to.deep.equal([1, 1, 3, 3]);
        expect(worksheet.records[3][3].element.classList.contains('highlight-selected')).to.equal(true);
    });

    it('returns snapshots that callers cannot use to mutate the live selection', () => {
        const worksheet = createWorksheet();
        worksheet.setSelections([
            [0, 0, 0, 0],
            [3, 3, 3, 3],
        ]);
        const ranges = worksheet.getHighlighted();
        ranges[0][0] = 7;
        ranges.push([6, 6, 6, 6]);
        expect(worksheet.getSelected(true)).to.deep.equal(['A1', 'D4']);
    });

    it('clamps invalid active range indices without losing selected ranges', () => {
        const worksheet = createWorksheet();
        const ranges = [
            [0, 0, 0, 0],
            [3, 3, 3, 3],
        ];
        worksheet.setSelections(ranges, NaN);
        expect(worksheet.getSelection()).to.deep.equal([3, 3, 3, 3]);
        worksheet.setSelections(ranges, -5);
        expect(worksheet.getSelection()).to.deep.equal([0, 0, 0, 0]);
        worksheet.setSelections(ranges, 999);
        expect(worksheet.getSelection()).to.deep.equal([3, 3, 3, 3]);
        expect(worksheet.getHighlighted()).to.deep.equal(ranges);
    });

    it('rejects separate ranges when the option is disabled', () => {
        const worksheet = createWorksheet({ multipleSelection: false });
        worksheet.updateSelectionFromCoords(1, 1);
        expect(
            worksheet.setSelections([
                [0, 0, 0, 0],
                [3, 3, 3, 3],
            ])
        ).to.equal(false);
        expect(worksheet.getSelected(true)).to.deep.equal(['B2']);
    });

    it('cancels the complete selection update before changing classes or state', () => {
        let cancel = false;
        let proposed;
        const worksheet = createWorksheet(
            {},
            {
                onbeforeselection(instance, x1, y1, x2, y2, origin, ranges) {
                    proposed = ranges;
                    if (cancel) return false;
                },
            }
        );
        worksheet.updateSelectionFromCoords(0, 0);
        cancel = true;
        expect(
            worksheet.setSelections([
                [0, 0, 0, 0],
                [3, 3, 3, 3],
            ])
        ).to.equal(false);
        expect(proposed).to.deep.equal([
            [0, 0, 0, 0],
            [3, 3, 3, 3],
        ]);
        expect(worksheet.getSelected(true)).to.deep.equal(['A1']);
        expect(worksheet.records[3][3].element.classList.contains('highlight')).to.equal(false);
    });

    it('keeps active coordinates consistent when a keyboard extension is cancelled', () => {
        let cancel = false;
        const worksheet = createWorksheet(
            {},
            {
                onbeforeselection() {
                    if (cancel) return false;
                },
            }
        );
        worksheet.setSelections([
            [0, 0, 0, 0],
            [3, 3, 3, 3],
        ]);
        cancel = true;
        worksheet.right(true);
        expect(worksheet.selectedCell).to.deep.equal([3, 3, 3, 3]);
        expect(worksheet.getHighlighted()).to.deep.equal([
            [0, 0, 0, 0],
            [3, 3, 3, 3],
        ]);
    });

    it('expands merged cells as an indivisible selection and toggles the whole merge', () => {
        const worksheet = createWorksheet({ mergeCells: { B2: [2, 2] } });
        worksheet.setSelections([
            [2, 2, 2, 2],
            [5, 5, 5, 5],
        ]);

        expect(worksheet.getHighlighted()).to.deep.equal([
            [1, 1, 2, 2],
            [5, 5, 5, 5],
        ]);
        expect(worksheet.isSelected(1, 1)).to.equal(true);
        expect(worksheet.isSelected(2, 2)).to.equal(true);
        worksheet.addSelectionFromCoords(2, 2, 2, 2, true);
        expect(worksheet.getHighlighted()).to.deep.equal([[5, 5, 5, 5]]);
    });

    it('keeps readonly cells selectable without altering their values', () => {
        const worksheet = createWorksheet({ data: [[10, 20, 30]] });
        worksheet.setReadOnly('A1', true);
        worksheet.setSelections([
            [0, 0, 0, 0],
            [2, 0, 2, 0],
        ]);
        expect(worksheet.getSelected(true)).to.deep.equal(['A1', 'C1']);
        expect(worksheet.getValue('A1')).to.equal(10);
    });

    it('omits explicitly hidden cells but retains detached page cells in selected data', () => {
        const worksheet = createWorksheet();
        worksheet.hideColumn(1);
        worksheet.hideRow(1);
        worksheet.setSelections([
            [0, 0, 2, 2],
            [5, 5, 5, 5],
        ]);
        worksheet.rows[5].element.remove();

        expect(worksheet.getSelected(true)).to.deep.equal(['A1', 'C1', 'A3', 'C3', 'F6']);
        expect(worksheet.getSelectedColumns(true)).to.deep.equal([0, 2, 5]);
        expect(worksheet.getSelectedRows(true)).to.deep.equal([0, 2, 5]);
    });

    it('handles an empty worksheet selection without leaving active-cell classes behind', () => {
        const worksheet = createWorksheet();
        worksheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        worksheet.setSelections([]);
        expect(worksheet.selectedCell).to.equal(null);
        expect(worksheet.getSelected()).to.deep.equal([]);
        expect(worksheet.records[2][2].element.classList.contains('highlight-selected')).to.equal(false);
    });

    it('keeps frozen selection edges visible when the outer row and column are hidden', () => {
        const worksheet = createWorksheet({ freezeColumns: 2, freezeRows: 2 });
        worksheet.hideColumn(0);
        worksheet.hideRow(0);
        worksheet.setSelections([
            [0, 0, 1, 1],
            [4, 4, 4, 4],
        ]);
        const cell = worksheet.records[1][1].element;

        expect(cell.classList.contains('highlight-left')).to.equal(true);
        expect(cell.classList.contains('highlight-top')).to.equal(true);
        expect(cell.classList.contains('highlight-right')).to.equal(true);
        expect(cell.classList.contains('highlight-bottom')).to.equal(true);
    });

    it('clears copied borders on detached pages when Escape cancels copying', () => {
        const worksheet = createWorksheet({ pagination: 4 });
        const originalExecCommand = document.execCommand;
        document.execCommand = () => true;
        try {
            const first = worksheet.records[0][0].element;
            first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1 }));
            first.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, buttons: 0 }));
            worksheet.setSelections([
                [0, 0, 0, 0],
                [2, 0, 2, 0],
            ]);
            worksheet.copy();
            expect(first.classList.contains('copying')).to.equal(true);
            worksheet.page(1);
            expect(worksheet.tbody.contains(first)).to.equal(false);
            worksheet.updateSelectionFromCoords(0, 5);
            document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 27, which: 27 }));
            expect(first.classList.contains('copying')).to.equal(false);
            expect(worksheet.records[0][2].element.classList.contains('copying')).to.equal(false);
        } finally {
            document.execCommand = originalExecCommand;
        }
    });

    it('hides the fill handle for separate ranges and restores it for one range', () => {
        const worksheet = createWorksheet();
        worksheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        expect(worksheet.corner.style.display).to.equal('none');
        worksheet.updateSelectionFromCoords(0, 0);
        expect(worksheet.corner.style.display).to.equal('');
    });

    it('resets all ranges and safely checks membership with no selection', () => {
        const worksheet = createWorksheet();
        worksheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        expect(worksheet.resetSelection()).to.equal(1);
        expect(worksheet.getHighlighted()).to.deep.equal([]);
        expect(worksheet.getSelected(true)).to.deep.equal([]);
        expect(worksheet.isSelected(0, 0)).to.equal(false);
        expect(worksheet.records[2][2].element.classList.contains('highlight')).to.equal(false);
    });
});
