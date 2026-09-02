const { expect } = require('chai');

const jspreadsheet = require('../dist/index.js');

global.document.execCommand = function execCommandMock() {};

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const URL_IMAGE = 'https://picsum.photos/200/200';

describe('Use the image column type', () => {
    it('renders an image element when the cell value is a data:image string', () => {
        const instance = jspreadsheet(root, {
            tabs: true,
            worksheets: [
                {
                    minDimensions: [2, 2],
                    data: [[PIXEL, 'Hello']],
                    columns: [{ type: 'image' }, { type: 'text' }],
                    worksheetName: 'Sheet1',
                },
            ],
        });

        const table = root.querySelector('tbody');
        const firstRow = table.children[0];

        const img = firstRow.children[1].querySelector('img');

        expect(img).to.not.eq(null);
        expect(img.getAttribute('src')).to.eq(PIXEL);
    });

    it('renders an image element when the cell value is a plain http(s) URL', () => {
        const instance = jspreadsheet(root, {
            tabs: true,
            worksheets: [
                {
                    minDimensions: [2, 2],
                    data: [[URL_IMAGE, 'Hello']],
                    columns: [{ type: 'image' }, { type: 'text' }],
                    worksheetName: 'Sheet1',
                },
            ],
        });

        const table = root.querySelector('tbody');
        const firstRow = table.children[0];

        const img = firstRow.children[1].querySelector('img');

        expect(img).to.not.eq(null);
        expect(img.getAttribute('src')).to.eq(URL_IMAGE);
    });

    it('does not render an image when the value is not a data:image string', () => {
        jspreadsheet(root, {
            tabs: true,
            worksheets: [
                {
                    minDimensions: [2, 2],
                    data: [['not-an-image']],
                    columns: [{ type: 'image' }],
                    worksheetName: 'Sheet1',
                },
            ],
        });

        const table = root.querySelector('tbody');
        const firstRow = table.children[0];

        const img = firstRow.children[1].querySelector('img');

        expect(img).to.eq(null);
    });

    it('updates the rendered image when the cell value is changed via setValue', () => {
        const instance = jspreadsheet(root, {
            tabs: true,
            worksheets: [
                {
                    minDimensions: [2, 2],
                    data: [['']],
                    columns: [{ type: 'image' }],
                    worksheetName: 'Sheet1',
                },
            ],
        });

        const table = root.querySelector('tbody');
        const firstRow = table.children[0];

        expect(firstRow.children[1].querySelector('img')).to.eq(null);

        instance[0].setValue('A1', PIXEL);

        const img = firstRow.children[1].querySelector('img');

        expect(img).to.not.eq(null);
        expect(img.getAttribute('src')).to.eq(PIXEL);
    });

    it('copying an image cell and pasting it elsewhere reconstructs the image (not the <img> markup)', () => {
        const sheet = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [2, 2],
                    data: [[URL_IMAGE, '']],
                    columns: [{ type: 'image' }, { type: 'image' }],
                    worksheetName: 'Sheet1',
                },
            ],
        })[0];

        sheet.updateSelectionFromCoords(0, 0, 0, 0);
        sheet.copy();
        const clipboardValue = sheet.textarea.value;

        // The clipboard text must be the raw URL, not the literal `<img src="...">` markup
        expect(clipboardValue).to.eq(URL_IMAGE);

        sheet.updateSelectionFromCoords(1, 0, 1, 0);
        sheet.paste(1, 0, clipboardValue);

        expect(sheet.getValue('B1')).to.eq(URL_IMAGE);

        const table = root.querySelector('tbody');
        const firstRow = table.children[0];
        const img = firstRow.children[2].querySelector('img');

        expect(img).to.not.eq(null);
        expect(img.getAttribute('src')).to.eq(URL_IMAGE);
    });

    it('getValue returns the raw data:image string for an image cell', () => {
        const instance = jspreadsheet(root, {
            tabs: true,
            worksheets: [
                {
                    minDimensions: [2, 2],
                    data: [[PIXEL]],
                    columns: [{ type: 'image' }],
                    worksheetName: 'Sheet1',
                },
            ],
        });

        expect(instance[0].getValue('A1')).to.eq(PIXEL);
    });

    it('getData returns the raw source for image cells, whether or not processed is requested', () => {
        const instance = jspreadsheet(root, {
            tabs: true,
            worksheets: [
                {
                    minDimensions: [2, 1],
                    data: [['Hello', PIXEL]],
                    columns: [{ type: 'text' }, { type: 'image' }],
                    worksheetName: 'Sheet1',
                },
            ],
        });

        // Unprocessed: raw value either way
        expect(instance[0].getData(false, false)).to.eql([['Hello', PIXEL]]);

        // Processed: text cells get their rendered innerHTML, image cells still get the raw
        // source (not the literal `<img src="...">` markup)
        expect(instance[0].getData(false, true)).to.eql([['Hello', PIXEL]]);
    });

    it('getDataFromRange returns the raw source for image cells when processed is requested', () => {
        const instance = jspreadsheet(root, {
            tabs: true,
            worksheets: [
                {
                    minDimensions: [2, 1],
                    data: [['Hello', PIXEL]],
                    columns: [{ type: 'text' }, { type: 'image' }],
                    worksheetName: 'Sheet1',
                },
            ],
        });

        expect(instance[0].getDataFromRange('A1:B1', true)).to.eql([['Hello', PIXEL]]);
    });
});
