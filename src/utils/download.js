import { copy } from "./copyPaste.js";
import * as XLSX from "xlsx";

export const download = function(includeHeaders, processed, type = "csv") {
    const obj = this;

    if (obj.parent.config.allowExport === false) {
        console.error("Export not allowed");
        return;
    }

    // Get raw data string
    const rawData = copy.call(obj, false, obj.options.csvDelimiter, true, includeHeaders, true, undefined, processed);

    if (type === "xlsx") {
        
        const delimiter = obj.options.csvDelimiter || "\t";

        let rows = rawData.split("\r\n").map(row =>
            row.split(delimiter).map(cell => {
                const cleaned = cell.replace(/^"|"$/g, "").replace(/""/g, '"');

                // Replace dot with comma only for decimal numbers (e.g. 123.45)
                const isDecimal = /^-?\d+\.\d+$/.test(cleaned);
                return isDecimal ? cleaned.replace(".", ",") : cleaned;
            })
        );

        // Normalize all rows to same length
        const maxLength = Math.max(...rows.map(r => r.length));
        rows.forEach(r => {
            while (r.length < maxLength) r.push("");
        });

        // Build worksheet & workbook
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, obj.options.worksheetName || "Sheet1");

        // Convert to binary string
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "binary" });

        // Binary string to Blob
        function s2ab(s) {
            const buf = new ArrayBuffer(s.length);
            const view = new Uint8Array(buf);
            for (let i = 0; i < s.length; i++) {
                view[i] = s.charCodeAt(i) & 0xff;
            }
            return buf;
        }

        const blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });

        // Trigger download
        const pom = document.createElement("a");
        const url = URL.createObjectURL(blob);
        pom.href = url;
        pom.setAttribute("download", (obj.options.csvFileName || obj.options.worksheetName || "export") + ".xlsx");
        document.body.appendChild(pom);
        pom.click();
        pom.parentNode.removeChild(pom);
    } else {
        // Default to CSV
        const blob = new Blob(["\uFEFF" + rawData], { type: "text/csv;charset=utf-8;" });

        if (window.navigator && window.navigator.msSaveOrOpenBlob) {
            window.navigator.msSaveOrOpenBlob(blob, (obj.options.csvFileName || obj.options.worksheetName || "export") + ".csv");
        } else {
            const pom = document.createElement("a");
            const url = URL.createObjectURL(blob);
            pom.href = url;
            pom.setAttribute("download", (obj.options.csvFileName || obj.options.worksheetName || "export") + ".csv");
            document.body.appendChild(pom);
            pom.click();
            pom.parentNode.removeChild(pom);
        }
    }
};
