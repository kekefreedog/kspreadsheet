import jspreadsheet from './index.js';

import './jspreadsheet.css';
import 'jsuites/dist/jsuites.css';

window.jss = jspreadsheet;

let footers = [
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
];

let footersNew = [
    [
        'Tonton',
        '=SUM(B1:B4)&"%"',
        '=SUM(C1:C4)&"%"',
    ],
];

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
        data: [
            ['Cheese', 10, 6.00],
            ['Apples', 5, 4.00],
            ['Carrots', 5, 1.00],
            ['Oranges', 6, 2.00],
        ],
        footers: footers,
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

let setFooterEl = document.createElement("button");

setFooterEl.innerText = "Set Footer";

setFooterEl.addEventListener("click", () => {

    for(let worksheet of worksheets) 
        
        worksheet.setFooter(footersNew);

})
let resetFooterEl = document.createElement("button");

resetFooterEl.innerText = "Reset Footer";

resetFooterEl.addEventListener("click", () => {

    for(let worksheet of worksheets) 
        
        worksheet.setFooter(footers);

})

let pushValueEl = document.createElement("button");

pushValueEl.innerText = "Push Value";

pushValueEl.addEventListener("click", () => {

    for(let worksheet of worksheets) 

        worksheet.setValue(records);

})

document.body.append(getFooterEl, setFooterEl, resetFooterEl, pushValueEl);