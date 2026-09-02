import { copy } from './copyPaste.js';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

const IMAGE_DATA_URI_PATTERN = /^data:image\/([a-z0-9.+-]+);base64,(.*)$/i;
const IMAGE_URL_PATTERN = /^(https?:)?\/\//i;

const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'jpeg', 'gif'];

const normalizeImageExtension = function (extension) {
    extension = ('' + extension).toLowerCase();
    if (extension === 'jpg') {
        extension = 'jpeg';
    }
    return SUPPORTED_IMAGE_EXTENSIONS.includes(extension) ? extension : 'png';
};

const base64ToArrayBuffer = function (base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
};

/**
 * Resolve an `image` column cell value into a buffer ExcelJS can embed.
 *
 * - data:image URIs are decoded directly (already in memory, no network round trip).
 * - http(s)/protocol-relative URLs are fetched. If the fetch fails (network error, CORS,
 *   404...) this resolves to null so the caller falls back to writing the raw URL as text.
 *
 * @return {Promise<{buffer: ArrayBuffer, extension: string}|null>}
 */
const resolveImageBuffer = async function (value) {
    value = '' + value;

    const dataUriMatch = value.match(IMAGE_DATA_URI_PATTERN);
    if (dataUriMatch) {
        try {
            return {
                buffer: base64ToArrayBuffer(dataUriMatch[2]),
                extension: normalizeImageExtension(dataUriMatch[1]),
            };
        } catch (e) {
            return null;
        }
    }

    if (IMAGE_URL_PATTERN.test(value)) {
        try {
            const response = await fetch(value);
            if (!response.ok) {
                return null;
            }
            const contentType = response.headers.get('content-type') || '';
            const contentTypeMatch = contentType.match(/image\/([a-z0-9.+-]+)/i);
            const buffer = await response.arrayBuffer();
            return {
                buffer,
                extension: normalizeImageExtension(contentTypeMatch ? contentTypeMatch[1] : 'png'),
            };
        } catch (e) {
            // Network error / CORS block: fall back to the raw URL as text
            return null;
        }
    }

    return null;
};

// Convert a pixel width (as used by kspreadsheet column.width) to Excel's character-based
// column width unit (~7px per character at the default font size).
const pxToColumnWidth = function (px) {
    return Math.max(1, Math.round(((px - 5) / 7) * 100) / 100);
};

// Convert a pixel height (as used by kspreadsheet row height) to Excel's point-based row height.
const pxToPoints = function (px) {
    return Math.round(px * 0.75 * 100) / 100;
};

const getRowHeightPx = function (obj, y) {
    const styleHeight = obj.rows && obj.rows[y] && obj.rows[y].element.style.height;
    if (styleHeight) {
        return parseInt(styleHeight);
    }
    if (obj.options.rows && obj.options.rows[y] && obj.options.rows[y].height) {
        return parseInt(obj.options.rows[y].height);
    }
    return obj.options.defaultRowHeight || 20;
};

/**
 * Build the XLSX workbook buffer, embedding actual images for `image` type columns
 * (data:image cells are decoded directly, URL cells are fetched at export time). When a value
 * cannot be turned into an image (fetch failure, unsupported value...) the raw value is kept
 * as plain text instead. Exported (in addition to `download`) so it can be tested/reused
 * without touching the DOM (Blob/anchor/URL.createObjectURL).
 *
 * @return {Promise<ArrayBuffer>}
 */
export const buildXlsxBuffer = async function (obj) {
    // Get headers
    const headers = obj.getHeaders(true);

    const values = obj.getData(false, false, '', true);

    // Map values to rows using header indices
    const rows = values.map((row) => headers.map((_, colIndex) => row[colIndex.toString()] ?? ''));

    // Create workbook & worksheet
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(obj.worksheetName ? obj.worksheetName : 'Sheet1');

    sheet.addRow(headers);
    for (const row of rows) {
        sheet.addRow(row);
    }

    // Preserve configured column widths
    if (obj.options.columns && obj.options.columns.length > 0) {
        sheet.columns = obj.options.columns.map((column) => ({
            width: pxToColumnWidth(parseInt(column && column.width !== undefined ? column.width : obj.options.defaultColWidth || 100)),
        }));
    }

    // Embed images for `image` type columns (row 1 is the header row)
    if (obj.options.columns) {
        for (let colIndex = 0; colIndex < obj.options.columns.length; colIndex++) {
            const column = obj.options.columns[colIndex];
            if (!column || column.type !== 'image') {
                continue;
            }

            for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                const value = rows[rowIndex][colIndex];
                if (!value) {
                    continue;
                }

                const image = await resolveImageBuffer(value);
                if (!image) {
                    // Could not embed (not an image source, or the fetch failed): keep the
                    // raw value (URL / text) that addRow already wrote into the cell.
                    continue;
                }

                const excelRow = rowIndex + 2;

                // Replace the raw value (URL / base64 text) with the actual embedded image
                sheet.getRow(excelRow).getCell(colIndex + 1).value = '';
                sheet.getRow(excelRow).height = pxToPoints(getRowHeightPx(obj, rowIndex));

                const imageId = workbook.addImage({ buffer: image.buffer, extension: image.extension });

                sheet.addImage(imageId, {
                    tl: { col: colIndex, row: excelRow - 1 },
                    br: { col: colIndex + 1, row: excelRow },
                    editAs: 'oneCell',
                });
            }
        }
    }

    return workbook.xlsx.writeBuffer();
};

/**
 * Build and trigger the browser download of the XLSX file.
 */
const downloadXlsx = async function (obj) {
    const buffer = await buildXlsxBuffer(obj);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (obj.options.csvFileName || obj.options.worksheetName || 'export') + '.xlsx';
    a.click();
    URL.revokeObjectURL(url);
};

/**
 * Download CSV or XLSX table
 *
 * @return Promise<void> for xlsx (image embedding may need to fetch remote URLs), void for csv
 */
export const download = function (includeHeaders, processed, type = 'csv') {
    const obj = this;

    if (obj.parent.config.allowExport == false) {
        console.error('Export not allowed');
        return;
    }

    if (type === 'xlsx') {
        return downloadXlsx(obj);
    } else {
        // Data
        let data = '';

        // Get data
        data += copy.call(obj, false, obj.options.csvDelimiter, true, includeHeaders, true, undefined, processed);

        // Download element
        const blob = new Blob(['﻿' + data], { type: 'text/csv;charset=utf-8;' });

        // IE Compatibility
        if (window.navigator && window.navigator.msSaveOrOpenBlob) {
            window.navigator.msSaveOrOpenBlob(blob, (obj.options.csvFileName || obj.options.worksheetName || 'export') + '.csv');
        } else {
            // Download element
            const pom = document.createElement('a');
            pom.setAttribute('target', '_top');
            const url = URL.createObjectURL(blob);
            pom.href = url;
            pom.setAttribute('download', (obj.options.csvFileName || obj.options.worksheetName || 'export') + '.csv');
            document.body.appendChild(pom);
            pom.click();
            pom.parentNode.removeChild(pom);
        }
    }
};
