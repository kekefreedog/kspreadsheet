import { copy } from "./copyPaste.js";
import * as XLSX from "xlsx";

export const download = function(includeHeaders, processed, type = "csv") {
    const obj = this;

    if (obj.parent.config.allowExport === false) {
        console.error("Export not allowed");
        return;
    }

    if (type === "xlsx") {

        // Get headers
        let headers = this.getHeaders(true);

        // Get data
        let values = this.getData(false, false, "", true);

        // Example: `values` is your input (array of { "0": ..., "1": ..., ... })
        const rows = values.map(row =>
            headers.map((_, colIndex) => row[colIndex.toString()] ?? '')
        );

        // Add headers as the first row
        const dataWithHeaders = [headers, ...rows];

        // Create worksheet & workbook
        const worksheet = XLSX.utils.aoa_to_sheet(dataWithHeaders);

        // New book
        const workbook = XLSX.utils.book_new();

        // Add sheetname
        XLSX.utils.book_append_sheet(workbook, worksheet, this.worksheetName ? this.worksheetName : 'Sheet1');

        // Generate XLSX file in browser and trigger download
        const workbookBlob = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

        // Blob
        const blob = new Blob([workbookBlob], { type: 'application/octet-stream' });

        // Create Url
        const url = URL.createObjectURL(blob);

        // Create a
        const a = document.createElement('a');

        // Set url
        a.href = url;

        // Set name
        a.download = 
            (
                obj.options.csvFileName ||
                obj.options.worksheetName ||
                "export"
            )+
            ".xlsx"
        ;

        // Virtual click
        a.click();

        // Revoke
        URL.revokeObjectURL(url);

    } else {

        // Get raw data string
        const rawData = copy.call(
            obj,
            false,
            obj.options.csvDelimiter,
            true,
            includeHeaders,
            true,
            undefined,
            processed
        );

        // CSV fallback
        const blob = new Blob(["\uFEFF" + rawData], {
            type: "text/csv;charset=utf-8;",
        });

        if (window.navigator && window.navigator.msSaveOrOpenBlob) {
            window.navigator.msSaveOrOpenBlob(
                blob,
                (obj.options.csvFileName ||
                    obj.options.worksheetName ||
                    "export") + ".csv"
            );
        } else {
            const pom = document.createElement("a");
            const url = URL.createObjectURL(blob);
            pom.href = url;
            pom.setAttribute(
                "download",
                (obj.options.csvFileName ||
                    obj.options.worksheetName ||
                    "export") + ".csv"
            );
            document.body.appendChild(pom);
            pom.click();
            pom.parentNode.removeChild(pom);
        }
    }
};
