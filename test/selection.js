const { expect } = require('chai');

const jspreadsheet = require('../dist/index.js');

describe('updateSelectionFromCoords robustness', () => {
    const makeInstance = () =>
        jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [5, 5],
                    data: [
                        [1, 2, 3, 4, 5],
                        [6, 7, 8, 9, 10],
                        [11, 12, 13, 14, 15],
                        [16, 17, 18, 19, 20],
                        [21, 22, 23, 24, 25],
                    ],
                },
            ],
        });

    it('does not throw with NaN coordinates and clamps into range', () => {
        const instance = makeInstance();
        const worksheet = instance[0];

        expect(() => worksheet.updateSelectionFromCoords(0, NaN, 2, NaN)).to.not.throw();
        expect(worksheet.selectedCell[1]).to.be.a('number').and.to.be.within(0, 4);
        expect(worksheet.selectedCell[3]).to.be.a('number').and.to.be.within(0, 4);
    });

    it('does not throw with out-of-range coordinates and clamps to the last valid index', () => {
        const instance = makeInstance();
        const worksheet = instance[0];

        expect(() => worksheet.updateSelectionFromCoords(0, 999, 2, 999)).to.not.throw();
        expect(worksheet.selectedCell).to.deep.equal([0, 4, 2, 4]);
    });

    it('does not throw with negative coordinates and clamps to 0', () => {
        const instance = makeInstance();
        const worksheet = instance[0];

        expect(() => worksheet.updateSelectionFromCoords(0, -5, 2, -5)).to.not.throw();
        expect(worksheet.selectedCell).to.deep.equal([0, 0, 2, 0]);
    });

    it('does not throw selecting a whole row (x1 null) with an out-of-range y', () => {
        const instance = makeInstance();
        const worksheet = instance[0];

        expect(() => worksheet.updateSelectionFromCoords(null, 999, null, 999)).to.not.throw();
        expect(worksheet.selectedCell[1]).to.equal(4);
        expect(worksheet.selectedCell[3]).to.equal(4);
    });

    it('still works normally with valid coordinates', () => {
        const instance = makeInstance();
        const worksheet = instance[0];

        worksheet.updateSelectionFromCoords(0, 1, 2, 1);

        expect(worksheet.selectedCell).to.deep.equal([0, 1, 2, 1]);
        expect(worksheet.records[1][0].element.classList.contains('highlight')).to.equal(true);
        expect(worksheet.records[1][1].element.classList.contains('highlight')).to.equal(true);
        expect(worksheet.records[1][2].element.classList.contains('highlight')).to.equal(true);
    });
});
