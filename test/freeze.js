const fs = require('fs');
const path = require('path');

const { expect } = require('chai');

const jspreadsheet = require('../dist/index.js');

const JSPREADSHEET_CSS = fs.readFileSync(path.join(__dirname, '../src/jspreadsheet.css'), 'utf8');

// jsdom's cascade does not implement real CSS specificity (it resolves conflicting rules by
// source order only, always taking the last matching one), so `getComputedStyle` in a jsdom
// test cannot reproduce a real-browser specificity bug. Instead, compute actual CSS specificity
// (ids, classes/attrs/pseudo-classes, type selectors) for every rule in the real stylesheet and
// find which declaration for `position` really wins on a given element in a real browser.
function parseCssRules(css) {
    // Strip comments, then split into selector/body pairs.
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [];
    const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = ruleRegex.exec(stripped))) {
        const selectors = match[1].split(',').map((s) => s.trim());
        const body = match[2];
        const positionMatch = /position\s*:\s*([a-zA-Z-]+)\s*;/g;
        let positionValue;
        let m;
        // A declaration block may repeat `position` (e.g. the `-webkit-sticky`/`sticky`
        // fallback pair) - the last one in the block is what applies.
        while ((m = positionMatch.exec(body))) {
            positionValue = m[1];
        }
        if (positionValue !== undefined) {
            rules.push({ selectors, positionValue });
        }
    }
    return rules;
}

function specificity(selector) {
    const ids = (selector.match(/#[\w-]+/g) || []).length;
    const classesEtc = (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+(?!\()/g) || []).length;
    // Bare identifiers not part of a class/attr/pseudo token (e.g. `td`, `tr`, `tbody`).
    const types = (selector.match(/(^|[\s>+~])([a-zA-Z][\w-]*)/g) || []).length;
    return [ids, classesEtc, types];
}

function higherOrEqual(a, b) {
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] > b[i];
    }
    return true; // equal specificity: source order decides, handled by caller
}

