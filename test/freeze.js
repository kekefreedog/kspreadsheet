const { expect } = require('chai');

const jspreadsheet = require('../dist/index.js');

describe('Freeze columns and rows', () => {
    it('freezeColumns marks the configured header/body cells and leaves the rest alone', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [5, 5],
                    data: [
                        [1, 2, 3, 4, 5],
                        [6, 7, 8, 9, 10],
                    ],
                    freezeColumns: 2,
                },
            ],
        });

        const worksheet = instance[0];

        expect(worksheet.headers[0].classList.contains('jss_freezed')).to.equal(true);
        expect(worksheet.headers[1].classList.contains('jss_freezed')).to.equal(true);
        expect(worksheet.headers[2].classList.contains('jss_freezed')).to.equal(false);

        // First frozen column rests at offset 0, the second at the width of the first
        expect(worksheet.headers[0].style.left).to.equal('0px');
        expect(worksheet.headers[1].style.left).to.not.equal('');

        expect(worksheet.records[0][0].element.classList.contains('jss_freezed')).to.equal(true);
        expect(worksheet.records[0][1].element.classList.contains('jss_freezed')).to.equal(true);
        expect(worksheet.records[0][2].element.classList.contains('jss_freezed')).to.equal(false);
    });

    it('freezeRows marks every cell in the configured rows and leaves later rows alone', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [5, 5],
                    data: [
                        [1, 2, 3, 4, 5],
                        [6, 7, 8, 9, 10],
                        [11, 12, 13, 14, 15],
                    ],
                    freezeRows: 2,
                },
            ],
        });

        const worksheet = instance[0];

        // Row 0 and row 1 are frozen: every cell (including the row-number cell) should stick
        for (const row of [0, 1]) {
            for (let col = 0; col < worksheet.records[row].length; col++) {
                expect(worksheet.records[row][col].element.classList.contains('jss_row_freezed'), `row ${row} col ${col}`).to.equal(true);
                expect(worksheet.records[row][col].element.style.top).to.not.equal('');
            }
            // Row-number cell (first child of the <tr>) is also pinned
            expect(worksheet.rows[row].element.children[0].classList.contains('jss_row_freezed')).to.equal(true);
        }

        // Row 2 is not frozen
        for (let col = 0; col < worksheet.records[2].length; col++) {
            expect(worksheet.records[2][col].element.classList.contains('jss_row_freezed')).to.equal(false);
        }
    });

    it('freezeRows + freezeColumns together mark the corner cell on both axes', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [5, 5],
                    data: [
                        [1, 2, 3, 4, 5],
                        [6, 7, 8, 9, 10],
                        [11, 12, 13, 14, 15],
                    ],
                    freezeColumns: 1,
                    freezeRows: 1,
                },
            ],
        });

        const worksheet = instance[0];
        const corner = worksheet.records[0][0].element;

        expect(corner.classList.contains('jss_freezed')).to.equal(true);
        expect(corner.classList.contains('jss_row_freezed')).to.equal(true);
    });

    it('does not mark any cells when freezeColumns/freezeRows are not set', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [5, 5],
                    data: [
                        [1, 2, 3, 4, 5],
                        [6, 7, 8, 9, 10],
                    ],
                },
            ],
        });

        const worksheet = instance[0];

        for (let row = 0; row < worksheet.records.length; row++) {
            for (let col = 0; col < worksheet.records[row].length; col++) {
                expect(worksheet.records[row][col].element.classList.contains('jss_freezed')).to.equal(false);
                expect(worksheet.records[row][col].element.classList.contains('jss_row_freezed')).to.equal(false);
            }
        }
    });

    it('setHeight on a frozen row does not throw and keeps offsets applied', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [5, 5],
                    data: [
                        [1, 2, 3, 4, 5],
                        [6, 7, 8, 9, 10],
                    ],
                    freezeRows: 1,
                },
            ],
        });

        const worksheet = instance[0];

        expect(() => worksheet.setHeight(0, 40)).to.not.throw();
        expect(worksheet.records[0][0].element.classList.contains('jss_row_freezed')).to.equal(true);
    });
});
