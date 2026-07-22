import { copy } from './copyPaste.js';
import * as XLSX from 'xlsx';

/**
 * Download CSV or XLSX table
 *
 * @return null
 */
export const download = function (includeHeaders, processed, type = 'csv') {
    const obj = this;

    if (obj.parent.config.allowExport == false) {
        console.error('Export not allowed');
        return;
    }

    if (type === 'xlsx') {
        // Get headers
        const headers = this.getHeaders(true);

        const values = this.getData(false, false, '', true);

        // Map values to rows using header indices
        const rows = values.map((row) => headers.map((_, colIndex) => row[colIndex.toString()] ?? ''));

        // Add headers as the first row
        const dataWithHeaders = [headers, ...rows];

        // Create worksheet & workbook
        const worksheet = XLSX.utils.aoa_to_sheet(dataWithHeaders);

        // Preserve configured column widths (pixels map directly to SheetJS's `wpx`)
        if (obj.options.columns && obj.options.columns.length > 0) {
            worksheet['!cols'] = obj.options.columns.map((column) => ({
                wpx: parseInt(column && column.width !== undefined ? column.width : obj.options.defaultColWidth || 100),
            }));
        }

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, this.worksheetName ? this.worksheetName : 'Sheet1');

        // Generate XLSX file in browser and trigger download
        const workbookBlob = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([workbookBlob], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (obj.options.csvFileName || obj.options.worksheetName || 'export') + '.xlsx';
        a.click();
        URL.revokeObjectURL(url);
    } else {
        // Data
        let data = '';

        // Get data
        data += copy.call(obj, false, obj.options.csvDelimiter, true, includeHeaders, true, undefined, processed);

        // Download element
        const blob = new Blob(['\uFEFF' + data], { type: 'text/csv;charset=utf-8;' });

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
