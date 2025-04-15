import jspreadsheet from './index.js';

import './jspreadsheet.css';
import 'jsuites/dist/jsuites.css';

window.jss = jspreadsheet;

window.instance = jspreadsheet(root, {
    tabs: true,
    toolbar: true,
    worksheets: [{
        minDimensions: [10,20],
    }],
    // Intercept the new worksheet and define the options for the new worksheet
    onbeforecreateworksheet: function(config, index) {
        return {
            minDimensions: [5, 2],
            worksheetName: 'Albums ' + index
        }
    },
    // When you open the worksheet
    oncreateworksheet: function(element, instance, worksheetNumber) {
        console.log(element, instance, worksheetNumber);
    },
})

let worksheets = window.instance;

let createTabEl = document.createElement("button");

createTabEl.innerText = "Create Tab";

createTabEl.addEventListener("click", () => {

    worksheets[0].createWorksheet({
        worksheetName: 'Albums New'
    });

})

document.body.append(createTabEl);

