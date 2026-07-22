const { expect } = require('chai');

const jspreadsheet = require('../dist/index.js');

describe('Ctrl/Cmd + Arrow: jump to data edge (like Google Sheets/Excel)', () => {
    // Column 0: data rows 0-2, blank rows 3-4, data rows 5-7
    // Column 1: entirely blank
    // Column 2: data rows 0-1 only, blank the rest
    const makeInstance = () =>
        jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [5, 8],
                    data: [
                        [1, '', 1, '', ''],
                        [1, '', 1, '', ''],
                        [1, '', '', '', ''],
                        ['', '', '', '', ''],
                        ['', '', '', '', ''],
                        [1, '', '', '', ''],
                        [1, '', '', '', ''],
                        [1, '', '', '', ''],
                    ],
                },
            ],
        });

    it('jumps down through contiguous data to the last cell before a blank', () => {
        const instance = makeInstance();
        const worksheet = instance[0];

        worksheet.updateSelectionFromCoords(0, 0, 0, 0);
        worksheet.down(false, true); // Ctrl+Down

        expect(worksheet.selectedCell[1]).to.equal(2);
        expect(worksheet.selectedCell[3]).to.equal(2);
    });

    it('jumps down through blanks to the next non-empty cell', () => {
        const instance = makeInstance();
        const worksheet = instance[0];

        worksheet.updateSelectionFromCoords(0, 2, 0, 2);
        worksheet.down(false, true); // Ctrl+Down from row 2 (last of first data block)

        expect(worksheet.selectedCell[1]).to.equal(5);
        expect(worksheet.selectedCell[3]).to.equal(5);
    });

    it('jumps to the sheet edge when there is no more data ahead', () => {
        const instance = makeInstance();
        const worksheet = instance[0];

        worksheet.updateSelectionFromCoords(0, 5, 0, 5);
        worksheet.down(false, true); // Ctrl+Down from row 5, data continues to the last row (7)

        expect(worksheet.selectedCell[1]).to.equal(7);
        expect(worksheet.selectedCell[3]).to.equal(7);
    });

    it('does nothing further once already at the sheet edge', () => {
        const instance = makeInstance();
        const worksheet = instance[0];

        worksheet.updateSelectionFromCoords(0, 7, 0, 7);
        worksheet.down(false, true); // Ctrl+Down already at the last row

        expect(worksheet.selectedCell[1]).to.equal(7);
        expect(worksheet.selectedCell[3]).to.equal(7);
    });

    it('jumps to the last row when the whole column is blank', () => {
        const instance = makeInstance();
        const worksheet = instance[0];

        worksheet.updateSelectionFromCoords(1, 0, 1, 0);
        worksheet.down(false, true); // Ctrl+Down, column 1 is entirely blank

        expect(worksheet.selectedCell[1]).to.equal(7);
        expect(worksheet.selectedCell[3]).to.equal(7);
    });

    it('jumps up symmetrically to the data edge', () => {
        const instance = makeInstance();
        const worksheet = instance[0];

        worksheet.updateSelectionFromCoords(0, 7, 0, 7);
        worksheet.up(false, true); // Ctrl+Up from the bottom data block

        expect(worksheet.selectedCell[1]).to.equal(5);
        expect(worksheet.selectedCell[3]).to.equal(5);
    });

    it('jumps right through a blank to the next non-empty cell in the row', () => {
        const instance = makeInstance();
        const worksheet = instance[0];

        // Row 0 is [1, '', 1, '', ''] — col0 has data, col1 is blank, col2 has data
        worksheet.updateSelectionFromCoords(0, 0, 0, 0);
        worksheet.right(false, true); // Ctrl+Right

        expect(worksheet.selectedCell[0]).to.equal(2);
        expect(worksheet.selectedCell[2]).to.equal(2);
    });

    it('jumps right to the row edge when no more data follows', () => {
        const instance = makeInstance();
        const worksheet = instance[0];

        // From col2 (data), col3/col4 are blank with nothing beyond -> land on the last column
        worksheet.updateSelectionFromCoords(2, 0, 2, 0);
        worksheet.right(false, true); // Ctrl+Right

        expect(worksheet.selectedCell[0]).to.equal(4);
        expect(worksheet.selectedCell[2]).to.equal(4);
    });

    it('plain (non-ctrl) arrow keys still move one cell at a time', () => {
        const instance = makeInstance();
        const worksheet = instance[0];

        worksheet.updateSelectionFromCoords(0, 0, 0, 0);
        worksheet.down(false, false); // plain Down, no ctrl

        expect(worksheet.selectedCell[1]).to.equal(1);
        expect(worksheet.selectedCell[3]).to.equal(1);
    });

    it('Home key (no ctrl) still jumps to column 0 unconditionally, not a data edge', () => {
        const instance = makeInstance();
        const worksheet = instance[0];

        // Row 2 has data at column 0 and blanks elsewhere — Home must land on column 0
        // regardless of data, not stop early or skip past it looking for "data edges".
        worksheet.updateSelectionFromCoords(2, 2, 2, 2);
        worksheet.first(false, false); // Home

        expect(worksheet.selectedCell[0]).to.equal(0);
        expect(worksheet.selectedCell[2]).to.equal(0);
    });
});
