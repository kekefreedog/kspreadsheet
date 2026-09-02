import jspreadsheet from './index.js';

import './jspreadsheet.css';
import 'jsuites/dist/jsuites.css';

window.jss = jspreadsheet;

/**
 * Manual QA harness.
 *
 * Cycles through a fixed list of scenarios (ported from src/backup/*.js, plus a couple of
 * regression checks for recent fixes). For each scenario you visually inspect the app and
 * click Yes/No; "No" requires a comment. Results persist in localStorage (survives refresh)
 * and can be exported as JSON/Markdown at the end.
 */

const STORAGE_KEY = 'kspreadsheet_manual_qa_v13_imagetype';

const root = document.getElementById('root');

// Container for scenario-specific extra buttons (download/footer/zoom controls),
// kept separate from `root` so it's easy to clear between scenarios.
const extra = document.createElement('div');
extra.id = 'qa-extra';
document.body.appendChild(extra);

const scenarios = [
    {
        name: 'REPRO: Planning offset (only 3 cols defined, data has 34)',
        check: 'Mirrors the Rodeo Planning grid EXACTLY: only 3 columns defined (People/Speciality/Location, widths 200/100/60, wordWrap), NO width on date cols, nestedHeaders colspan 3+27=30, minDimensions [30,100], then setData() with 34-column rows (31 date cols). Watch whether frozen body cells drift from the header.',
        render() {
            const columns = [
                { type: 'text', title: 'People', width: 200, wordWrap: true },
                { type: 'dropdown', title: 'Speciality', width: 100, wordWrap: true, multiple: true, source: ['BLANK', 'LIGHT', 'COMP', 'FX'] },
                { type: 'dropdown', title: 'Location', width: 60, wordWrap: true, source: ['🇨🇦', '🇫🇷', '🇺🇸'] },
            ];

            const inst = jspreadsheet(root, {
                worksheets: [
                    {
                        columns,
                        freezeColumns: 3,
                        lazyLoading: true,
                        tableOverflow: true,
                        minDimensions: [30, 100],
                        filters: false,
                        allowComments: true,
                        nestedHeaders: [
                            [{ colspan: 3 }, { title: '_', colspan: 27 }],
                            [
                                { title: ' Person Info', colspan: 3, align: 'center' },
                                { title: '_', colspan: 27 },
                            ],
                        ],
                    },
                ],
            });

            // Emulate the app's refresh: setData with full-grid rows that have MORE columns (34) than defined (3)
            const specialities = ['BLANK', 'LIGHT', 'COMP', 'FX'];
            const projects = ['Not Available', 'kv2b', 'Vacations', 'cc5', 'v2b'];
            const data = [];
            for (let r = 0; r < 40; r++) {
                const row = ['Person ' + (r + 1), specialities[r % specialities.length], '🇫🇷'];
                for (let c = 0; c < 31; c++) row.push(projects[(r + c) % projects.length]);
                data.push(row);
            }
            inst[0].setData(data);

            return inst;
        },
    },
    {
        name: 'Basic grid + tabs/toolbar',
        check: 'A blank 10x20 grid appears with a toolbar on top and a worksheet tab at the bottom. Click a few cells and type text; normal editing should work.',
        render() {
            return jspreadsheet(root, {
                tabs: true,
                toolbar: true,
                worksheets: [{ minDimensions: [10, 20] }],
            });
        },
    },
    {
        name: 'Ctrl/Cmd + Arrow: jump to data edge (NEW)',
        check: "A grid with column A having data in rows 1-3, blank rows 4-5, then data again in rows 6-8; column C has data in rows 1-2 only. Click A1, then press Ctrl+Down (or Cmd+Down on Mac) repeatedly — it should jump: A1→A3 (end of first block), A3→A6 (skip the blank gap), A6→A8 (end of sheet's data), then stay at A8. Also try Ctrl+Up to reverse, and Ctrl+Right/Left on row 1 (A1 has data, B1 blank, C1 has data, D1/E1 blank) — Ctrl+Right should jump A1→C1→E1 (edge). Plain arrow keys (no Ctrl/Cmd) must still move one cell at a time as before. Also confirm Home/End keys (no Ctrl) still jump to column 0 / last column unconditionally (not data-aware).",
        render() {
            return jspreadsheet(root, {
                worksheets: [
                    {
                        minDimensions: [5, 8],
                        data: [
                            [1, '', 1, '', ''],
                            [1, '', 1, '', ''],
                            [1, '', '', '', ''],
                            ['', '', '', '', ''],
                            ['', '', '', '', ''],
                            [1, '', '', '', ''],
                            [1, '', '', '', ''],
                            [1, '', '', '', ''],
                        ],
                    },
                ],
            });
        },
    },
    {
        name: 'Data + merged cell + calendar column',
        check: 'A 4-row car table appears. Row 1, columns B-C are merged into one cell. Double-click a cell in column "Date" — a calendar picker should open.',
        render() {
            const data = [
                ['Mazda', 2001, 2000, '2006-01-01'],
                ['Pegeout', 2010, 5000, '2005-01-01'],
                ['Honda Fit', 2009, 3000, '2004-01-01'],
                ['Honda CRV', 2010, 6000, '2003-01-01'],
            ];
            return jspreadsheet(root, {
                worksheets: [
                    {
                        data,
                        colHeaders: ['Model', 'Year', 'Price', 'Date'],
                        colWidths: [300, 80, 100, 100],
                        columns: [{ type: 'text' }, { type: 'text' }, { type: 'text' }, { type: 'calendar' }],
                        mergeCells: { A1: [2, 1] },
                        minDimensions: [10, 10],
                    },
                ],
            });
        },
    },
    {
        name: 'Fill-handle drag preview (NEW: dashed border)',
        check: 'A small grid with numbers appears. Click cell A1, then drag the small black square at the bottom-right corner of the selection down/across several cells. While dragging, the destination range must show the SAME animated dashed marching-ants border as a copy-selection (Ctrl/Cmd+C) does — not a plain dotted line. Release the drag and confirm the values got filled/copied correctly, and the dashed border disappears afterward. Try dragging just one cell over (diagonal corner case) too.',
        render() {
            return jspreadsheet(root, {
                worksheets: [
                    {
                        data: [
                            [1, 2, 3, 4, 5],
                            [6, 7, 8, 9, 10],
                            [11, 12, 13, 14, 15],
                            [16, 17, 18, 19, 20],
                            [21, 22, 23, 24, 25],
                        ],
                        minDimensions: [8, 8],
                    },
                ],
            });
        },
    },
    {
        name: 'Fill-handle corner shape/radius config (NEW)',
        check: 'Four small grids side by side (or check the toolbar-less panels), each with a fill-handle corner at the bottom-right of a selection: 1) default (sharp square, tiny 7px box, no config), 2) cornerShape: "square" explicit (must look IDENTICAL to #1 — same sharp corners, same tiny size), 3) cornerRadius: 3 (rounded square, slightly bigger box so the rounding is visible, no white border), 4) cornerShape: "circle" (fully round dot, no white border). Click a cell in each to see its handle and confirm the shapes look right.',
        render() {
            const configs = [
                { label: 'default (square)', options: {} },
                { label: 'cornerShape: "square" explicit', options: { cornerShape: 'square' } },
                { label: 'cornerRadius: 3', options: { cornerRadius: 3 } },
                { label: 'cornerShape: circle', options: { cornerShape: 'circle' } },
            ];

            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.gap = '24px';
            root.appendChild(container);

            const instances = [];
            for (const config of configs) {
                const wrapper = document.createElement('div');
                const title = document.createElement('div');
                title.innerText = config.label;
                title.style.marginBottom = '4px';
                wrapper.appendChild(title);

                const mount = document.createElement('div');
                wrapper.appendChild(mount);
                container.appendChild(wrapper);

                instances.push(
                    jspreadsheet(mount, {
                        worksheets: [
                            {
                                data: [
                                    [1, 2, 3],
                                    [4, 5, 6],
                                    [7, 8, 9],
                                ],
                                minDimensions: [4, 4],
                                ...config.options,
                            },
                        ],
                    })
                );
            }

            return instances;
        },
    },
    {
        name: 'Freeze columns + filters + lazy loading (large grid)',
        check: 'A 200x200 grid, first 2 columns frozen (note: this scenario has NO tableHeight set, so there is no vertical scrolling at all — only horizontal). REGRESSION CHECK: scroll horizontally at varying speed (slow and fast/flick) — the frozen columns must stay rock solid, no shaking/lag relative to the header, and the row numbers (1, 2, 3...) must stay exactly at 1, 2, 3... the whole time — scrolling right must NEVER change which rows are displayed (there is nothing vertical to load here). Also try clicking a column filter icon in the header.',
        render() {
            return jspreadsheet(root, {
                worksheets: [
                    {
                        minDimensions: [200, 200],
                        tableOverflow: true,
                        lazyLoading: true,
                        tableWidth: '1000px',
                        freezeColumns: 2,
                        filters: true,
                    },
                ],
            });
        },
    },
    {
        name: 'Freeze columns + nested headers + copy selection',
        check: '40x20 grid, 2 frozen columns, two-level nested headers ("Supermarket information" spanning cols A-B). Select a range spanning frozen + non-frozen columns, copy it (Ctrl/Cmd+C) — the marching-ants copy outline should render correctly without covering the frozen columns oddly. NEW: the row-number column must stay visible/pinned during horizontal scroll, including in the nested-header corner. NEW: a footer row ("Total" + a SUM formula under column B) must appear at the bottom, aligned with its columns, and stay put (not scroll away) when scrolling horizontally.',
        render() {
            return jspreadsheet(root, {
                worksheets: [
                    {
                        minDimensions: [40, 20],
                        tableOverflow: true,
                        lazyLoading: true,
                        tableWidth: '1000px',
                        freezeColumns: 2,
                        filters: true,
                        nestedHeaders: [
                            [
                                { title: 'Supermarket information', colspan: '2' },
                                { title: ' Other Information', colspan: '38' },
                            ],
                            [
                                { title: 'Location', colspan: '1' },
                                { title: 'Location', colspan: '1' },
                                { title: 'Location', colspan: '3' },
                                { title: ' Other Information', colspan: '35' },
                            ],
                        ],
                        footers: [['Total', '=SUM(B1:B20)']],
                    },
                ],
            });
        },
    },
    {
        name: 'Freeze rows (NEW FEATURE)',
        check: 'A 40x300 grid with the first 3 rows frozen (pinned at the top, right below the header). Scroll down at varying speed (slow and fast/flick) — rows 1-3 must stay rock solid under the header, no shaking/lag. The row-number cells (1, 2, 3 on the left) must scroll/stick together with their row content, not separately. Try editing a cell in a frozen row too. REGRESSION CHECK (lazyLoading): scroll all the way down past row ~100-150 and back up several times — rows 1-3 must NEVER disappear or lose their frozen styling, no matter how far you scroll.',
        render() {
            return jspreadsheet(root, {
                worksheets: [
                    {
                        minDimensions: [40, 300],
                        tableOverflow: true,
                        tableHeight: '500px',
                        lazyLoading: true,
                        freezeRows: 3,
                    },
                ],
            });
        },
    },
    {
        name: 'Freeze rows + freeze columns together (NEW FEATURE: corner case)',
        check: 'A 40x300 grid with the first 2 rows AND first 2 columns frozen at once. The top-left 2x2 "corner" block must stay pinned in both directions while everything else scrolls both horizontally and vertically underneath it. REGRESSION CHECK (depth): scroll both horizontally and vertically — the corner block (rows 1-2, cols A-B) must always render ON TOP of everything scrolling underneath it, never hidden/covered. REGRESSION CHECK (lazyLoading): scroll down past row ~100-150 and back — the frozen rows must not disappear. REGRESSION CHECK (overlap): the row-number column (1, 2, 3...) must sit cleanly to the LEFT of column A — column A\'s content must not be hidden/covered behind the row-number column.',
        render() {
            return jspreadsheet(root, {
                worksheets: [
                    {
                        minDimensions: [40, 300],
                        tableOverflow: true,
                        tableHeight: '500px',
                        tableWidth: '1000px',
                        lazyLoading: true,
                        freezeRows: 2,
                        freezeColumns: 2,
                    },
                ],
            });
        },
    },
    {
        name: 'Create worksheet event (tabs)',
        check: 'A blank grid with tabs/toolbar appears, plus a "Create Tab" button below it. Click the button — a new tab named "Albums New" should be created (check the browser console log too).',
        render() {
            const instance = jspreadsheet(root, {
                tabs: true,
                toolbar: true,
                worksheets: [{ minDimensions: [10, 20] }],
                onbeforecreateworksheet: function (config, index) {
                    return { minDimensions: [5, 2], worksheetName: 'Albums ' + index };
                },
                oncreateworksheet: function (element, inst, worksheetNumber) {
                    console.log('oncreateworksheet', element, inst, worksheetNumber);
                },
            });

            const btn = document.createElement('button');
            btn.innerText = 'Create Tab';
            btn.addEventListener('click', () => {
                instance[0].createWorksheet({ worksheetName: 'Albums New' });
            });
            extra.appendChild(btn);

            return instance;
        },
    },
    {
        name: 'Default cell type: checkbox',
        check: 'A 10x10 grid appears where every cell renders as a checkbox. Check one cell, copy it, then paste it into another cell: the destination must also be checked. Then drag the fill handle from that checked cell horizontally AND vertically: every filled destination must stay checked. Repeat with an unchecked cell; copied and filled cells must stay unchecked.',
        render() {
            return jspreadsheet(root, {
                worksheets: [{ minDimensions: [10, 10], defaultCellType: 'checkbox' }],
            });
        },
    },
    {
        name: 'Image column type',
        check: 'Grid 1: column B is type "image". Row 1 red square (data:image), row 2 blue square (data:image), row 3 is "not-an-image" text (should render blank, no broken image icon). Click "Set image on row 3" — a real photo loaded from a plain https:// URL (picsum.photos) should appear, proving image columns accept regular image URLs, not just data:image. The image must sit flush against the cell border, no padding gap. Click "Download XLSX (Grid 1)" and open the file: rows 1-2 must show real embedded images (not base64 text), row 3 must show the plain text "not-an-image" (never an attempt at an image). Grid 2: three SQUARE cells (200x200), all fed a WIDE 400x200 landscape photo except "none" which gets a small 80x60 thumbnail (smaller than the cell, on purpose). "fit" (contain) must show the WHOLE landscape photo, letterboxed with pink showing above and below it. "fill" (cover) must show the photo zoomed in, filling the entire square with NO pink visible (it should look visibly more zoomed-in / cropped on the sides than "fit"). "none" must show the small thumbnail at its real tiny size, centered, with pink filling all the space around it. Confirm the three are visibly different from each other. Click "Download XLSX (Grid 2)" and open the file: each of the 3 columns should show a real embedded image (fit/fill both the wide photo, none the small thumbnail), not URL text.',
        render() {
            const RED = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJmAwEd1s0zAAAAAElFTkSuQmCC';
            const BLUE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR42mNk+M9Qz0AEYBxVSF+FABe6AwF7YSbaAAAAAElFTkSuQmCC';
            const PHOTO_URL = 'https://picsum.photos/seed/kspreadsheet/400/200';
            const THUMB_URL = 'https://picsum.photos/seed/kspreadsheet-thumb/80/60';

            const instance = jspreadsheet(root, {
                worksheets: [
                    {
                        minDimensions: [2, 3],
                        data: [
                            ['Row 1', RED],
                            ['Row 2', BLUE],
                            ['Row 3', 'not-an-image'],
                        ],
                        columns: [
                            { type: 'text', title: 'Label' },
                            { type: 'image', title: 'Image' },
                        ],
                    },
                ],
            });

            const setImageBtn = document.createElement('button');
            setImageBtn.innerText = 'Set image on row 3 (URL)';
            setImageBtn.addEventListener('click', () => {
                for (const worksheet of instance) worksheet.setValue('B3', PHOTO_URL);
            });
            extra.appendChild(setImageBtn);

            // Captured now (not read from `instance` in the click handler) since `instance` gets
            // the fit/fill/none demo worksheets appended to it further down.
            const grid1Worksheet = instance[0];

            const downloadBtn = document.createElement('button');
            downloadBtn.innerText = 'Download XLSX (Grid 1)';
            downloadBtn.addEventListener('click', () => {
                Promise.resolve(grid1Worksheet.download(true, null, 'xlsx')).then(() => console.log('xlsx download done'));
            });
            extra.appendChild(downloadBtn);

            // Second grid: square cells so a WIDE (400x200) photo lets 'fit' (contain) and
            // 'fill' (cover) diverge visibly, while 'none' gets a thumbnail SMALLER than the
            // cell so its "natural size, letterboxed by backgroundColor" behavior is obvious
            // instead of just showing a meaningless center-crop of an oversized photo.
            const fitTitle = document.createElement('div');
            fitTitle.innerText = 'fit / fill / none (with backgroundColor), image loaded from a URL';
            fitTitle.style.cssText = 'margin-top: 16px; margin-bottom: 4px;';
            extra.appendChild(fitTitle);

            const fitMount = document.createElement('div');
            extra.appendChild(fitMount);

            const fitInstance = jspreadsheet(fitMount, {
                worksheets: [
                    {
                        minDimensions: [3, 1],
                        defaultRowHeight: 200,
                        data: [[PHOTO_URL, PHOTO_URL, THUMB_URL]],
                        columns: [
                            { type: 'image', title: 'fit', width: 200, options: { fit: 'fit', backgroundColor: '#ffccf2' } },
                            { type: 'image', title: 'fill', width: 200, options: { fit: 'fill', backgroundColor: '#ffccf2' } },
                            { type: 'image', title: 'none', width: 200, options: { fit: 'none', backgroundColor: '#ffccf2' } },
                        ],
                    },
                ],
            });
            const downloadFitBtn = document.createElement('button');
            downloadFitBtn.innerText = 'Download XLSX (Grid 2)';
            downloadFitBtn.addEventListener('click', () => {
                Promise.resolve(fitInstance[0].download(true, null, 'xlsx')).then(() => console.log('xlsx download done'));
            });
            extra.appendChild(downloadFitBtn);

            instance.push(...fitInstance);

            return instance;
        },
    },
    {
        name: 'Download XLSX',
        check: 'A grid with named columns (Nom, Date, Projet, Tache, etc.) plus a "Photo" image column appears. Row 1\'s photo is a data:image (base64) avatar, row 2\'s is loaded from a plain https:// URL (picsum.photos). Click "Download XLSX" and open the file in Excel/Numbers/LibreOffice: BOTH photos must appear as real embedded images anchored in the Photo column (not as a giant base64 text blob, not as a bare URL string, no console errors). Also open the downloaded CSV (button below) and confirm the Photo column there just contains the raw base64/URL text (CSV keeps it as plain text, only XLSX embeds it).',
        render() {
            const AVATAR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJmAwEd1s0zAAAAAElFTkSuQmCC';
            const PHOTO_URL = 'https://picsum.photos/seed/kspreadsheet-xlsx/200/200';

            const instance = jspreadsheet(root, {
                tabs: true,
                toolbar: true,
                worksheets: [
                    {
                        minDimensions: [10, 20],
                        worksheetName: 'Sulivan',
                        data: [
                            ['John Doe', AVATAR],
                            ['Jane Doe', PHOTO_URL],
                        ],
                        columns: [
                            { type: 'text', name: 'full_name', title: 'Nom', width: 120 },
                            { type: 'image', name: 'photo', title: 'Photo', width: 80 },
                            { type: 'text', name: '', title: ' ', width: 20 },
                            { type: 'text', name: 'start_date', title: 'Date', width: 120 },
                            { type: 'text', name: 'project_name', title: 'Projet', width: 120 },
                            { type: 'text', name: '', title: ' ', width: 20 },
                            { type: 'text', name: '', title: ' ', width: 20 },
                            { type: 'text', name: 'task_name', title: 'Tache', width: 120 },
                            { type: 'numeric', name: 'spend_hours', title: 'Temps passé', width: 120 },
                            { type: 'text', name: 'contract_name', title: 'Contrat', width: 120 },
                            { type: 'numeric', name: 'salary_ht', title: 'Salaire (HC)', width: 120, mask: '#.##,00' },
                            { type: 'numeric', name: 'salary_ttc', title: 'Salaire Chargé', width: 120, mask: '#.##,00' },
                            { type: 'text', name: 'note', title: 'Note', width: 120 },
                        ],
                    },
                ],
            });

            const btn = document.createElement('button');
            btn.innerText = 'Download XLSX';
            btn.addEventListener('click', () => {
                for (const worksheet of instance) Promise.resolve(worksheet.download(true, null, 'xlsx')).then((r) => console.log('xlsx download done', r));
            });

            const csvBtn = document.createElement('button');
            csvBtn.innerText = 'Download CSV';
            csvBtn.addEventListener('click', () => {
                for (const worksheet of instance) worksheet.download(true, null, 'csv');
            });

            extra.append(btn, csvBtn);

            return instance;
        },
    },
    {
        name: 'Footer push value',
        check: 'A grid with a footer row showing SUM formulas appears, plus a "Push Value" button. Click it — cell A1 should become "update A1" and D4 "Another cell"; footer sums should update accordingly.',
        render() {
            const instance = jspreadsheet(root, {
                tabs: true,
                toolbar: true,
                worksheets: [{ minDimensions: [10, 20], footers: [['Total', '=SUM(B1:B4)', '=SUM(C1:C4)']] }],
            });

            const btn = document.createElement('button');
            btn.innerText = 'Push Value';
            btn.addEventListener('click', () => {
                for (const worksheet of instance)
                    worksheet.setValue([
                        { x: 0, y: 0, value: 'update A1' },
                        { x: 3, y: 3, value: 'Another cell' },
                    ]);
            });
            extra.appendChild(btn);

            return instance;
        },
    },
    {
        name: 'Get footers',
        check: 'A grocery-list grid with two footer rows (both SUM formulas) appears, plus a "Get Footers" button. Click it and check the browser console — it should log the two footer rows.',
        render() {
            const instance = jspreadsheet(root, {
                tabs: true,
                toolbar: true,
                worksheets: [
                    {
                        data: [
                            ['Cheese', 10, 6.0],
                            ['Apples', 5, 4.0],
                            ['Carrots', 5, 1.0],
                            ['Oranges', 6, 2.0],
                        ],
                        footers: [
                            ['Total', '=SUM(B1:B4)', '=SUM(C1:C4)'],
                            ['Total', '=SUM(B1:B4)', '=SUM(C1:C4)'],
                        ],
                        columns: [{ width: '400px' }],
                    },
                ],
            });

            const btn = document.createElement('button');
            btn.innerText = 'Get Footers';
            btn.addEventListener('click', () => {
                for (const worksheet of instance) console.log('getFooters()', worksheet.getFooters());
            });
            extra.appendChild(btn);

            return instance;
        },
    },
    {
        name: 'Multiple worksheets + nested headers',
        check: 'Three worksheets should be available (check the tabs/worksheet switcher): two small ones with nested headers ("Supermarket information" / "Supermarket information 2") and one large 200x20 grid. All three should render without console errors.',
        render() {
            return jspreadsheet(root, {
                worksheets: [
                    {
                        minDimensions: [40, 20],
                        tableOverflow: true,
                        lazyLoading: true,
                        tableWidth: '1000px',
                        freezeColumns: 2,
                        filters: true,
                        nestedHeaders: [
                            [
                                { title: 'Supermarket information', colspan: '2' },
                                { title: ' Other Information', colspan: '38' },
                            ],
                            [
                                { title: 'Location', colspan: '1' },
                                { title: 'Location', colspan: '1' },
                                { title: 'Location', colspan: '3' },
                                { title: ' Other Information', colspan: '35' },
                            ],
                        ],
                    },
                    {
                        minDimensions: [40, 20],
                        tableOverflow: true,
                        lazyLoading: true,
                        tableWidth: '1000px',
                        freezeColumns: 2,
                        filters: true,
                        nestedHeaders: [
                            [
                                { title: 'Supermarket information 2', colspan: '2' },
                                { title: ' Other Information', colspan: '38' },
                            ],
                            [
                                { title: 'Location', colspan: '1' },
                                { title: 'Location', colspan: '1' },
                                { title: 'Location', colspan: '3' },
                                { title: ' Other Information', colspan: '35' },
                            ],
                        ],
                    },
                    {
                        minDimensions: [200, 20],
                        tableOverflow: true,
                        lazyLoading: true,
                        tableWidth: '1000px',
                        freezeColumns: 2,
                        filters: true,
                    },
                ],
            });
        },
    },
    {
        name: 'Set footers / reset / push value',
        check: 'A grocery-list grid with a footer row and 3 extra buttons ("Get Footers", "Set Footer", "Reset Footer", "Push Value") appears. Click "Set Footer" — first column of the footer should say "Tonton". Click "Reset Footer" to restore it. Click "Push Value" to update A1/D4.',
        render() {
            const footers = [
                ['Total', '=SUM(B1:B4)', '=SUM(C1:C4)'],
                ['Total', '=SUM(B1:B4)', '=SUM(C1:C4)'],
            ];
            const footersNew = [['Tonton', '=SUM(B1:B4)&"%"', '=SUM(C1:C4)&"%"']];

            const instance = jspreadsheet(root, {
                tabs: true,
                toolbar: true,
                worksheets: [
                    {
                        data: [
                            ['Cheese', 10, 6.0],
                            ['Apples', 5, 4.0],
                            ['Carrots', 5, 1.0],
                            ['Oranges', 6, 2.0],
                        ],
                        footers,
                        columns: [{ width: '400px' }],
                    },
                ],
            });

            const getFooterEl = document.createElement('button');
            getFooterEl.innerText = 'Get Footers';
            getFooterEl.addEventListener('click', () => {
                for (const worksheet of instance) console.log('getFooters()', worksheet.getFooters());
            });

            const setFooterEl = document.createElement('button');
            setFooterEl.innerText = 'Set Footer';
            setFooterEl.addEventListener('click', () => {
                for (const worksheet of instance) worksheet.setFooter(footersNew);
            });

            const resetFooterEl = document.createElement('button');
            resetFooterEl.innerText = 'Reset Footer';
            resetFooterEl.addEventListener('click', () => {
                for (const worksheet of instance) worksheet.setFooter(footers);
            });

            const pushValueEl = document.createElement('button');
            pushValueEl.innerText = 'Push Value';
            pushValueEl.addEventListener('click', () => {
                for (const worksheet of instance)
                    worksheet.setValue([
                        { x: 0, y: 0, value: 'update A1' },
                        { x: 3, y: 3, value: 'Another cell' },
                    ]);
            });

            extra.append(getFooterEl, setFooterEl, resetFooterEl, pushValueEl);

            return instance;
        },
    },
    {
        name: 'Set headers (delayed)',
        check: 'A blank 10x10 grid appears. After ~1s, columns A/B/C headers should rename to "zero"/"one"/"two". After ~1.5s, the SAME rename should re-apply starting at column index 5 (columns F/G/H become "zero"/"one"/"two").',
        render() {
            const instance = jspreadsheet(root, { worksheets: [{ minDimensions: [10, 10] }] });

            setTimeout(() => {
                for (const worksheet of instance) worksheet.setHeaders({ 0: 'zero', 1: 'one', 2: 'two' });
            }, 1000);

            setTimeout(() => {
                for (const worksheet of instance) worksheet.setHeaders({ 0: 'zero', 1: 'one', 2: 'two' }, 5);
            }, 1500);

            return instance;
        },
    },
    {
        name: 'Zoom controls',
        check: 'A 6x6 grid appears already zoomed in (worksheet defaultZoom 125, overridden by top-level 150 — check which wins). Buttons: Zoom In/Out/Default/Get. Click each and confirm the grid visibly scales and "Get Zoom" logs a sane value to the console.',
        render() {
            const instance = jspreadsheet(root, {
                tabs: true,
                toolbar: true,
                worksheets: [{ minDimensions: [6, 6], defaultZoom: 125 }],
                defaultZoom: 150,
            });

            const zoomInEl = document.createElement('button');
            zoomInEl.innerText = 'Zoom In';
            zoomInEl.addEventListener('click', () => {
                for (const worksheet of instance) worksheet.zoomIn();
            });

            const zoomOutEl = document.createElement('button');
            zoomOutEl.innerText = 'Zoom Out';
            zoomOutEl.addEventListener('click', () => {
                for (const worksheet of instance) worksheet.zoomOut();
            });

            const zoomDefault = document.createElement('button');
            zoomDefault.innerText = 'Zoom Default';
            zoomDefault.addEventListener('click', () => {
                for (const worksheet of instance) worksheet.resetZoom();
            });

            const zoomGet = document.createElement('button');
            zoomGet.innerText = 'Get Zoom';
            zoomGet.addEventListener('click', () => {
                for (const worksheet of instance) console.log('getZoom()', worksheet.getZoom());
            });

            extra.append(zoomInEl, zoomOutEl, zoomDefault, zoomGet);

            return instance;
        },
    },
    {
        name: 'Search controls',
        check: 'The grid initially shows all four rows. Click Search apples: only the two matching rows remain and the status reads "apple". Type a different query in the built-in Search field, then click Get Search: the status and console must show exactly what you typed. Click Reset Search: all rows return and the status becomes an empty string.',
        render() {
            const instance = jspreadsheet(root, {
                worksheets: [
                    {
                        search: true,
                        data: [
                            ['Apple', 'Fruit'],
                            ['Banana', 'Fruit'],
                            ['Green apple', 'Fruit'],
                            ['Carrot', 'Vegetable'],
                        ],
                        columns: [{ title: 'Item' }, { title: 'Category' }],
                    },
                ],
            });

            const searchEl = document.createElement('button');
            searchEl.innerText = 'Search apples';
            searchEl.addEventListener('click', () => {
                for (const worksheet of instance) worksheet.search('apple');
                statusEl.textContent = `getSearch(): "${instance[0].getSearch()}"`;
            });

            const getSearchEl = document.createElement('button');
            getSearchEl.innerText = 'Get Search';
            getSearchEl.addEventListener('click', () => {
                const query = instance[0].getSearch();
                console.log('getSearch()', query);
                statusEl.textContent = `getSearch(): "${query}"`;
            });

            const resetSearchEl = document.createElement('button');
            resetSearchEl.innerText = 'Reset Search';
            resetSearchEl.addEventListener('click', () => {
                for (const worksheet of instance) worksheet.resetSearch();
                statusEl.textContent = `getSearch(): "${instance[0].getSearch()}"`;
            });

            const statusEl = document.createElement('output');
            statusEl.textContent = 'getSearch(): ""';
            extra.append(searchEl, getSearchEl, resetSearchEl, statusEl);

            return instance;
        },
    },
    {
        name: 'Zoom + freeze columns + nested headers (REGRESSION: load flash)',
        check: 'REGRESSION CHECK: reload this exact test (use the "Reload this test" button) several times and watch closely the instant the grid appears — it must NOT flash scrolled-down-then-snap-to-top. It should render already settled at the top, with 2 frozen columns and nested headers, zoomed to 150%. Also try the Zoom In/Out/Default/Get buttons.',
        render() {
            const instance = jspreadsheet(root, {
                tabs: true,
                toolbar: true,
                worksheets: [
                    {
                        minDimensions: [40, 20],
                        tableOverflow: true,
                        lazyLoading: true,
                        tableWidth: '1000px',
                        freezeColumns: 2,
                        filters: true,
                        nestedHeaders: [
                            [
                                { title: 'Supermarket information', colspan: '2' },
                                { title: ' Other Information', colspan: '38' },
                            ],
                            [
                                { title: 'Location', colspan: '1' },
                                { title: 'Location', colspan: '1' },
                                { title: 'Location', colspan: '3' },
                                { title: ' Other Information', colspan: '35' },
                            ],
                        ],
                        defaultZoom: 100,
                    },
                ],
                defaultZoom: 150,
            });

            const zoomInEl = document.createElement('button');
            zoomInEl.innerText = 'Zoom In';
            zoomInEl.addEventListener('click', () => {
                for (const worksheet of instance) worksheet.zoomIn();
            });

            const zoomOutEl = document.createElement('button');
            zoomOutEl.innerText = 'Zoom Out';
            zoomOutEl.addEventListener('click', () => {
                for (const worksheet of instance) worksheet.zoomOut();
            });

            const zoomDefault = document.createElement('button');
            zoomDefault.innerText = 'Zoom Default';
            zoomDefault.addEventListener('click', () => {
                for (const worksheet of instance) worksheet.resetZoom();
            });

            const zoomGet = document.createElement('button');
            zoomGet.innerText = 'Get Zoom';
            zoomGet.addEventListener('click', () => {
                for (const worksheet of instance) console.log('getZoom()', worksheet.getZoom());
            });

            const reloadEl = document.createElement('button');
            reloadEl.innerText = 'Reload this test';
            reloadEl.addEventListener('click', () => {
                location.reload();
            });

            extra.append(zoomInEl, zoomOutEl, zoomDefault, zoomGet, reloadEl);

            return instance;
        },
    },
    {
        name: 'REPRO: lazy loading on a dense grid (window shorter than two viewports)',
        check: 'Mirrors the Rodeo Planning grid: 400 rows squeezed to 10px each, so the 100 rows the lazy loading keeps are barely taller than the viewport. Scroll down to the bottom, slowly and by flicks, and watch the row numbers on the left. They must keep growing until row 400 : the window must never jump back to row 1, the rows under the cursor must not jump by a screenful on their own, and letting go must not leave the grid scrolling by itself. Then scroll all the way back up, the numbers must come back down to 1 without ever going backwards.',
        render() {
            /**
             * The row height is what breaks the lazy loading : the window is a fixed number of rows
             * and nothing stands in for the rows that are not loaded, so the denser the rows the
             * shorter the window is compared to the viewport it has to scroll through.
             */
            const style = document.createElement('style');
            style.innerHTML = '#root td, #root td.jss_row { height: 10px; line-height: 10px; padding: 0 4px; font-size: 9px; }';
            extra.appendChild(style);

            const data = [];
            for (let y = 0; y < 400; y++) {
                data.push(['row ' + (y + 1), y, 'x', 'y', 'z']);
            }

            return jspreadsheet(root, {
                worksheets: [
                    {
                        data: data,
                        tableOverflow: true,
                        tableHeight: '700px',
                        lazyLoading: true,
                        freezeColumns: 1,
                    },
                ],
            });
        },
    },
    {
        name: 'Column resize past window edge (REGRESSION: mousemove crash)',
        check: 'REGRESSION CHECK: drag a column border to resize it, moving the mouse fast past the left/right edge of the browser window (outside the page) while still holding the mouse button, then release. No red console errors ("getAttribute is not a function") should appear. Repeat a couple of times.',
        render() {
            return jspreadsheet(root, {
                worksheets: [
                    {
                        minDimensions: [200, 200],
                        tableOverflow: true,
                        lazyLoading: true,
                        tableWidth: '1000px',
                        freezeColumns: 2,
                        filters: true,
                    },
                ],
            });
        },
    },
];

