const { expect } = require('chai');

const jspreadsheet = require('../dist/index.js');

describe('Use footers', () => {
    it('Start the worksheet with a footer', () => {
        jspreadsheet(root, {
            tabs: true,
            worksheets: [
                {
                    minDimensions: [7, 7],
                    freezeColumns: 2,
                    data: [
                        ['Hello', 'World'],
                        ['Testing', 'CE'],
                    ],
                    footers: [
                        ['a', 'b', 'c'],
                        [1, 2, 3],
                    ],
                },
            ],
        });

        const footerTag = root.querySelector('tfoot');

        const firstRow = footerTag.children[0];

        expect(firstRow.children[1].innerHTML).to.equal('a');
        expect(firstRow.children[2].innerHTML).to.equal('b');
        expect(firstRow.children[3].innerHTML).to.equal('c');

        const secondRow = footerTag.children[1];

        expect(secondRow.children[1].innerHTML).to.equal('1');
        expect(secondRow.children[2].innerHTML).to.equal('2');
        expect(secondRow.children[3].innerHTML).to.equal('3');
    });

    describe('stickyFooter option', () => {
        it('does not pin the footer by default (unchanged historical behavior)', () => {
            jspreadsheet(root, {
                worksheets: [
                    {
                        minDimensions: [3, 3],
                        footers: [['a', 'b', 'c']],
                    },
                ],
            });

            const footerRow = root.querySelector('tfoot').children[0];

            for (const td of footerRow.children) {
                expect(td.classList.contains('jss_footer_sticky')).to.equal(false);
            }
        });

        it('pins the footer to the bottom when stickyFooter: true', () => {
            jspreadsheet(root, {
                worksheets: [
                    {
                        minDimensions: [3, 3],
                        footers: [['a', 'b', 'c']],
                        stickyFooter: true,
                    },
                ],
            });

            const footerRow = root.querySelector('tfoot').children[0];

            for (const td of footerRow.children) {
                expect(td.classList.contains('jss_footer_sticky')).to.equal(true);
                expect(td.style.bottom).to.equal('0px');
            }
        });

        it('stacks multiple footer rows bottom-up when stickyFooter: true', () => {
            const test = jspreadsheet(root, {
                worksheets: [
                    {
                        minDimensions: [3, 3],
                        footers: [
                            ['a', 'b', 'c'],
                            ['d', 'e', 'f'],
                        ],
                        stickyFooter: true,
                    },
                ],
            });

            const tfoot = root.querySelector('tfoot');
            const lastRowHeight = tfoot.children[1].offsetHeight;

            // Last row rests at the very bottom; the row above it stacks on top of it
            expect(tfoot.children[1].children[1].style.bottom).to.equal('0px');
            expect(tfoot.children[0].children[1].style.bottom).to.equal(lastRowHeight + 'px');

            // Turning the option off again removes the sticky pinning
            test[0].options.stickyFooter = false;
            test[0].setFooter();

            for (const row of tfoot.children) {
                for (const td of row.children) {
                    expect(td.classList.contains('jss_footer_sticky')).to.equal(false);
                }
            }
        });

        it('zeroes the scroll container padding-bottom so nothing peeks out below the sticky footer', () => {
            const test = jspreadsheet(root, {
                worksheets: [
                    {
                        minDimensions: [3, 20],
                        tableOverflow: true,
                        tableHeight: '200px',
                        footers: [['a', 'b', 'c']],
                        stickyFooter: true,
                    },
                ],
            });

            expect(test[0].content.style.paddingBottom).to.equal('0px');

            // Turning the option off restores the container's own padding-bottom
            test[0].options.stickyFooter = false;
            test[0].setFooter();
            expect(test[0].content.style.paddingBottom).to.equal('');
        });
    });
});
