const { expect } = require('chai');

const jspreadsheet = require('../dist/index.js');

describe('Fill-handle corner shape/radius config', () => {
    it('defaults to a sharp square (border-radius: 0) when unset', () => {
        const instance = jspreadsheet(root, {
            worksheets: [{ minDimensions: [5, 5] }],
        });

        expect(instance[0].corner.style.borderRadius).to.equal('0');
        expect(instance[0].corner.style.borderWidth).to.equal('');
        expect(instance[0].corner.style.width).to.equal('');
    });

    it('cornerShape: "square" explicitly is also a sharp square, same as unset', () => {
        const instance = jspreadsheet(root, {
            worksheets: [{ minDimensions: [5, 5], cornerShape: 'square' }],
        });

        expect(instance[0].corner.style.borderRadius).to.equal('0');
        expect(instance[0].corner.style.borderWidth).to.equal('');
        expect(instance[0].corner.style.width).to.equal('');
    });

    it('cornerShape: "circle" makes the handle fully round', () => {
        const instance = jspreadsheet(root, {
            worksheets: [{ minDimensions: [5, 5], cornerShape: 'circle' }],
        });

        expect(instance[0].corner.style.borderRadius).to.equal('50%');
    });

    it('cornerRadius applies a rounded-square look', () => {
        const instance = jspreadsheet(root, {
            worksheets: [{ minDimensions: [5, 5], cornerRadius: 4 }],
        });

        expect(instance[0].corner.style.borderRadius).to.equal('4px');
    });

    it('cornerShape: "circle" takes priority over cornerRadius', () => {
        const instance = jspreadsheet(root, {
            worksheets: [{ minDimensions: [5, 5], cornerShape: 'circle', cornerRadius: 4 }],
        });

        expect(instance[0].corner.style.borderRadius).to.equal('50%');
    });

    it('cornerShape: "square" combined with cornerRadius still rounds (shape does not override an explicit radius)', () => {
        const instance = jspreadsheet(root, {
            worksheets: [{ minDimensions: [5, 5], cornerShape: 'square', cornerRadius: 4 }],
        });

        expect(instance[0].corner.style.borderRadius).to.equal('4px');
    });
});
