const { expect } = require('chai');
const { Blob: NodeBlob } = require('buffer');
const ExcelJS = require('exceljs');

const jspreadsheet = require('../dist/index.js');

const AVATAR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJmAwEd1s0zAAAAAElFTkSuQmCC';
const PHOTO_URL = 'https://example.com/photo.png';

describe('Use the download method', () => {
    let originalBlob, originalCreateObjectURL, originalRevokeObjectURL, originalAnchorClick, originalFetch;
    let capturedBlob;

    beforeEach(() => {
        // jsdom's Blob has no arrayBuffer()/text(); swap in Node's real Blob so the exported
        // file content can be read back and inspected.
        originalBlob = global.Blob;
        global.Blob = NodeBlob;

        originalCreateObjectURL = URL.createObjectURL;
        originalRevokeObjectURL = URL.revokeObjectURL;
        capturedBlob = undefined;
        URL.createObjectURL = (blob) => {
            capturedBlob = blob;
            return 'blob:mock';
        };
        URL.revokeObjectURL = () => {};

        // Avoid jsdom's "Not implemented: navigation" noise when the download anchor is clicked.
        originalAnchorClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {};

        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.Blob = originalBlob;
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
        HTMLAnchorElement.prototype.click = originalAnchorClick;
        global.fetch = originalFetch;
    });

    it('embeds a data:image cell as a real image in the XLSX export instead of raw text', async () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [2, 1],
                    data: [['John', AVATAR]],
                    columns: [
                        { type: 'text', title: 'Name' },
                        { type: 'image', title: 'Photo' },
                    ],
                    worksheetName: 'Sheet1',
                },
            ],
        });

        await instance[0].download(true, null, 'xlsx');

        const buffer = await capturedBlob.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const sheet = workbook.worksheets[0];

        // The image cell must be blank (not the raw base64 text) since a real image is embedded
        expect(sheet.getCell('B2').value).to.eq('');
        expect(workbook.model.media.length).to.eq(1);
        expect(workbook.model.media[0].extension).to.eq('png');
    });

    it('embeds a URL image cell as a real image when the fetch succeeds', async () => {
        global.fetch = async () => ({
            ok: true,
            headers: { get: () => 'image/png' },
            arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
        });

        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [2, 1],
                    data: [['Jane', PHOTO_URL]],
                    columns: [
                        { type: 'text', title: 'Name' },
                        { type: 'image', title: 'Photo' },
                    ],
                    worksheetName: 'Sheet1',
                },
            ],
        });

        await instance[0].download(true, null, 'xlsx');

        const buffer = await capturedBlob.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const sheet = workbook.worksheets[0];

        expect(sheet.getCell('B2').value).to.eq('');
        expect(workbook.model.media.length).to.eq(1);
    });

    it('falls back to the raw URL as text when the fetch fails (network error / CORS)', async () => {
        global.fetch = async () => {
            throw new Error('Network error');
        };

        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [2, 1],
                    data: [['Jane', PHOTO_URL]],
                    columns: [
                        { type: 'text', title: 'Name' },
                        { type: 'image', title: 'Photo' },
                    ],
                    worksheetName: 'Sheet1',
                },
            ],
        });

        await instance[0].download(true, null, 'xlsx');

        const buffer = await capturedBlob.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const sheet = workbook.worksheets[0];

        expect(sheet.getCell('B2').value).to.eq(PHOTO_URL);
        expect(workbook.model.media.length).to.eq(0);
    });

    it('keeps the raw base64/URL value as plain text in the CSV export', async () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [2, 1],
                    data: [['John', AVATAR]],
                    columns: [
                        { type: 'text', title: 'Name' },
                        { type: 'image', title: 'Photo' },
                    ],
                    worksheetName: 'Sheet1',
                },
            ],
        });

        instance[0].download(true, null, 'csv');

        const csv = await capturedBlob.text();

        expect(csv).to.include(AVATAR);
    });
});
