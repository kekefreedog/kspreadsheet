import { parseValue } from "./internal.js";

export const setFooter = function(data) {
    const obj = this;

    const footerLength = Array.isArray(obj.options.footers) 
        ? (Math.max(obj.options.footers.length, data?.length ?? 0))
        : (data?.length ?? 0)
    ;


    if (data) {
        obj.options.footers = data;
    }

    if (obj.options.footers) {
        if (! obj.tfoot) {
            obj.tfoot = document.createElement('tfoot');
            obj.table.appendChild(obj.tfoot);
        }

        // for (let j = 0; j < obj.options.footers.length; j++) {
        for (let j = 0; j < footerLength; j++) {

            let tr;

            if (obj.tfoot.children[j]) {

                // Check if tr to delete
                if((data.length - 1) < j){

                    // Delete rfoot
                    obj.tfoot.children[j].remove();

                    // Continue iteration
                    continue;

                }else{

                    tr = obj.tfoot.children[j];

                }

            } else {
                tr = document.createElement('tr');
                const td = document.createElement('td');
                tr.appendChild(td);
                obj.tfoot.appendChild(tr);
            }
            for (let i = 0; i < obj.headers.length; i++) {
                if (! obj.options.footers[j][i]) {
                    obj.options.footers[j][i] = '';
                }

                let td;

                if (obj.tfoot.children[j].children[i+1]) {
                    td = obj.tfoot.children[j].children[i+1];
                } else {
                    td = document.createElement('td');
                    tr.appendChild(td);

                    // Text align
                    const colAlign = obj.options.columns[i].align || obj.options.defaultColAlign || 'center';
                    td.style.textAlign = colAlign;
                }
                td.textContent = parseValue.call(obj, +obj.records.length + i, j, obj.options.footers[j][i]);

                // Hide/Show with hideColumn()/showColumn()
                td.style.display = obj.cols[i].colElement.style.display;
            }
        }
    }
}

export const getFooters = function(data) {

    // Set result
    let result = [];

    // Get footer td
    let footerEls = this.element.querySelectorAll("tfoot tr");

    // Iterations footers el
    if(footerEls.length) for(let footerEl of footerEls) if(footerEl){

        // Get all td
        let tdEls = footerEl.querySelectorAll("td");

        // Set index
        let i = 0;

        // Row
        let row = {};

        // Iteration td els
        if(tdEls.length) for(let tdEl of tdEls) if(tdEl) {

            // Push to row
            row[i] = tdEl.innerText ? tdEl.innerText : '';

            // Increment i
            i++;

        }

        // Push row into result
        result.push(row);

    }

    // Return result
    return result;

}