// Resolve what `position` a real browser would compute for an element matching `elementSelectors`
// (every class the element carries), among all rules in the stylesheet whose selector matches it.
function resolvePosition(rules, elementClasses) {
    let winner;
    for (const rule of rules) {
        for (const selector of rule.selectors) {
            // A pseudo-class (e.g. `:first-child`) or attribute selector imposes a structural
            // requirement this elementClasses model can't express - skip rather than risk a
            // false-positive match (e.g. matching `:first-child` for a non-first cell).
            if (/[:[]/.test(selector)) continue;

            // Otherwise the selector matches if every class token it requires is on the element.
            const requiredClasses = selector.match(/\.[\w-]+/g) || [];
            const isMatch = requiredClasses.length > 0 && requiredClasses.every((c) => elementClasses.includes(c.slice(1)));
            if (!isMatch) continue;

            const spec = specificity(selector);
            if (!winner || higherOrEqual(spec, winner.spec)) {
                winner = { spec, value: rule.positionValue };
            }
        }
    }
    return winner && winner.value;
}

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('Freeze columns and rows', () => {
    it('freezeColumns marks the configured header/body cells and leaves the rest alone', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [5, 5],
                    data: [
                        [1, 2, 3, 4, 5],
                        [6, 7, 8, 9, 10],
                    ],
                    freezeColumns: 2,
                },
            ],
        });

        const worksheet = instance[0];

        expect(worksheet.headers[0].classList.contains('jss_freezed')).to.equal(true);
        expect(worksheet.headers[1].classList.contains('jss_freezed')).to.equal(true);
        expect(worksheet.headers[2].classList.contains('jss_freezed')).to.equal(false);

        // First frozen column rests at offset 0, the second at the width of the first
        expect(worksheet.headers[0].style.left).to.equal('0px');
        expect(worksheet.headers[1].style.left).to.not.equal('');

        expect(worksheet.records[0][0].element.classList.contains('jss_freezed')).to.equal(true);
        expect(worksheet.records[0][1].element.classList.contains('jss_freezed')).to.equal(true);
        expect(worksheet.records[0][2].element.classList.contains('jss_freezed')).to.equal(false);
    });

    it('freezeRows marks every cell in the configured rows and leaves later rows alone', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [5, 5],
                    data: [
                        [1, 2, 3, 4, 5],
                        [6, 7, 8, 9, 10],
                        [11, 12, 13, 14, 15],
                    ],
                    freezeRows: 2,
                },
            ],
        });

        const worksheet = instance[0];

        // Row 0 and row 1 are frozen: every cell (including the row-number cell) should stick
        for (const row of [0, 1]) {
            for (let col = 0; col < worksheet.records[row].length; col++) {
                expect(worksheet.records[row][col].element.classList.contains('jss_row_freezed'), `row ${row} col ${col}`).to.equal(true);
                expect(worksheet.records[row][col].element.style.top).to.not.equal('');
            }
            // Row-number cell (first child of the <tr>) is also pinned
            expect(worksheet.rows[row].element.children[0].classList.contains('jss_row_freezed')).to.equal(true);
        }

        // Row 2 is not frozen
        for (let col = 0; col < worksheet.records[2].length; col++) {
            expect(worksheet.records[2][col].element.classList.contains('jss_row_freezed')).to.equal(false);
        }
    });

    it('freezeRows + freezeColumns together mark the corner cell on both axes', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [5, 5],
                    data: [
                        [1, 2, 3, 4, 5],
                        [6, 7, 8, 9, 10],
                        [11, 12, 13, 14, 15],
                    ],
                    freezeColumns: 1,
                    freezeRows: 1,
                },
            ],
        });

        const worksheet = instance[0];
        const corner = worksheet.records[0][0].element;

        expect(corner.classList.contains('jss_freezed')).to.equal(true);
        expect(corner.classList.contains('jss_row_freezed')).to.equal(true);
    });

    it('does not mark any cells when freezeColumns/freezeRows are not set', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [5, 5],
                    data: [
                        [1, 2, 3, 4, 5],
                        [6, 7, 8, 9, 10],
                    ],
                },
            ],
        });

        const worksheet = instance[0];

        for (let row = 0; row < worksheet.records.length; row++) {
            for (let col = 0; col < worksheet.records[row].length; col++) {
                expect(worksheet.records[row][col].element.classList.contains('jss_freezed')).to.equal(false);
                expect(worksheet.records[row][col].element.classList.contains('jss_row_freezed')).to.equal(false);
            }
        }
    });

    it('freezeColumns also pins the footer cells under the frozen columns', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [5, 5],
                    data: [
                        [1, 2, 3, 4, 5],
                        [6, 7, 8, 9, 10],
                    ],
                    freezeColumns: 2,
                    footers: [['Total', '=SUM(B1:B2)', '', '', '']],
                },
            ],
        });

        const worksheet = instance[0];
        const footerRow = worksheet.tfoot.children[0];

        // td[0] is the row-number placeholder, td[i + 1] is column i
        expect(footerRow.children[1].classList.contains('jss_freezed')).to.equal(true);
        expect(footerRow.children[2].classList.contains('jss_freezed')).to.equal(true);
        expect(footerRow.children[3].classList.contains('jss_freezed')).to.equal(false);

        expect(footerRow.children[1].style.left).to.equal('0px');
        expect(footerRow.children[2].style.left).to.not.equal('');
    });

    it('marks a frozen image cell the same way as any other frozen cell', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [3, 2],
                    data: [
                        [PIXEL, 2, 3],
                        [PIXEL, 7, 8],
                    ],
                    columns: [{ type: 'image' }, { type: 'text' }, { type: 'text' }],
                    freezeColumns: 1,
                    freezeRows: 1,
                },
            ],
        });

        const worksheet = instance[0];
        const cornerImageCell = worksheet.records[0][0].element;

        expect(cornerImageCell.classList.contains('jss_image_cell')).to.equal(true);
        expect(cornerImageCell.classList.contains('jss_freezed')).to.equal(true);
        expect(cornerImageCell.classList.contains('jss_row_freezed')).to.equal(true);
        expect(cornerImageCell.style.left).to.equal('0px');
        expect(cornerImageCell.style.top).to.not.equal('');
    });

    it('actually keeps a frozen image cell sticky in CSS instead of losing to the image-cell position:relative rule', () => {
        // Regression test for a real-browser cascade bug: `.jss_image_cell` sets
        // `position: relative` (needed so the absolutely-positioned <img> sizes against the
        // cell) with a specificity that beats the generic `.jss_freezed`/`.jss_row_freezed`
        // sticky rule. Without a dedicated override, a frozen image cell resolves to
        // `position: relative` and scrolls with the sheet body instead of staying pinned.
        // jsdom's cascade doesn't implement real specificity (it just takes the last matching
        // rule in source order), so this is checked by computing specificity directly against
        // the shipped stylesheet rather than via getComputedStyle.
        const rules = parseCssRules(JSPREADSHEET_CSS);

        // Naive matcher checks required classes only, without respecting combinators, so the
        // ancestor's `jss_worksheet`/`tbody` classing is included alongside the cell's own.
        expect(resolvePosition(rules, ['jss_worksheet', 'jss_image_cell', 'jss_freezed'])).to.equal('sticky');
        expect(resolvePosition(rules, ['jss_worksheet', 'jss_image_cell', 'jss_row_freezed'])).to.equal('sticky');
    });

    it('setHeight on a frozen row does not throw and keeps offsets applied', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    minDimensions: [5, 5],
                    data: [
                        [1, 2, 3, 4, 5],
                        [6, 7, 8, 9, 10],
                    ],
                    freezeRows: 1,
                },
            ],
        });

        const worksheet = instance[0];

        expect(() => worksheet.setHeight(0, 40)).to.not.throw();
        expect(worksheet.records[0][0].element.classList.contains('jss_row_freezed')).to.equal(true);
    });
});
