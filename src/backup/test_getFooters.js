import jspreadsheet from './index.js';

import './jspreadsheet.css';
import 'jsuites/dist/jsuites.css';

window.jss = jspreadsheet;

window.instance = jspreadsheet(root, {
    tabs: true,
    toolbar: true,
    worksheets: [{
        data: [
            ['Cheese', 10, 6.00],
            ['Apples', 5, 4.00],
            ['Carrots', 5, 1.00],
            ['Oranges', 6, 2.00],
        ],
        footers: [
            [
                'Total',
                '=SUM(B1:B4)',
                '=SUM(C1:C4)',
            ],
            [
                'Total',
                '=SUM(B1:B4)',
                '=SUM(C1:C4)',
            ]
        ],
        columns: [
            { width:'400px' },
        ]
    }]
})

let worksheets = window.instance;

let getFooterEl = document.createElement("button");

getFooterEl.innerText = "Get Footers";

getFooterEl.addEventListener("click", () => {

    for(let worksheet of worksheets) 
        
        console.log(worksheet.getFooters());

})

document.body.append(getFooterEl);