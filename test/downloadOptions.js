const { expect } = require('chai');
const { Blob: NodeBlob } = require('buffer');
const ExcelJS = require('exceljs');

// Exercise the source directly so these regressions do not depend on a rebuilt bundle.
require('@babel/register')({
    only: [require('path').resolve(__dirname, '../src')],
    presets: [[require.resolve('@babel/preset-env'), { targets: { node: 'current' } }]],
    babelrc: false,
    configFile: false,
    cache: false,
});
const jspreadsheet = require('../src/index.js').default;

const AVATAR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJmAwEd1s0zAAAAAElFTkSuQmCC';

describe('Download filenames and worksheet options (source)', () => {
    let originals, capturedBlob, filenames;

    const create = (worksheets) =>
        new Promise((resolve) => {
            jspreadsheet(root, { worksheets, tabs: true, onload: (spreadsheet) => resolve(spreadsheet.worksheets) });
        });

    const worksheet = (name, value = name) => ({
        worksheetName: name,
        data: [[value]],
        columns: [{ type: 'text', title: 'Value', width: 145 }],
    });

    const readWorkbook = async () => {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await capturedBlob.arrayBuffer());
        return workbook;
    };

    beforeEach(() => {
        originals = {
            Blob: global.Blob,
            createObjectURL: URL.createObjectURL,
            revokeObjectURL: URL.revokeObjectURL,
            click: HTMLAnchorElement.prototype.click,
            fetch: global.fetch,
        };
        global.Blob = NodeBlob;
        filenames = [];
        capturedBlob = undefined;
        URL.createObjectURL = (blob) => {
            capturedBlob = blob;
            return 'blob:download-options';
        };
        URL.revokeObjectURL = () => {};
        HTMLAnchorElement.prototype.click = function () {
            filenames.push(this.download);
        };
    });

    afterEach(() => {
        jspreadsheet.destroy(root, true);
        global.Blob = originals.Blob;
        URL.createObjectURL = originals.createObjectURL;
        URL.revokeObjectURL = originals.revokeObjectURL;
        HTMLAnchorElement.prototype.click = originals.click;
        global.fetch = originals.fetch;
    });

    it('captures the legacy worksheet filename before asynchronous XLSX generation', async () => {
        const [sheet] = await create([worksheet('Template')]);
        sheet.options.worksheetName = 'Delivery_001';
        sheet.download(true, false, 'csv');
        const pending = sheet.download(true, false, 'xlsx');
        sheet.options.worksheetName = 'Template';
        await pending;

        expect(filenames).to.deep.equal(['Delivery_001.csv', 'Delivery_001.xlsx']);
        expect((await readWorkbook()).worksheets[0].name).to.equal('Delivery_001');
    });

    it('captures csvFileName before it is restored', async () => {
        const [sheet] = await create([worksheet('Template')]);
        sheet.options.csvFileName = 'Package';
        const pending = sheet.download(true, false, 'xlsx');
        sheet.options.csvFileName = 'Restored';
        await pending;

        expect(filenames).to.deep.equal(['Package.xlsx']);
    });

    it('uses an explicit filename for both formats without changing worksheet options', async () => {
        const [sheet] = await create([worksheet('Template')]);
        sheet.options.csvFileName = 'Configured';
        sheet.download(true, false, 'csv', { filename: 'Delivery.csv' });
        const options = { filename: 'Delivery.xlsx' };
        const pending = sheet.download(true, false, 'xlsx', options);
        options.filename = 'Changed';
        await pending;

        expect(filenames).to.deep.equal(['Delivery.csv', 'Delivery.xlsx']);
        expect(sheet.options.csvFileName).to.equal('Configured');
        expect(sheet.options.worksheetName).to.equal('Template');
    });

    it('keeps concurrent XLSX filenames independent', async () => {
        const [sheet] = await create([worksheet('Template')]);
        await Promise.all([sheet.download(true, false, 'xlsx', { filename: 'First' }), sheet.download(true, false, 'xlsx', { filename: 'Second' })]);
        expect(filenames).to.have.members(['First.xlsx', 'Second.xlsx']);
    });

    it('preserves the receiving worksheet as the default, even with another tab selected', async () => {
        const sheets = await create([worksheet('First'), worksheet('Second')]);
        sheets[0].openWorksheet(1);
        await sheets[0].download(true, false, 'xlsx');
        const workbook = await readWorkbook();

        expect(workbook.worksheets.map((sheet) => sheet.name)).to.deep.equal(['First']);
        expect(workbook.worksheets[0].getCell('A2').value).to.equal('First');
    });

    it('captures the selected tab when onlyVisibleSheet is true', async () => {
        const sheets = await create([worksheet('First'), worksheet('Second')]);
        sheets[0].openWorksheet(1);
        const pending = sheets[0].download(true, false, 'xlsx', { onlyVisibleSheet: true });
        sheets[0].openWorksheet(0);
        await pending;
        const workbook = await readWorkbook();

        expect(workbook.worksheets.map((sheet) => sheet.name)).to.deep.equal(['Second']);
        expect(workbook.worksheets[0].getCell('A2').value).to.equal('Second');
    });

    it('exports all tabs in order, keeping their data, widths, and embedded images', async () => {
        const imageSheet = worksheet('Images', AVATAR);
        imageSheet.columns[0].type = 'image';
        const sheets = await create([worksheet('First'), imageSheet, worksheet('Third')]);
        sheets[0].openWorksheet(1);
        const options = { filename: 'Workbook', onlyVisibleSheet: false };
        const pending = sheets[1].download(true, false, 'xlsx', options);
        options.onlyVisibleSheet = true;
        sheets[2].options.worksheetName = 'Changed';
        await pending;
        const workbook = await readWorkbook();

        expect(filenames).to.deep.equal(['Workbook.xlsx']);
        expect(workbook.worksheets.map((sheet) => sheet.name)).to.deep.equal(['First', 'Images', 'Third']);
        expect(workbook.worksheets[0].getCell('A1').value).to.equal('Value');
        expect(workbook.worksheets[0].getCell('A2').value).to.equal('First');
        expect(workbook.worksheets[2].getCell('A2').value).to.equal('Third');
        expect(workbook.worksheets[1].getColumn(1).width).to.equal(20);
        expect(workbook.worksheets[1].getCell('A2').value).to.equal('');
        expect(workbook.worksheets[1].getImages()).to.have.length(1);
        expect(workbook.model.media).to.have.length(1);
    });

    it('normalizes invalid, long, reserved, and duplicate Excel sheet names without renaming tabs', async () => {
        const names = ['A/B', 'a?b', 'x'.repeat(40), 'x'.repeat(40), "'", 'History'];
        const sheets = await create(names.map((name) => worksheet(name)));
        await sheets[0].download(true, false, 'xlsx', { onlyVisibleSheet: false });
        const workbook = await readWorkbook();

        expect(workbook.worksheets.map((sheet) => sheet.name)).to.deep.equal(['A_B', 'a_b (2)', 'x'.repeat(31), 'x'.repeat(27) + ' (2)', 'Sheet1', 'History_']);
        expect(sheets.map((sheet) => sheet.options.worksheetName)).to.deep.equal(names);
    });

    it('ignores worksheet selection options for CSV', async () => {
        const sheets = await create([worksheet('First'), worksheet('Second')]);
        sheets[0].openWorksheet(1);
        sheets[0].download(true, false, 'csv', { filename: 'Package', onlyVisibleSheet: false });

        expect(filenames).to.deep.equal(['Package.csv']);
        expect(await capturedBlob.text())
            .to.include('First')
            .and.not.include('Second');
    });

    it('keeps the filename while a remote image is still loading', async () => {
        let resolveImage;
        global.fetch = () =>
            new Promise((resolve) => {
                resolveImage = resolve;
            });
        const imageSheet = worksheet('Original', 'https://example.com/image.png');
        imageSheet.columns[0].type = 'image';
        const [sheet] = await create([imageSheet]);
        const pending = sheet.download(true, false, 'xlsx', { filename: 'Package' });
        sheet.options.csvFileName = 'Changed';
        expect(filenames).to.have.length(0);
        resolveImage({ ok: false });
        await pending;

        expect(filenames).to.deep.equal(['Package.xlsx']);
        expect((await readWorkbook()).worksheets[0].getCell('A2').value).to.equal('https://example.com/image.png');
    });
});
