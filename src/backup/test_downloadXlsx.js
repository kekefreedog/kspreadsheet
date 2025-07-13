import jspreadsheet from './index.js';

import './jspreadsheet.css';
import 'jsuites/dist/jsuites.css';

window.jss = jspreadsheet;

window.instance = jspreadsheet(root, {
    tabs: true,
    toolbar: true,
    worksheets: [{
        minDimensions: [10,20],
        worksheetName: "Sulivan",
        columns: [
        /* Nom */
        {
            type: "text", 
            name: "full_name",
            title: "Nom", 
            width: 120
        },
        /* Blank */
        {
            type: "text", 
            name: "",
            title: " ", 
            width: 20
        },
        /* Date debut */
        {
            type: "text", 
            name: "start_date",
            title: "Date", 
            width: 120
        },
        /* Projet */
        {
            type: "text", 
            name: "project_name",
            title: "Projet", 
            width: 120
        },
        /* Blank */
        {
            type: "text", 
            name: "",
            title: " ", 
            width: 20
        },
        /* Blank */
        {
            type: "text", 
            name: "",
            title: " ", 
            width: 20
        },
        /* Task */
        {
            type: "text", 
            name: "task_name",
            title: "Tache", 
            width: 120
        },
        /* Temps passé */
        {
            type: "numeric", 
            name: "spend_hours",
            title: "Temps passé", 
            width: 120
        },
        /* Contrat */
        {
            type: "text", 
            name: "contract_name",
            title: "Contrat", 
            width: 120
        },
        /* Salaire HC */
        {
            type: "numeric", 
            name: "salary_ht",
            title: "Salaire (HC)", 
            width: 120,
            mask:'#.##,00',
        },
        /* Salaire TTC */
        {
            type: "numeric", 
            name: "salary_ttc",
            title: "Salaire Chargé", 
            width: 120,
            mask:'#.##,00',
        },
        /* Note */
        {
            type: "text", 
            name: "note",
            title: "Note", 
            width: 120
        },
    ]
    }],
})


let worksheets = window.instance;

let downloadEl = document.createElement("button");

downloadEl.innerText = "Download XLSX";

downloadEl.addEventListener("click", () => {

    for(let worksheet of worksheets) 
        
        console.log(worksheet.download(true, null, "xlsx"));

})

document.body.append(downloadEl);