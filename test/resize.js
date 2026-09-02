const { expect } = require('chai');

const jspreadsheet = require('../dist/index.js');

describe('Resizing multiple selected rows/columns together', () => {
    it('setHeight applied to an array of rows resizes every one of them to the same height', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [3, 4],
                    data: [
                        [1, 2, 3],
                        [4, 5, 6],
                        [7, 8, 9],
                        [10, 11, 12],
                    ],
                },
            ],
        });

        const worksheet = instance[0];

        worksheet.setHeight([0, 1, 3], 55);

        expect(worksheet.rows[0].element.style.height).to.equal('55px');
        expect(worksheet.rows[1].element.style.height).to.equal('55px');
        expect(worksheet.rows[3].element.style.height).to.equal('55px');
        // Row 2 was not part of the selection passed in - it must be left untouched
        expect(worksheet.rows[2].element.style.height).to.not.equal('55px');

        expect(worksheet.options.rows[0].height).to.equal(55);
        expect(worksheet.options.rows[1].height).to.equal(55);
        expect(worksheet.options.rows[3].height).to.equal(55);
    });

    it('setHeight keeps working with a single row index (non-array), same as before', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [2, 2],
                    data: [
                        [1, 2],
                        [3, 4],
                    ],
                },
            ],
        });

        const worksheet = instance[0];

        expect(() => worksheet.setHeight(0, 40)).to.not.throw();
        expect(worksheet.rows[0].element.style.height).to.equal('40px');
        expect(worksheet.options.rows[0].height).to.equal(40);
    });

    it('setHeight on an array of rows does not throw and keeps history/undo working', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [2, 2],
                    data: [
                        [1, 2],
                        [3, 4],
                    ],
                },
            ],
        });

        const worksheet = instance[0];

        expect(() => worksheet.setHeight([0, 1], 60)).to.not.throw();
        expect(worksheet.rows[0].element.style.height).to.equal('60px');
        expect(worksheet.rows[1].element.style.height).to.equal('60px');

        expect(() => worksheet.undo()).to.not.throw();
        expect(() => worksheet.redo()).to.not.throw();
    });

    it('resizing a row that is part of a multi-row selection resizes every selected row (drag-end simulation)', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [2, 4],
                    data: [
                        [1, 2],
                        [3, 4],
                        [5, 6],
                        [7, 8],
                    ],
                },
            ],
        });

        const worksheet = instance[0];

        // Select rows 1 and 2 (as if the user shift/ctrl-selected multiple row headers)
        worksheet.updateSelectionFromCoords(0, 1, 1, 2);
        expect(worksheet.getSelectedRows()).to.deep.equal([1, 2]);

        // Reproduce exactly what the row-resize mouseup handler in src/utils/events.js does:
        // when the dragged row is part of the current multi-row selection, it now resizes
        // every selected row to the new height instead of only the dragged one.
        const draggedRow = 1;
        const newHeight = 70;
        const rows = worksheet.getSelectedRows();

        expect(rows.length > 1 && rows.indexOf(draggedRow) !== -1).to.equal(true);

        const currentHeight = rows.map((r) => parseInt(worksheet.rows[r].element.getAttribute('height')));
        worksheet.setHeight(rows, newHeight, currentHeight);

        expect(worksheet.rows[1].element.style.height).to.equal('70px');
        expect(worksheet.rows[2].element.style.height).to.equal('70px');
        // Rows outside the selection are untouched
        expect(worksheet.rows[0].element.style.height).to.not.equal('70px');
        expect(worksheet.rows[3].element.style.height).to.not.equal('70px');
    });

    it('resizing a column that is part of a multi-column selection resizes every selected column (drag-end simulation)', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [4, 2],
                    data: [
                        [1, 2, 3, 4],
                        [5, 6, 7, 8],
                    ],
                },
            ],
        });

        const worksheet = instance[0];

        // Select columns 1 and 2
        worksheet.updateSelectionFromCoords(1, 0, 2, 1);
        expect(worksheet.getSelectedColumns()).to.deep.equal([1, 2]);

        const draggedColumn = 2;
        const newWidth = 120;
        const columns = worksheet.getSelectedColumns();

        expect(columns.length > 1 && columns.indexOf(draggedColumn) !== -1).to.equal(true);

        const currentWidth = columns.map((c) => parseInt(worksheet.cols[c].colElement.getAttribute('width')));
        worksheet.setWidth(columns, newWidth, currentWidth);

        expect(worksheet.cols[1].colElement.getAttribute('width')).to.equal('120');
        expect(worksheet.cols[2].colElement.getAttribute('width')).to.equal('120');
    });
});
