import jspreadsheet from './index.js';

import './jspreadsheet.css';
import 'jsuites/dist/jsuites.css';

window.jss = jspreadsheet;

let records = [
    {
        x: 0,
        y: 0,
        value: 'update A1',
    },
    {
        x: 3,
        y: 3,
        value: 'Another cell',
    }
];

window.instance = jspreadsheet(root, {
    tabs: true,
    toolbar: true,
    worksheets: [{
        minDimensions: [10,20],
        footers: [
            [
                'Total',
                '=SUM(B1:B4)',
                '=SUM(C1:C4)',
            ],
        ],
    }],
})

let worksheets = window.instance;

let pushValueEl = document.createElement("button");

pushValueEl.innerText = "Push Value";

pushValueEl.addEventListener("click", () => {

    for(let worksheet of worksheets) 

        worksheet.setValue(records);

})

document.body.append(pushValueEl);

