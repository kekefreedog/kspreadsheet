const { expect } = require('chai');

const jspreadsheet = require('../dist/index.js');

describe('Table overflow', () => {
    // NOTE: this jsdom/cssstyle version doesn't recognize `overscroll-behavior` at all (same class
    // of gap as the `padding-bottom` quirk noted in freeze.js) — setting it via `.style.overscrollBehavior`
    // silently no-ops here even though it works correctly in a real browser (verified manually: the
    // scrolling container's computed `overscroll-behavior-y` reads "auto" by default and "contain"
    // with `overflowBounce: false`). These tests only check what jsdom actually can: that the option
    // doesn't throw and only touches the scroll container when tableOverflow is actually active.
    describe('overflowBounce option', () => {
        it('does not throw when tableOverflow is enabled, on or off', () => {
            expect(() => {
                jspreadsheet(root, {
                    worksheets: [{ minDimensions: [3, 10], tableOverflow: true, tableHeight: '150px', overflowBounce: false }],
                });
            }).to.not.throw();

            root.innerHTML = '';

            expect(() => {
                jspreadsheet(root, {
                    worksheets: [{ minDimensions: [3, 10], tableOverflow: true, tableHeight: '150px', overflowBounce: true }],
                });
            }).to.not.throw();
        });

        it('does not throw when tableOverflow is not enabled', () => {
            expect(() => {
                jspreadsheet(root, {
                    worksheets: [{ minDimensions: [3, 10], overflowBounce: false }],
                });
            }).to.not.throw();
        });
    });
});
