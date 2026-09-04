const { expect } = require('chai');

const jspreadsheet = require('../dist/index.js');

describe('Calculations', () => {
    it('Testing formula chain', () => {
        let test = jspreadsheet(root, {
            worksheets: [
                {
                    data: [
                        ['1', ''],
                        ['', ''],
                        ['', ''],
                        ['', ''],
                        ['', ''],
                    ],
                },
            ],
        });

        test[0].setValue('B5', '=B3+A1');
        test[0].setValue('B3', '=A1+1');
        test[0].setValue('A1', '2');

        expect(test[0].getValue('B5', true)).to.equal('5');
    });

    // NOTE: @jspreadsheet/formula evaluates named functions (SUM, AVERAGE, ...) via `new Function`,
    // which resolves against the JS engine's real global object. Under mocha+jsdom-global, `window`
    // is a plain object attached to Node's `global`, not `global` itself, so functions the library
    // registers "on window" are invisible here — this affects `=SUM(...)` in general, not just
    // open-ended ranges, and reproduces identically with e.g. `=SUM(A2:C2)`. Named-function formulas
    // can therefore only be verified in a real browser (see the "Open-ended range formulas" QA
    // scenario in src/test.js); here we only check that the range itself expands to the right cells.
    it('Testing open-ended range expansion (B:B, B2:B, A1:C)', () => {
        let test = jspreadsheet(root, {
            worksheets: [
                {
                    data: [
                        [1, 1, 1, ''],
                        [2, 2, 2, ''],
                        [3, 3, 3, '=B1+B2+B3'],
                    ],
                    minDimensions: [6, 3],
                },
            ],
        });

        // Arithmetic (no named function) still evaluates fine under mocha/jsdom: B1+B2+B3 = 1+2+3
        expect(test[0].getValue('D3', true)).to.equal('6');

        // The dependency chain is built from the same range-expansion code as SUM(...): a formula
        // referencing an open-ended range must register itself against every cell that range covers.
        // (Each form uses its own formula cell — the dependency tracker only ever grows via push and
        // never prunes stale links when a single cell's formula is replaced, which is a pre-existing,
        // unrelated limitation, not something this test is about.)

        // B:B -> whole column, rows 1-3
        test[0].setValue('E1', '=SUM(B:B)');
        expect(test[0].formula['B1']).to.include('E1');
        expect(test[0].formula['B2']).to.include('E1');
        expect(test[0].formula['B3']).to.include('E1');

        // B2:B -> column B from row 2 to the last row (row 1 excluded)
        test[0].setValue('E2', '=SUM(B2:B)');
        expect(test[0].formula['B1']).to.not.include('E2');
        expect(test[0].formula['B2']).to.include('E2');
        expect(test[0].formula['B3']).to.include('E2');

        // A1:C -> whole A:C block, rows 1-3
        test[0].setValue('E3', '=SUM(A1:C)');
        expect(test[0].formula['A1']).to.include('E3');
        expect(test[0].formula['C3']).to.include('E3');
    });

    // Regression test for a real bug found via manual QA: a formula referencing a range (open-ended
    // OR closed) did not pick up a row inserted into that range — the dependency chain (obj.formula)
    // is only populated when a formula is evaluated, so a brand new cell (which didn't exist yet when
    // the formula last ran) was never registered as one of its dependencies, and the normal
    // setValue -> updateFormulaChain path never fired for it afterwards. Fixed by re-executing every
    // formula cell after any structural change (see recalculateFormulas() in internal.js), which
    // re-registers dependencies as a side effect of evaluating the range again.
    // (SUM's actual numeric result can't be asserted under mocha/jsdom — see the note above — so
    // this checks the dependency registration directly, the same way the range-expansion test above
    // does.)
    it('Registers a newly inserted row as a dependency of a range formula (open-ended and closed)', () => {
        let test = jspreadsheet(root, {
            worksheets: [
                {
                    data: [
                        [1, ''],
                        [2, ''],
                        [3, '=SUM(A:A)'],
                        [4, '=SUM(A1:A3)'],
                    ],
                    minDimensions: [4, 6],
                },
            ],
        });

        test[0].insertRow(1, 2, true);

        // The formulas (now at B4/B5, since the insert pushed them down one row) were re-evaluated
        // and should have registered the freshly inserted A3 as one of their dependencies.
        expect(test[0].formula['A3']).to.include('B4');
        expect(test[0].formula['A3']).to.include('B5');
    });

    describe('Test updating formulas when adding new rows', () => {
        it('1', () => {
            let test = jspreadsheet(root, {
                worksheets: [
                    {
                        data: [
                            ['1', '2', '3', '=SUM(A2:C2)'],
                            ['4', '5', '6', '=SUM(A2:C2)'],
                            ['7', '8', '9', '=SUM(A2:C2)'],
                        ],
                        worksheetName: 'sheet1',
                    },
                ],
            });

            test[0].insertRow(1, 1, true);

            expect(test[0].getValue('D1')).to.equal('=SUM(A3:C3)');
            expect(test[0].getValue('D2')).to.equal('');
            expect(test[0].getValue('D3')).to.equal('=SUM(A3:C3)');
            expect(test[0].getValue('D4')).to.equal('=SUM(A3:C3)');
        });

        it('2', () => {
            let test = jspreadsheet(root, {
                worksheets: [
                    {
                        data: [
                            ['1', '2', '3', '=SUM(A2:C3)'],
                            ['4', '5', '6', '=SUM(A2:C3)'],
                            ['7', '8', '9', '=SUM(A2:C3)'],
                            ['10', '11', '12', '=SUM(A2:C3)'],
                        ],
                        worksheetName: 'sheet1',
                    },
                ],
            });

            test[0].insertRow(1, 1, true);

            expect(test[0].getValue('D1')).to.equal('=SUM(A3:C4)');
            expect(test[0].getValue('D2')).to.equal('');
            expect(test[0].getValue('D3')).to.equal('=SUM(A3:C4)');
            expect(test[0].getValue('D4')).to.equal('=SUM(A3:C4)');
            expect(test[0].getValue('D5')).to.equal('=SUM(A3:C4)');
        });

        it('3', () => {
            let test = jspreadsheet(root, {
                worksheets: [
                    {
                        data: [
                            ['1', '2', '3', '=SUM(A2:C3)'],
                            ['4', '5', '6', '=SUM(A2:C3)'],
                            ['7', '8', '9', '=SUM(A2:C3)'],
                            ['10', '11', '12', '=SUM(A2:C3)'],
                        ],
                        worksheetName: 'sheet1',
                    },
                ],
            });

            test[0].insertRow(1, 1, false);

            expect(test[0].getValue('D1')).to.equal('=SUM(A2:C4)');
            expect(test[0].getValue('D2')).to.equal('=SUM(A2:C4)');
            expect(test[0].getValue('D3')).to.equal('');
            expect(test[0].getValue('D4')).to.equal('=SUM(A2:C4)');
            expect(test[0].getValue('D5')).to.equal('=SUM(A2:C4)');
        });

        it('4', () => {
            let test = jspreadsheet(root, {
                worksheets: [
                    {
                        data: [
                            ['1', '2', '3', '=SUM(A2:C3)'],
                            ['4', '5', '6', '=SUM(A2:C3)'],
                            ['7', '8', '9', '=SUM(A2:C3)'],
                            ['10', '11', '12', '=SUM(A2:C3)'],
                        ],
                        worksheetName: 'sheet1',
                    },
                ],
            });

            test[0].insertRow(1, 2, true);

            expect(test[0].getValue('D1')).to.equal('=SUM(A2:C4)');
            expect(test[0].getValue('D2')).to.equal('=SUM(A2:C4)');
            expect(test[0].getValue('D3')).to.equal('');
            expect(test[0].getValue('D4')).to.equal('=SUM(A2:C4)');
            expect(test[0].getValue('D5')).to.equal('=SUM(A2:C4)');
        });

        it('5', () => {
            let test = jspreadsheet(root, {
                worksheets: [
                    {
                        data: [
                            ['1', '2', '3', '=SUM(A2:C3)'],
                            ['4', '5', '6', '=SUM(A2:C3)'],
                            ['7', '8', '9', '=SUM(A2:C3)'],
                            ['10', '11', '12', '=SUM(A2:C3)'],
                        ],
                        worksheetName: 'sheet1',
                    },
                ],
            });

            test[0].insertRow(1, 2, false);

            expect(test[0].getValue('D1')).to.equal('=SUM(A2:C3)');
            expect(test[0].getValue('D2')).to.equal('=SUM(A2:C3)');
            expect(test[0].getValue('D3')).to.equal('=SUM(A2:C3)');
            expect(test[0].getValue('D4')).to.equal('');
            expect(test[0].getValue('D5')).to.equal('=SUM(A2:C3)');
        });
    });

    describe('Test updating formulas when adding new columns', () => {
        it('1', () => {
            let test = jspreadsheet(root, {
                worksheets: [
                    {
                        data: [
                            ['1', '2', '3'],
                            ['4', '5', '6'],
                            ['7', '8', '9'],
                            ['=SUM(B1:B3)', '=SUM(B1:B3)', '=SUM(B1:B3)'],
                        ],
                        worksheetName: 'sheet1',
                    },
                ],
            });

            test[0].insertColumn(1, 1, true);

            expect(test[0].getValue('A4')).to.equal('=SUM(C1:C3)');
            expect(test[0].getValue('B4')).to.equal('');
            expect(test[0].getValue('C4')).to.equal('=SUM(C1:C3)');
            expect(test[0].getValue('D4')).to.equal('=SUM(C1:C3)');
        });

        it('2', () => {
            let test = jspreadsheet(root, {
                worksheets: [
                    {
                        data: [
                            ['1', '2', '3', '4'],
                            ['5', '6', '7', '8'],
                            ['9', '10', '11', '12'],
                            ['=SUM(B1:C3)', '=SUM(B1:C3)', '=SUM(B1:C3)', '=SUM(B1:C3)'],
                        ],
                        worksheetName: 'sheet1',
                    },
                ],
            });

            test[0].insertColumn(1, 1, true);

            expect(test[0].getValue('A4')).to.equal('=SUM(C1:D3)');
            expect(test[0].getValue('B4')).to.equal('');
            expect(test[0].getValue('C4')).to.equal('=SUM(C1:D3)');
            expect(test[0].getValue('D4')).to.equal('=SUM(C1:D3)');
            expect(test[0].getValue('E4')).to.equal('=SUM(C1:D3)');
        });

        it('3', () => {
            let test = jspreadsheet(root, {
                worksheets: [
                    {
                        data: [
                            ['1', '2', '3', '4'],
                            ['5', '6', '7', '8'],
                            ['9', '10', '11', '12'],
                            ['=SUM(B1:C3)', '=SUM(B1:C3)', '=SUM(B1:C3)', '=SUM(B1:C3)'],
                        ],
                        worksheetName: 'sheet1',
                    },
                ],
            });

            test[0].insertColumn(1, 1, false);

            expect(test[0].getValue('A4')).to.equal('=SUM(B1:D3)');
            expect(test[0].getValue('B4')).to.equal('=SUM(B1:D3)');
            expect(test[0].getValue('C4')).to.equal('');
            expect(test[0].getValue('D4')).to.equal('=SUM(B1:D3)');
            expect(test[0].getValue('E4')).to.equal('=SUM(B1:D3)');
        });

        it('4', () => {
            let test = jspreadsheet(root, {
                worksheets: [
                    {
                        data: [
                            ['1', '2', '3', '4'],
                            ['5', '6', '7', '8'],
                            ['9', '10', '11', '12'],
                            ['=SUM(B1:C3)', '=SUM(B1:C3)', '=SUM(B1:C3)', '=SUM(B1:C3)'],
                        ],
                        worksheetName: 'sheet1',
                    },
                ],
            });

            test[0].insertColumn(1, 2, true);

            expect(test[0].getValue('A4')).to.equal('=SUM(B1:D3)');
            expect(test[0].getValue('B4')).to.equal('=SUM(B1:D3)');
            expect(test[0].getValue('C4')).to.equal('');
            expect(test[0].getValue('D4')).to.equal('=SUM(B1:D3)');
            expect(test[0].getValue('E4')).to.equal('=SUM(B1:D3)');
        });

        it('5', () => {
            let test = jspreadsheet(root, {
                worksheets: [
                    {
                        data: [
                            ['1', '2', '3', '4'],
                            ['5', '6', '7', '8'],
                            ['9', '10', '11', '12'],
                            ['=SUM(B1:C3)', '=SUM(B1:C3)', '=SUM(B1:C3)', '=SUM(B1:C3)'],
                        ],
                        worksheetName: 'sheet1',
                    },
                ],
            });

            test[0].insertColumn(1, 2, false);

            expect(test[0].getValue('A4')).to.equal('=SUM(B1:C3)');
            expect(test[0].getValue('B4')).to.equal('=SUM(B1:C3)');
            expect(test[0].getValue('C4')).to.equal('=SUM(B1:C3)');
            expect(test[0].getValue('D4')).to.equal('');
            expect(test[0].getValue('E4')).to.equal('=SUM(B1:C3)');
        });

        it('6', () => {
            let test = jspreadsheet(root, {
                worksheets: [
                    {
                        data: [[1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3], ['=SUM(A1:A4)']],
                        minDimensions: [5, 5],
                    },
                ],
            });

            test[0].deleteRow(1);

            expect(test[0].getValue('A5')).to.equal('=SUM(A1:A3)');
        });
    });
});