// ---- QA harness UI ----

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        // ignore corrupt storage
    }
    return { index: 0, results: [] };
}

function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

const panel = document.createElement('div');
panel.id = 'qa-panel';
panel.style.cssText = `
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 99999;
    background: #1e1e1e; color: #fff; font-family: sans-serif; font-size: 14px;
    padding: 12px 16px; box-shadow: 0 -2px 10px rgba(0,0,0,0.4);
`;
document.body.appendChild(panel);

function clearMount() {
    window.jss.destroyAll();
    root.innerHTML = '';
    extra.innerHTML = '';
}

function renderSummary() {
    clearMount();
    panel.innerHTML = '';

    const title = document.createElement('h2');
    title.innerText = `QA complete — ${state.results.filter((r) => r.status === 'pass').length}/${state.results.length} passed`;
    panel.appendChild(title);

    const list = document.createElement('ul');
    for (const r of state.results) {
        const li = document.createElement('li');
        li.innerText = `${r.status === 'pass' ? '✅' : '❌'} ${r.name}${r.comment ? ' — ' + r.comment : ''}`;
        list.appendChild(li);
    }
    panel.appendChild(list);

    const exportBtn = document.createElement('button');
    exportBtn.innerText = 'Download report (JSON)';
    exportBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(state.results, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'kspreadsheet_qa_report.json';
        a.click();
    });

    const restartBtn = document.createElement('button');
    restartBtn.innerText = 'Restart all tests';
    restartBtn.style.marginLeft = '8px';
    restartBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        state = { index: 0, results: [] };
        renderScenario();
    });

    panel.append(exportBtn, restartBtn);
}

