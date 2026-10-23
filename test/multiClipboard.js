const { expect } = require('chai');
const jspreadsheet = require('../dist/index.js');

describe('Clipboard with disconnected selections', () => {
    let originalExecCommand;

    const makeSheet = (options = {}, events = {}) =>
        jspreadsheet(root, {
            ...events,
            worksheets: [
                {
                    multipleSelection: true,
                    minDimensions: [10, 10],
                    data: [
                        ['a', 'gap', 'c'],
                        ['gap', 'gap', 'gap'],
                        ['gap', 'gap', 'z'],
                    ],
                    ...options,
                },
            ],
        })[0];

    beforeEach(() => {
        originalExecCommand = document.execCommand;
        document.execCommand = () => true;
    });

    afterEach(() => {
        document.execCommand = originalExecCommand;
    });

    it('preserves horizontal and vertical gaps in external text by default', () => {
        const sheet = makeSheet();
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);

        sheet.copy();

        expect(sheet.textarea.value).to.equal('a\t\t\n\t\t\n\t\tz');
        expect(sheet.textarea.value).not.to.include('gap');
    });

    it('keeps internal gaps untouched and preserves source formulas and styles', () => {
        const sheet = makeSheet();
        sheet.setValue('C3', '=1+2');
        sheet.setStyle('C3', 'color', 'red');
        sheet.setValue('F5', 'keep');
        sheet.setValue('G6', 'keep');
        sheet.setStyle('F5', 'color', 'blue');
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        sheet.copy();
        const text = sheet.textarea.value;

        sheet.updateSelectionFromCoords(4, 4);
        sheet.paste(4, 4, text);

        expect(sheet.getValue('E5')).to.equal('a');
        expect(sheet.getValue('G7')).to.equal('=1+2');
        expect(sheet.getValue('G7', true)).to.equal('3');
        expect(sheet.getStyle('G7', 'color')).to.equal('red');
        expect(sheet.getValue('F5')).to.equal('keep');
        expect(sheet.getValue('G6')).to.equal('keep');
        expect(sheet.getStyle('F5', 'color')).to.equal('blue');
        expect(sheet.isSelected(5, 4)).to.equal(false);
    });

    it('packs each selected row and omits empty rows when copyPreserveGaps is false', () => {
        const sheet = makeSheet({ copyPreserveGaps: false });
        sheet.setValue('F6', 'keep');
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 0, 2, 0],
            [2, 2, 2, 2],
        ]);
        sheet.copy();
        const text = sheet.textarea.value;
        expect(text).to.equal('a\tc\nz\t');

        sheet.updateSelectionFromCoords(4, 4);
        sheet.paste(4, 4, text);

        expect(sheet.getValue('E5')).to.equal('a');
        expect(sheet.getValue('F5')).to.equal('c');
        expect(sheet.getValue('E6')).to.equal('z');
        expect(sheet.getValue('F6')).to.equal('keep');
    });

    it('broadcasts a scalar to selected cells while respecting readonly cells', () => {
        const sheet = makeSheet();
        sheet.setReadOnly('C3', true);
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        const beforeHistory = sheet.historyIndex;

        sheet.paste(2, 2, 'changed');

        expect(sheet.getValue('A1')).to.equal('changed');
        expect(sheet.getValue('C3')).to.equal('z');
        expect(sheet.getValue('B1')).to.equal('gap');
        expect(sheet.historyIndex).to.equal(beforeHistory + 1);
        sheet.undo();
        expect(sheet.getValue('A1')).to.equal('a');
        expect(sheet.getHighlighted()).to.have.length(2);
        sheet.redo();
        expect(sheet.getValue('A1')).to.equal('changed');
    });

    it('pastes a rectangular block into compatible disconnected ranges', () => {
        const sheet = makeSheet();
        sheet.setSelections([
            [0, 0, 1, 1],
            [4, 4, 5, 5],
        ]);

        sheet.paste(4, 4, 'one\ttwo\nthree\tfour');

        expect(sheet.getValue('A1')).to.equal('one');
        expect(sheet.getValue('B2')).to.equal('four');
        expect(sheet.getValue('E5')).to.equal('one');
        expect(sheet.getValue('F6')).to.equal('four');
        expect(sheet.getValue('C3')).to.equal('z');
    });

    it('rejects an incompatible destination before writing any values or history', () => {
        const sheet = makeSheet();
        sheet.setSelections([
            [0, 0, 1, 1],
            [4, 4, 4, 4],
        ]);
        const before = JSON.stringify(sheet.options.data);
        const beforeHistory = sheet.historyIndex;

        expect(sheet.paste(4, 4, 'one\ttwo\nthree\tfour')).to.equal(false);

        expect(JSON.stringify(sheet.options.data)).to.equal(before);
        expect(sheet.historyIndex).to.equal(beforeHistory);
    });

    it('does not cut cells when oncopy cancels the operation', () => {
        const sheet = makeSheet({}, { oncopy: () => false });
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);

        sheet.copy(true);

        expect(sheet.getValue('A1')).to.equal('a');
        expect(sheet.getValue('C3')).to.equal('z');
    });

    it('does not cut cells when the browser denies clipboard access', () => {
        const sheet = makeSheet();
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        document.execCommand = () => false;

        sheet.copy(true);

        expect(sheet.getValue('A1')).to.equal('a');
        expect(sheet.getValue('C3')).to.equal('z');
    });

    it('cuts selected cells only and restores them together with undo', () => {
        const sheet = makeSheet();
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);

        sheet.copy(true);

        expect(sheet.getValue('A1')).to.equal('');
        expect(sheet.getValue('C3')).to.equal('');
        expect(sheet.getValue('B1')).to.equal('gap');
        sheet.undo();
        expect(sheet.getValue('A1')).to.equal('a');
        expect(sheet.getValue('C3')).to.equal('z');
    });

    it('preserves a copied scalar formula when pasted into several destinations', () => {
        const sheet = makeSheet();
        sheet.setValue('A1', '=1+2');
        sheet.updateSelectionFromCoords(0, 0);
        sheet.copy();
        const text = sheet.textarea.value;
        sheet.setSelections([
            [4, 4, 4, 4],
            [6, 6, 6, 6],
        ]);

        sheet.paste(6, 6, text);

        expect(sheet.getValue('E5')).to.equal('=1+2');
        expect(sheet.getValue('G7')).to.equal('=1+2');
    });

    it('does not revive copied formulas when oncopy replaces clipboard text', () => {
        const sheet = makeSheet({}, { oncopy: () => 'replacement' });
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        sheet.copy();
        sheet.updateSelectionFromCoords(4, 4);

        sheet.paste(4, 4, sheet.textarea.value);

        expect(sheet.getValue('E5')).to.equal('replacement');
        expect(sheet.getValue('G7')).to.equal('');
    });

    it('distinguishes an empty selected cell from an unselected gap', () => {
        const sheet = makeSheet();
        sheet.setValue('C3', '');
        sheet.setValue('G7', 'clear');
        sheet.setValue('F5', 'keep');
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        sheet.copy();
        sheet.updateSelectionFromCoords(4, 4);

        sheet.paste(4, 4, sheet.data);

        expect(sheet.getValue('G7')).to.equal('');
        expect(sheet.getValue('F5')).to.equal('keep');
    });

    it('can cancel a whole multi-range paste without partial changes', () => {
        const sheet = makeSheet({}, { onbeforepaste: () => false });
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);

        expect(sheet.paste(0, 0, 'replacement')).to.equal(false);
        expect(sheet.getValue('A1')).to.equal('a');
        expect(sheet.getValue('C3')).to.equal('z');
    });

    it('rejects a block that intersects an existing merge before changing other ranges', () => {
        const sheet = makeSheet({ mergeCells: { E5: [2, 2] } });
        sheet.setSelections([
            [0, 0, 1, 1],
            [4, 4, 5, 5],
        ]);
        const before = JSON.stringify(sheet.options.data);

        expect(sheet.paste(0, 0, 'one\ttwo\nthree\tfour')).to.equal(false);
        expect(JSON.stringify(sheet.options.data)).to.equal(before);
    });

    it('preflights expansion callbacks before inserting any rows or columns', () => {
        const sheet = makeSheet({}, { onbeforeinsertrow: () => false });
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        sheet.copy();
        sheet.updateSelectionFromCoords(9, 9);

        expect(sheet.paste(9, 9, sheet.data)).to.equal(false);
        expect(sheet.headers).to.have.length(10);
        expect(sheet.rows).to.have.length(10);
        expect(sheet.getValue('J10')).to.equal('');
    });

    it('preserves masked gaps when copied to another worksheet in the same runtime', async () => {
        const source = makeSheet();
        source.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        source.copy();
        const text = source.textarea.value;

        const otherRoot = document.createElement('div');
        root.appendChild(otherRoot);
        const target = jspreadsheet(otherRoot, {
            worksheets: [
                {
                    multipleSelection: true,
                    minDimensions: [6, 6],
                    data: [
                        ['keep', 'keep', 'keep'],
                        ['keep', 'keep', 'keep'],
                        ['keep', 'keep', 'keep'],
                    ],
                },
            ],
        })[0];
        target.updateSelectionFromCoords(0, 0);

        target.paste(0, 0, text);

        expect(target.getValue('A1')).to.equal('a');
        expect(target.getValue('C3')).to.equal('z');
        expect(target.getValue('B1')).to.equal('keep');
        expect(target.getValue('B2')).to.equal('keep');
    });

    it('treats changed external clipboard text as a complete rectangle', () => {
        const sheet = makeSheet();
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        sheet.copy();
        sheet.setValue('F5', 'overwrite');
        const text = sheet.textarea.value.replace('a', 'external');
        sheet.updateSelectionFromCoords(4, 4);

        sheet.paste(4, 4, text);

        expect(sheet.getValue('E5')).to.equal('external');
        expect(sheet.getValue('F5')).to.equal('');
        expect(sheet.getValue('G7')).to.equal('z');
    });

    it('restores radio-group siblings outside the pasted selection with undo', () => {
        const sheet = makeSheet({
            columns: [{ type: 'radio' }, { type: 'text' }],
            data: [
                [false, 'a'],
                [true, 'b'],
                [false, 'c'],
            ],
        });
        sheet.setSelections([
            [0, 0, 0, 0],
            [1, 2, 1, 2],
        ]);

        sheet.paste(0, 0, 'true');

        expect(sheet.getValue('A1')).to.equal(true);
        expect(sheet.getValue('A2')).to.equal(false);
        expect(sheet.getValue('B3')).to.equal('true');
        sheet.undo();
        expect(sheet.getValue('A1')).to.equal(false);
        expect(sheet.getValue('A2')).to.equal(true);
        expect(sheet.getValue('B3')).to.equal('c');
        sheet.redo();
        expect(sheet.getValue('A1')).to.equal(true);
        expect(sheet.getValue('A2')).to.equal(false);
    });

    it('does not clear a checked readonly radio sibling while pasting', () => {
        const sheet = makeSheet({
            columns: [{ type: 'radio' }, { type: 'text' }],
            data: [
                [false, 'a'],
                [true, 'b'],
                [false, 'c'],
            ],
        });
        sheet.setReadOnly('A2', true);
        sheet.setSelections([
            [0, 0, 0, 0],
            [1, 2, 1, 2],
        ]);

        sheet.paste(0, 0, 'true');

        expect(sheet.getValue('A1')).to.equal(false);
        expect(sheet.getValue('A2')).to.equal(true);
        expect(sheet.getValue('B3')).to.equal('true');
    });

    it('keeps readonly values and styles untouched in a single destination range', () => {
        const sheet = makeSheet();
        sheet.setStyle('A1', 'color', 'red');
        sheet.updateSelectionFromCoords(0, 0);
        sheet.copy();
        const text = sheet.textarea.value;
        sheet.setStyle('E5', 'color', 'blue');
        sheet.setReadOnly('E5', true);
        sheet.updateSelectionFromCoords(4, 4);

        sheet.paste(4, 4, text);

        expect(sheet.getValue('E5')).to.equal('');
        expect(sheet.getStyle('E5', 'color')).to.equal('blue');
    });

    it('expands a single destination and undoes inserted dimensions with the values', () => {
        const sheet = makeSheet({ minDimensions: [3, 3] });
        sheet.updateSelectionFromCoords(2, 2);

        sheet.paste(2, 2, 'one\ttwo\nthree\tfour');

        expect(sheet.getValue('C3')).to.equal('one');
        expect(sheet.getValue('D4')).to.equal('four');
        expect(sheet.rows).to.have.length(4);
        expect(sheet.headers).to.have.length(4);
        sheet.undo();
        expect(sheet.getValue('C3')).to.equal('z');
        expect(sheet.rows).to.have.length(3);
        expect(sheet.headers).to.have.length(3);
    });

    it('fills the entire backwards selection with a scalar', () => {
        const sheet = makeSheet();
        sheet.updateSelectionFromCoords(2, 2, 0, 0);

        sheet.paste(2, 2, 'filled');

        for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 3; x++) expect(sheet.options.data[y][x]).to.equal('filled');
        }
        expect(sheet.getValue('D1')).to.equal('');
        expect(sheet.getValue('A4')).to.equal('');
    });

    it('repeats a block across the entire backwards selection', () => {
        const sheet = makeSheet();
        sheet.updateSelectionFromCoords(3, 3, 0, 0);

        sheet.paste(3, 3, 'one\ttwo\nthree\tfour');

        expect(sheet.options.data.slice(0, 4).map((row) => row.slice(0, 4))).to.deep.equal([
            ['one', 'two', 'one', 'two'],
            ['three', 'four', 'three', 'four'],
            ['one', 'two', 'one', 'two'],
            ['three', 'four', 'three', 'four'],
        ]);
        expect(sheet.getValue('E4')).to.equal('');
    });

    it('fills adjacent added cells after their ranges coalesce', () => {
        const sheet = makeSheet();
        sheet.updateSelectionFromCoords(0, 0);
        sheet.addSelectionFromCoords(1, 0);
        expect(sheet.getHighlighted()).to.deep.equal([[0, 0, 1, 0]]);

        sheet.paste(1, 0, 'filled');

        expect(sheet.getValue('A1')).to.equal('filled');
        expect(sheet.getValue('B1')).to.equal('filled');
        expect(sheet.getValue('C1')).to.equal('c');
    });

    it('repeats a block over adjacent added ranges rather than only the active gesture', () => {
        const sheet = makeSheet();
        sheet.updateSelectionFromCoords(0, 0, 1, 0);
        sheet.addSelectionFromCoords(2, 0, 3, 0);
        expect(sheet.getHighlighted()).to.deep.equal([[0, 0, 3, 0]]);

        sheet.paste(2, 0, 'one\ttwo');

        expect(sheet.options.data[0].slice(0, 4)).to.deep.equal(['one', 'two', 'one', 'two']);
        expect(sheet.getValue('E1')).to.equal('');
    });

    it('uses only the explicit destination when pasting outside the selected union', () => {
        const sheet = makeSheet();
        sheet.updateSelectionFromCoords(4, 4, 5, 5);

        sheet.paste(0, 0, 'outside');

        expect(sheet.getValue('A1')).to.equal('outside');
        expect(sheet.getValue('B1')).to.equal('gap');
        expect(sheet.getValue('A2')).to.equal('gap');
        expect(sheet.getValue('E5')).to.equal('');
        expect(sheet.getValue('F6')).to.equal('');
    });
});
