const { expect } = require('chai');
const jspreadsheet = require('../dist/index.js');

/** Exercise real input handlers, including their compatibility with the single-range API. */
describe('Multiple selection interactions', () => {
    const makeSheet = (options = {}, spreadsheetOptions = {}) =>
        jspreadsheet(root, {
            ...spreadsheetOptions,
            worksheets: [
                {
                    data: Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => `${x},${y}`)),
                    multipleSelection: true,
                    ...options,
                },
            ],
        })[0];

    const mouse = (target, type, modifiers = {}) =>
        target.dispatchEvent(
            new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                button: 0,
                buttons: type === 'mouseup' ? 0 : 1,
                ...modifiers,
            })
        );
    const click = (sheet, x, y, modifiers) => {
        const cell = sheet.records[y][x].element;
        mouse(cell, 'mousedown', modifiers);
        mouse(cell, 'mouseup', modifiers);
    };
    const key = (code, modifiers = {}) =>
        document.dispatchEvent(
            new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                keyCode: code,
                which: code,
                ...modifiers,
            })
        );

    for (const modifier of ['ctrlKey', 'metaKey']) {
        for (const multipleSelection of [false, true]) {
            it(`redoes with ${modifier}+Shift+Z and retains undo/Y shortcuts (multipleSelection=${multipleSelection})`, () => {
                const sheet = makeSheet({ multipleSelection });
                click(sheet, 0, 0);
                if (multipleSelection) sheet.addSelectionFromCoords(2, 2);
                const selected = sheet.getSelected(true);
                sheet.setValue(
                    sheet.getSelected().map((record) => record.element),
                    'changed'
                );

                expect(key(90, { [modifier]: true, key: 'z' })).to.equal(false);
                expect(sheet.getValue('A1')).to.equal('0,0');
                expect(key(90, { [modifier]: true, shiftKey: true, key: 'Z' })).to.equal(false);
                for (const cell of selected) expect(sheet.getValue(cell)).to.equal('changed');
                expect(sheet.getSelected(true)).to.deep.equal(selected);

                key(90, { [modifier]: true, key: 'z' });
                expect(key(89, { [modifier]: true, key: 'y' })).to.equal(false);
                for (const cell of selected) expect(sheet.getValue(cell)).to.equal('changed');
                expect(sheet.getValue('B2')).to.equal('1,1');
            });
        }
    }

    it('adds and toggles separate cells with Ctrl-click', () => {
        const sheet = makeSheet();
        click(sheet, 0, 0);
        click(sheet, 2, 2, { ctrlKey: true });
        expect(sheet.getSelected(true).sort()).to.deep.equal(['A1', 'C3']);
        click(sheet, 0, 0, { ctrlKey: true });
        expect(sheet.getSelected(true)).to.deep.equal(['C3']);
    });

    it('uses Cmd-click on Mac without treating Ctrl-click as additive', () => {
        const descriptor = Object.getOwnPropertyDescriptor(navigator, 'platform');
        Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' });
        try {
            const sheet = makeSheet();
            click(sheet, 0, 0);
            click(sheet, 2, 2, { metaKey: true });
            expect(sheet.getSelected(true).sort()).to.deep.equal(['A1', 'C3']);
        } finally {
            if (descriptor) Object.defineProperty(navigator, 'platform', descriptor);
            else delete navigator.platform;
        }
    });

    it('adds a dragged rectangle without extending across the gap', () => {
        const sheet = makeSheet();
        click(sheet, 0, 0);
        mouse(sheet.records[2][2].element, 'mousedown', { ctrlKey: true });
        mouse(sheet.records[3][3].element, 'mouseover', { ctrlKey: true });
        mouse(sheet.records[3][3].element, 'mouseup', { ctrlKey: true });
        expect(sheet.getSelected(true).sort()).to.deep.equal(['A1', 'C3', 'C4', 'D3', 'D4']);
    });

    it('extends only the active range with Shift and collapses on a plain arrow', () => {
        const sheet = makeSheet();
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        sheet.right(true);
        expect(sheet.getSelected(true).sort()).to.deep.equal(['A1', 'C3', 'D3']);
        sheet.down();
        expect(sheet.getSelected(true)).to.deep.equal(['C4']);
    });

    for (const platform of ['Win32', 'MacIntel']) {
        it(`adds and subtracts dragged ranges from a stable snapshot on ${platform}`, () => {
            const descriptor = Object.getOwnPropertyDescriptor(navigator, 'platform');
            Object.defineProperty(navigator, 'platform', { configurable: true, value: platform });
            const modifier = platform === 'MacIntel' ? { metaKey: true } : { ctrlKey: true };
            try {
                const sheet = makeSheet();
                click(sheet, 0, 0);
                sheet.updateSelectionFromCoords(0, 0, 3, 3);
                mouse(sheet.records[1][1].element, 'mousedown', modifier);
                mouse(sheet.records[2][2].element, 'mouseover', modifier);
                expect(sheet.getSelected()).to.have.length(12);
                expect(sheet.isSelected(1, 1)).to.equal(false);
                expect(sheet.isSelected(2, 2)).to.equal(false);
                expect(sheet.isSelected(3, 3)).to.equal(true);
                // Shrinking the removal restores cells outside the current drag rectangle.
                mouse(sheet.records[1][2].element, 'mouseover', modifier);
                expect(sheet.isSelected(2, 2)).to.equal(true);
                expect(sheet.getSelected()).to.have.length(14);
                mouse(sheet.records[1][2].element, 'mouseup', modifier);

                // Starting in the hole adds the block without removing existing overlaps.
                mouse(sheet.records[1][1].element, 'mousedown', modifier);
                mouse(sheet.records[3][3].element, 'mouseover', modifier);
                mouse(sheet.records[3][3].element, 'mouseup', modifier);
                expect(sheet.getSelected()).to.have.length(16);
                expect(sheet.getValue('B2')).to.equal('1,1');
            } finally {
                if (descriptor) Object.defineProperty(navigator, 'platform', descriptor);
                else delete navigator.platform;
            }
        });
    }

    it('keeps a subtractive drag subtractive when it crosses unselected cells', () => {
        const sheet = makeSheet();
        click(sheet, 0, 0);
        sheet.updateSelectionFromCoords(0, 0, 2, 2);
        mouse(sheet.records[1][1].element, 'mousedown', { ctrlKey: true });
        mouse(sheet.records[4][4].element, 'mouseover', { ctrlKey: true });
        mouse(sheet.records[4][4].element, 'mouseup', { ctrlKey: true });
        expect(sheet.getSelected(true)).to.deep.equal(['A1', 'B1', 'C1', 'A2', 'A3']);
    });

    it('can remove the entire selection and shrink the drag back without losing its original cells', () => {
        const sheet = makeSheet();
        click(sheet, 0, 0);
        sheet.updateSelectionFromCoords(0, 0, 1, 1);
        mouse(sheet.records[0][0].element, 'mousedown', { ctrlKey: true });
        mouse(sheet.records[1][1].element, 'mouseover', { ctrlKey: true });
        expect(sheet.getSelected(true)).to.deep.equal([]);
        mouse(sheet.records[0][0].element, 'mouseover', { ctrlKey: true });
        mouse(sheet.records[0][0].element, 'mouseup', { ctrlKey: true });
        expect(sheet.getSelected(true)).to.deep.equal(['B1', 'A2', 'B2']);
    });

    it('extends an added range with Ctrl+Shift-click while retaining the initial range', () => {
        const sheet = makeSheet();
        click(sheet, 0, 0);
        click(sheet, 2, 2, { ctrlKey: true });
        click(sheet, 3, 3, { ctrlKey: true, shiftKey: true });
        expect(sheet.getSelected(true)).to.deep.equal(['A1', 'C3', 'D3', 'C4', 'D4']);
        click(sheet, 2, 3, { ctrlKey: true, shiftKey: true });
        expect(sheet.getSelected(true)).to.deep.equal(['A1', 'C3', 'C4']);
    });

    it('cancels a subtractive drag update without losing its base selection', () => {
        let cancel = false;
        const sheet = makeSheet({}, { onbeforeselection: () => (cancel ? false : undefined) });
        click(sheet, 0, 0);
        sheet.updateSelectionFromCoords(0, 0, 3, 3);
        mouse(sheet.records[1][1].element, 'mousedown', { ctrlKey: true });
        cancel = true;
        mouse(sheet.records[2][2].element, 'mouseover', { ctrlKey: true });
        expect(sheet.getSelected()).to.have.length(15);
        cancel = false;
        mouse(sheet.records[2][2].element, 'mouseover', { ctrlKey: true });
        mouse(sheet.records[2][2].element, 'mouseup', { ctrlKey: true });
        expect(sheet.getSelected()).to.have.length(12);
    });

    it('keeps the original active fragment after removal for plain Shift extension', () => {
        const sheet = makeSheet();
        click(sheet, 0, 0);
        sheet.updateSelectionFromCoords(0, 0, 3, 3);
        click(sheet, 1, 1, { ctrlKey: true });
        expect(sheet.getSelection()).to.deep.equal([0, 0, 3, 0]);
        click(sheet, 3, 3, { shiftKey: true });
        expect(sheet.getSelected()).to.have.length(16);
    });

    for (const platform of ['Win32', 'MacIntel']) {
        it(`continues and shrinks the last removal with Ctrl/Cmd+Shift on ${platform}`, () => {
            const descriptor = Object.getOwnPropertyDescriptor(navigator, 'platform');
            Object.defineProperty(navigator, 'platform', { configurable: true, value: platform });
            const modifier = platform === 'MacIntel' ? { metaKey: true } : { ctrlKey: true };
            try {
                const sheet = makeSheet();
                click(sheet, 0, 0);
                sheet.updateSelectionFromCoords(0, 0, 3, 3);
                click(sheet, 1, 1, modifier);
                click(sheet, 3, 3, { ...modifier, shiftKey: true });
                expect(sheet.getSelected()).to.have.length(7);
                expect(sheet.isSelected(3, 3)).to.equal(false);
                click(sheet, 2, 2, { ...modifier, shiftKey: true });
                expect(sheet.getSelected()).to.have.length(12);
                expect(sheet.isSelected(3, 3)).to.equal(true);
                expect(sheet.isSelected(1, 1)).to.equal(false);
                click(sheet, 0, 0, { ...modifier, shiftKey: true });
                expect(sheet.getSelected()).to.have.length(12);
                expect(sheet.isSelected(0, 0)).to.equal(false);
                expect(sheet.isSelected(2, 2)).to.equal(true);
                mouse(sheet.records[2][2].element, 'mousedown', { ...modifier, shiftKey: true });
                mouse(sheet.records[3][3].element, 'mouseover', { ...modifier, shiftKey: true });
                mouse(sheet.records[3][3].element, 'mouseup', { ...modifier, shiftKey: true });
                expect(sheet.getSelected()).to.have.length(7);
            } finally {
                if (descriptor) Object.defineProperty(navigator, 'platform', descriptor);
                else delete navigator.platform;
            }
        });
    }

    it('can shrink a completed removal after it deselected every cell', () => {
        const sheet = makeSheet();
        click(sheet, 0, 0);
        sheet.updateSelectionFromCoords(0, 0, 1, 1);
        mouse(sheet.records[0][0].element, 'mousedown', { ctrlKey: true });
        mouse(sheet.records[1][1].element, 'mouseover', { ctrlKey: true });
        mouse(sheet.records[1][1].element, 'mouseup', { ctrlKey: true });
        expect(sheet.getSelected(true)).to.deep.equal([]);
        click(sheet, 0, 0, { ctrlKey: true, shiftKey: true });
        expect(sheet.getSelected(true)).to.deep.equal(['B1', 'A2', 'B2']);
    });

    it('discards the previous removal when a plain click starts a new selection', () => {
        const sheet = makeSheet();
        click(sheet, 0, 0);
        sheet.updateSelectionFromCoords(0, 0, 3, 3);
        click(sheet, 1, 1, { ctrlKey: true });
        click(sheet, 3, 3);
        click(sheet, 4, 4, { ctrlKey: true, shiftKey: true });
        expect(sheet.getSelected(true)).to.deep.equal(['D4', 'E4', 'D5', 'E5']);
    });

    it('discards a completed removal when replacing data with no selected cells remaining', () => {
        const sheet = makeSheet();
        click(sheet, 0, 0);
        click(sheet, 0, 0, { ctrlKey: true });
        expect(sheet.getSelected(true)).to.deep.equal([]);
        sheet.setData([
            ['new', 'data'],
            ['next', 'row'],
        ]);
        click(sheet, 1, 1, { ctrlKey: true, shiftKey: true });
        expect(sheet.getSelected(true)).to.deep.equal(['B2']);
    });

    it('keeps the last removal unchanged when continuation is cancelled', () => {
        let cancel = false;
        const sheet = makeSheet({}, { onbeforeselection: () => (cancel ? false : undefined) });
        click(sheet, 0, 0);
        sheet.updateSelectionFromCoords(0, 0, 3, 3);
        click(sheet, 1, 1, { ctrlKey: true });
        cancel = true;
        click(sheet, 2, 2, { ctrlKey: true, shiftKey: true });
        expect(sheet.getSelected()).to.have.length(15);
        cancel = false;
        click(sheet, 3, 3, { ctrlKey: true, shiftKey: true });
        expect(sheet.getSelected()).to.have.length(7);
    });

    it('removes whole merged cells when dragging a subtraction across them', () => {
        const sheet = makeSheet({ mergeCells: { B2: [2, 2] } });
        click(sheet, 0, 0);
        sheet.updateSelectionFromCoords(0, 0, 4, 4);
        mouse(sheet.records[1][1].element, 'mousedown', { ctrlKey: true });
        mouse(sheet.records[3][3].element, 'mouseover', { ctrlKey: true });
        mouse(sheet.records[3][3].element, 'mouseup', { ctrlKey: true });
        for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) expect(sheet.isSelected(x, y)).to.equal(false);
        expect(sheet.isSelected(0, 0)).to.equal(true);
        expect(sheet.isSelected(4, 4)).to.equal(true);
    });

    it('replaces disconnected selections on plain click and Escape', () => {
        const sheet = makeSheet();
        click(sheet, 0, 0);
        click(sheet, 2, 2, { ctrlKey: true });
        key(27);
        expect(sheet.getSelected(true)).to.deep.equal(['C3']);
        click(sheet, 0, 0);
        expect(sheet.getSelected(true)).to.deep.equal(['A1']);
    });

    it('keeps the selection when opening a context menu on an inactive selected cell', () => {
        const sheet = makeSheet();
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        sheet.records[0][0].element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        expect(sheet.getSelected(true).sort()).to.deep.equal(['A1', 'C3']);
    });

    it('clears selected cells with Delete while preserving gaps and readonly cells, then undoes once', () => {
        const sheet = makeSheet();
        sheet.setReadOnly('C3', true);
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
            [4, 4, 4, 4],
        ]);
        key(46);
        expect(sheet.getValue('A1')).to.equal('');
        expect(sheet.getValue('C3')).to.equal('2,2');
        expect(sheet.getValue('E5')).to.equal('');
        expect(sheet.getValue('B2')).to.equal('1,1');
        sheet.undo();
        expect(sheet.getValue('A1')).to.equal('0,0');
        expect(sheet.getValue('E5')).to.equal('4,4');
        expect(sheet.getSelected(true).sort()).to.deep.equal(['A1', 'C3', 'E5']);
    });

    it('does not cut when copying is cancelled', () => {
        const sheet = makeSheet({}, { oncopy: () => false });
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        sheet.copy(true);
        expect(sheet.getValue('A1')).to.equal('0,0');
        expect(sheet.getValue('C3')).to.equal('2,2');
    });

    it('returns blank gaps from selected data without exposing unselected values', () => {
        const sheet = makeSheet();
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        expect(sheet.getData(true)).to.deep.equal([
            ['0,0', '', ''],
            ['', '', ''],
            ['', '', '2,2'],
        ]);
        sheet.options.copyPreserveGaps = false;
        expect(sheet.getData(true)).to.deep.equal([['0,0'], ['2,2']]);
        expect(sheet.getData().length).to.equal(5);
    });

    it('resets logical selection when replacing all data', () => {
        const sheet = makeSheet();
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 2, 2, 2],
        ]);
        sheet.setData([[1]]);
        expect(sheet.getHighlighted()).to.deep.equal([]);
    });

    it('keeps modifier clicks compatible when multipleSelection is disabled', () => {
        const sheet = makeSheet({ multipleSelection: false });
        click(sheet, 0, 0);
        click(sheet, 2, 2, { ctrlKey: true });
        expect(sheet.getSelected(true)).to.deep.equal(['C3']);
    });
    it('toggles selected checkboxes only and leaves readonly cells untouched', () => {
        const sheet = makeSheet({
            columns: [{ type: 'checkbox' }, { type: 'checkbox' }, { type: 'checkbox' }],
            data: [
                [false, false, false],
                [false, false, false],
                [false, false, false],
            ],
        });
        sheet.setReadOnly('C3', true);
        sheet.setSelections([
            [0, 0, 0, 0],
            [1, 1, 1, 1],
            [2, 2, 2, 2],
        ]);
        key(32);
        expect(sheet.getValue('A1')).to.equal(true);
        expect(sheet.getValue('B2')).to.equal(true);
        expect(sheet.getValue('C3')).to.equal(false);
        expect(sheet.getValue('B1')).to.equal(false);
        sheet.undo();
        expect(sheet.getValue('A1')).to.equal(false);
        expect(sheet.getValue('B2')).to.equal(false);
    });

    it('toggles the active radio and restores its displaced group member on undo', () => {
        const sheet = makeSheet({ columns: [{ type: 'radio' }], data: [[true], [false], [false]] });
        sheet.setSelections([
            [0, 1, 0, 1],
            [0, 2, 0, 2],
        ]);
        key(32);
        expect(sheet.getData()).to.deep.equal([[false], [false], [true]]);
        sheet.undo();
        expect(sheet.getData()).to.deep.equal([[true], [false], [false]]);
        sheet.redo();
        expect(sheet.getData()).to.deep.equal([[false], [false], [true]]);
    });
});
