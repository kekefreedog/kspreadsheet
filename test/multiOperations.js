const { expect } = require('chai');
const jspreadsheet = require('../dist/index.js');

const create = (options = {}, events = {}) =>
    jspreadsheet(root, {
        ...events,
        worksheets: [
            {
                multipleSelection: true,
                data: Array.from({ length: 6 }, (_, y) => Array.from({ length: 6 }, (_, x) => `${y}:${x}`)),
                ...options,
            },
        ],
    })[0];

describe('Multiple selection worksheet operations', () => {
    it('deletes separate rows without deleting the gap, and restores data and selection in one undo', () => {
        let beforeRows;
        let calls = 0;
        const sheet = create(
            {},
            {
                onbeforedeleterow: (worksheet, rows) => {
                    beforeRows = rows;
                    calls++;
                },
            }
        );
        sheet.setSelections([
            [0, 1, 5, 1],
            [0, 3, 5, 3],
        ]);
        const history = sheet.historyIndex;
        sheet.deleteRow();
        expect(beforeRows).to.deep.equal([1, 3]);
        expect(calls).to.equal(1);
        expect(sheet.options.data.map((row) => row[0])).to.deep.equal(['0:0', '2:0', '4:0', '5:0']);
        expect(sheet.historyIndex).to.equal(history + 1);
        sheet.undo();
        expect(sheet.options.data.map((row) => row[0])).to.deep.equal(['0:0', '1:0', '2:0', '3:0', '4:0', '5:0']);
        expect(sheet.getSelectedRows()).to.deep.equal([1, 3]);
        sheet.redo();
        expect(sheet.options.data.map((row) => row[0])).to.deep.equal(['0:0', '2:0', '4:0', '5:0']);
    });

    it('deletes separate columns and restores nested header groups on undo and redo', () => {
        const sheet = create({
            nestedHeaders: [
                [
                    { title: 'A', colspan: 2 },
                    { title: 'B', colspan: 2 },
                    { title: 'C', colspan: 2 },
                ],
            ],
        });
        sheet.setSelections([
            [1, 0, 1, 5],
            [4, 0, 4, 5],
        ]);
        sheet.deleteColumn();
        expect(sheet.options.data[0]).to.deep.equal(['0:0', '0:2', '0:3', '0:5']);
        expect(sheet.options.nestedHeaders[0].map((group) => group.colspan)).to.deep.equal([1, 2, 1]);
        expect(Array.from(sheet.thead.querySelectorAll('.jss_nested [data-column]')).map((cell) => cell.getAttribute('data-column'))).to.deep.equal([
            '0',
            '1,2',
            '3',
        ]);
        sheet.undo();
        expect(sheet.options.data[0]).to.deep.equal(['0:0', '0:1', '0:2', '0:3', '0:4', '0:5']);
        expect(sheet.getSelectedColumns()).to.deep.equal([1, 4]);
        expect(sheet.options.nestedHeaders[0].map((group) => group.colspan)).to.deep.equal([2, 2, 2]);
        sheet.redo();
        expect(sheet.options.nestedHeaders[0].map((group) => group.colspan)).to.deep.equal([1, 2, 1]);
    });

    for (const axis of ['row', 'column']) {
        it(`cancels the whole separate ${axis} deletion before changing data`, () => {
            const event = axis === 'row' ? 'onbeforedeleterow' : 'onbeforedeletecolumn';
            const sheet = create({}, { [event]: () => false });
            sheet.setSelections([
                [1, 1, 1, 1],
                [3, 3, 3, 3],
            ]);
            const data = JSON.stringify(sheet.options.data);
            const history = sheet.historyIndex;
            expect(sheet[axis === 'row' ? 'deleteRow' : 'deleteColumn']()).to.equal(false);
            expect(JSON.stringify(sheet.options.data)).to.equal(data);
            expect(sheet.historyIndex).to.equal(history);
            expect(sheet.getSelected(true)).to.deep.equal(['B2', 'D4']);
        });
    }

    it('preserves the last row and column when deleting the entire selection', () => {
        const sheet = create();
        sheet.selectAll();
        sheet.deleteRow();
        expect(sheet.rows).to.have.length(1);
        sheet.selectAll();
        sheet.deleteColumn();
        expect(sheet.headers).to.have.length(1);
        sheet.undo();
        expect(sheet.headers).to.have.length(6);
        sheet.undo();
        expect(sheet.rows).to.have.length(6);
    });

    it('keeps selections attached to the same cells through insert, delete and move', () => {
        const sheet = create();
        sheet.setSelections([
            [1, 1, 1, 1],
            [3, 3, 3, 3],
        ]);
        sheet.insertRow(1, 0, true);
        expect(sheet.getSelected(true)).to.deep.equal(['B3', 'D5']);
        sheet.insertColumn(1, 0, true);
        expect(sheet.getSelected(true)).to.deep.equal(['C3', 'E5']);
        sheet.deleteRow(0);
        expect(sheet.getSelected(true)).to.deep.equal(['C2', 'E4']);
        sheet.moveColumn(2, 5);
        expect(sheet.getSelected(true)).to.have.members(['F2', 'D4']);
        sheet.moveRow(1, 4);
        expect(sheet.getSelected(true)).to.have.members(['F5', 'D3']);
        sheet.undo();
        expect(sheet.getSelected(true)).to.have.members(['F2', 'D4']);
    });

    it('does not include an inserted row in an existing selected block', () => {
        const sheet = create();
        sheet.setSelections([[1, 1, 1, 3]]);
        sheet.insertRow(1, 2, true);
        expect(sheet.getSelected(true)).to.deep.equal(['B2', 'B4', 'B5']);
    });

    it('restores every selected range after editing and undoing', () => {
        const sheet = create();
        sheet.setSelections([
            [0, 0, 0, 0],
            [4, 4, 4, 4],
        ]);
        sheet.setValue([
            { x: 0, y: 0, value: 'first' },
            { x: 4, y: 4, value: 'last' },
        ]);
        sheet.updateSelectionFromCoords(2, 2);
        sheet.undo();
        expect(sheet.getSelected(true)).to.deep.equal(['A1', 'E5']);
        expect(sheet.getValue('A1')).to.equal('0:0');
        expect(sheet.getValue('E5')).to.equal('4:4');
        sheet.redo();
        expect(sheet.getSelected(true)).to.deep.equal(['A1', 'E5']);
        expect(sheet.getValue('E5')).to.equal('last');
    });

    it('applies selected row resizing only to those rows and undoes it together', () => {
        const sheet = create({ defaultRowHeight: 20 });
        sheet.setSelections([
            [0, 1, 5, 1],
            [0, 4, 5, 4],
        ]);
        sheet.setHeight(sheet.getSelectedRows(), 55);
        expect(sheet.rows[1].element.style.height).to.equal('55px');
        expect(sheet.rows[4].element.style.height).to.equal('55px');
        expect(sheet.rows[2].element.style.height).to.equal('20px');
        sheet.undo();
        expect(sheet.rows[1].element.style.height).to.equal('20px');
        expect(sheet.getSelectedRows()).to.deep.equal([1, 4]);
    });

    it('rejects selection-based merging of disconnected cells', () => {
        const sheet = create();
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        expect(sheet.setMerge()).to.equal(false);
        expect(sheet.getMerge()).to.deep.equal({});
        expect(sheet.getValue('B2')).to.equal('1:1');
    });

    it('retains logical selections across pages while resetting them on sorting', () => {
        const sheet = create({ pagination: 2 });
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 5, 2, 5],
        ]);
        sheet.page(2);
        expect(sheet.getSelected(true)).to.deep.equal(['A1', 'C6']);
        sheet.orderBy(0, 1);
        expect(sheet.getHighlighted()).to.deep.equal([]);
        sheet.undo();
        expect(sheet.getSelected(true)).to.deep.equal(['A1', 'C6']);
    });
});
