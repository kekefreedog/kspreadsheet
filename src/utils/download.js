import { copy } from "./copyPaste.js";
import * as XLSX from "xlsx";

export const download = function(includeHeaders, processed, type = "csv") {
    const obj = this;

    if (obj.parent.config.allowExport === false) {
        console.error("Export not allowed");
        return;
    }

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

    if (type === "xlsx") {
        const delimiter = obj.options.csvDelimiter || "\t";
        const columnTypes = obj.options.columns?.map(col => col.type) || [];

        // Format number as string with comma and 2 decimals
        function formatWithCommaDecimals(value) {
            const num = Number(value);
            if (isNaN(num)) return value;
            return num.toFixed(2).replace(".", ","); // e.g. 4.454342 → "4,45"
        }

        const rawRows = rawData
            .split("\r\n")
            .filter(row => row.trim().length > 0) // remove empty rows
            .map(row =>
                row.split(delimiter).map(cell =>
                    cell.replace(/^"|"$/g, "").replace(/""/g, '"')
                )
            );

        // Get consistent row length from header
        const maxLength = Math.max(...rawRows.map(r => r.length));

        const sheet = {};
        const range = { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } };

        rawRows.forEach((row, rowIndex) => {
            row.forEach((cell, colIndex) => {
                const isHeader = includeHeaders && rowIndex === 0;
                const colType = columnTypes[colIndex];
                const isNumericCol =
                    colType === "number" ||
                    colType === "numeric" ||
                    colType === "decimal";

                // Apply formatting only on numeric data (not header)
                const value =
                    !isHeader && isNumericCol
                        ? formatWithCommaDecimals(cell)
                        : cell;

                const cellRef = XLSX.utils.encode_cell({
                    r: rowIndex,
                    c: colIndex,
                });

                sheet[cellRef] = {
                    t: "s",   // Force string type
                    v: value, // Final formatted value
                    z: "@"    // Excel 'Text' cell format
                };

                if (range.e.r < rowIndex) range.e.r = rowIndex;
                if (range.e.c < colIndex) range.e.c = colIndex;
            });

            // Ensure no padding columns are added
            while (row.length < maxLength) {
                row.push("");
            }
        });

        sheet["!ref"] = XLSX.utils.encode_range(range);

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, sheet, obj.options.worksheetName || "Sheet1");

        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "binary" });

        function s2ab(s) {
            const buf = new ArrayBuffer(s.length);
            const view = new Uint8Array(buf);
            for (let i = 0; i < s.length; i++) {
                view[i] = s.charCodeAt(i) & 0xff;
            }
            return buf;
        }

        const blob = new Blob([s2ab(wbout)], {
            type: "application/octet-stream",
        });

        const pom = document.createElement("a");
        const url = URL.createObjectURL(blob);
        pom.href = url;
        pom.setAttribute(
            "download",
            (obj.options.csvFileName || obj.options.worksheetName || "export") + ".xlsx"
        );
        document.body.appendChild(pom);
        pom.click();
        pom.parentNode.removeChild(pom);
    } else {
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