function renderScenario() {
    if (state.index >= scenarios.length) {
        renderSummary();
        return;
    }

    clearMount();

    const scenario = scenarios[state.index];
    scenario.render();

    panel.innerHTML = '';

    const header = document.createElement('div');
    header.innerHTML = `<strong>Test ${state.index + 1} / ${scenarios.length}: ${scenario.name}</strong>`;
    header.style.marginBottom = '6px';

    const check = document.createElement('div');
    check.innerText = scenario.check;
    check.style.cssText = 'margin-bottom: 8px; color: #ccc; max-width: 900px;';

    const comment = document.createElement('textarea');
    comment.placeholder = 'Comment (required if you click No)';
    comment.style.cssText = 'width: 400px; height: 40px; margin-right: 8px; vertical-align: top;';

    const yesBtn = document.createElement('button');
    yesBtn.innerText = '✅ Yes';
    yesBtn.style.cssText = 'background:#2e7d32; color:#fff; padding: 6px 14px; margin-right: 8px; cursor:pointer;';
    yesBtn.addEventListener('click', () => {
        state.results.push({ name: scenario.name, status: 'pass', comment: comment.value.trim() });
        state.index++;
        saveState(state);
        renderScenario();
    });

    const noBtn = document.createElement('button');
    noBtn.innerText = '❌ No';
    noBtn.style.cssText = 'background:#c62828; color:#fff; padding: 6px 14px; cursor:pointer;';
    noBtn.addEventListener('click', () => {
        if (!comment.value.trim()) {
            comment.style.border = '2px solid red';
            comment.placeholder = 'Please describe the problem before clicking No';
            comment.focus();
            return;
        }
        state.results.push({ name: scenario.name, status: 'fail', comment: comment.value.trim() });
        state.index++;
        saveState(state);
        renderScenario();
    });

    panel.append(header, check, comment, yesBtn, noBtn);
}

renderScenario();
