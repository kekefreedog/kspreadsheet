/**
 * Data State Regressions
 *
 * @package    kzarshenas/kspreadsheet
 * @author     kekefreedog <kevin.zarshenas@gmail.com>
 * @copyright  2026 Kévin Zarshenas
 */

/** Dependencies */
const { expect } = require('chai');

// Load the built runtime used by consumers
const jspreadsheet = require('../dist/index.js');

// Exercise opt-in replacement without changing the legacy default
 describe('Preserve data state', () => {

    // Keep identity-based selection, dimensions and search after rows move
    it('follows stable keys and resized rows without emitting selection events', () => {

        // Count external selection events
        let events = 0;

        // Count cell creation separately from transient selection events
        let created = 0;

        // Mount a small identifiable worksheet
        const sheet = jspreadsheet(root, { onselection: () => events++, oncreatecell: (worksheet, cell) => {

            // Apply the same kind of rendering hook used by Planning colors
            cell.style.backgroundColor = 'rgb(10, 20, 30)';

            // Count every newly created cell
            created++;

        }, worksheets: [{ data: [['a', 'old'], ['b', 'old'], ['c', 'old']], columns: [{width: 100}, {width: 100}], minDimensions: [2, 0], multipleSelection: true, defaultRowHeight: 30 }] })[0];

        // Resize a user column
        sheet.setWidth(1, 230);

        // Resize the selected person row
        sheet.setHeight(1, 75);

        // Select two rows that an incoming row will separate
        sheet.updateSelectionFromCoords(1, 0, 1, 1);

        // Reset the event count before replacing data
        events = 0;

        // Reset the renderer count before replacing data
        created = 0;

        // Insert a new identity between selected people
        sheet.setData([['a', 'new'], ['x', 'new'], ['b', 'new'], ['c', 'new']], {preserveState: true, rowKey: row => row[0]});

        // Keep the rendering callbacks active for every incoming cell
        expect(created).to.equal(8);

        // Preserve the cell colors provided by the renderer
        expect(sheet.records[2][1].element.style.backgroundColor).to.equal('rgb(10, 20, 30)');

        // Keep the surviving people selected without selecting the new row
        expect(sheet.getHighlighted()).to.deep.equal([[1, 0, 1, 0], [1, 2, 1, 2]]);

        // Keep the resized person height under its new row index
        expect(sheet.rows[2].element.style.height).to.equal('75px');

        // Keep the user column width
        expect(sheet.getWidth(1)).to.equal(230);

        // Suppress transient selection reset and restore events
        expect(events).to.equal(0);

        // Restore normal event policy
        expect(sheet.parent.ignoreEvents).not.to.equal(true);

    });

    // Drop deleted identities instead of selecting unrelated replacement rows
    it('clears deleted or ambiguous identities and retains default reset behavior', () => {

        // Mount rows with stable identities
        const sheet = jspreadsheet(root, {worksheets: [{data: [['a'], ['b']], minDimensions: [1, 0]}]})[0];

        // Select the row that will disappear
        sheet.updateSelectionFromCoords(0, 1, 0, 1);

        // Replace it with another person
        sheet.setData([['a'], ['c']], {preserveState: true, rowKey: row => row[0]});

        // Avoid silently transferring selection to the new person
        expect(sheet.selectedCell).to.equal(null);

        // Select a surviving row
        sheet.updateSelectionFromCoords(0, 0, 0, 0);

        // Keep legacy callers on the original reset behavior
        sheet.setData([['a'], ['c']]);

        // Require an explicit opt-in for selection preservation
        expect(sheet.selectedCell).to.equal(null);

        // Introduce duplicate old identities
        sheet.setData([['a'], ['a']]);

        // Select an ambiguous old identity
        sheet.updateSelectionFromCoords(0, 0, 0, 0);

        // Replace duplicates with one unique row
        sheet.setData([['a']], {preserveState: true, rowKey: row => row[0]});

        // Avoid guessing which duplicate was retained
        expect(sheet.selectedCell).to.equal(null);

    });

    // Support normalized object input and empty data
    it('uses normalized arrays for object input and clears empty replacements', () => {

        // Mount object data through named columns
        const sheet = jspreadsheet(root, {worksheets: [{data: [{id: 'a'}, {id: 'b'}], columns: [{name: 'id'}], minDimensions: [1, 0]}]})[0];

        // Select a stable person
        sheet.updateSelectionFromCoords(0, 1, 0, 1);

        // Insert a new object row before the old identities
        sheet.setData([{id: 'x'}, {id: 'a'}, {id: 'b'}], {preserveState: true, rowKey: row => row[0]});

        // Follow the normalized identity to its new row
        expect(sheet.selectedCell.map(Number)).to.deep.equal([0, 2, 0, 2]);

        // Replace the dataset with an empty snapshot
        sheet.setData([], {preserveState: true, rowKey: row => row[0]});

        // Clear selection and row state safely
        expect(sheet.selectedCell).to.equal(null);

        // Avoid retaining phantom rows
        expect(sheet.rows.length).to.equal(0);

    });

    // Retain current search membership when new rows arrive
    it('reapplies the text query to the new snapshot', () => {

        // Mount searchable source rows
        const sheet = jspreadsheet(root, {worksheets: [{data: [['a', 'match'], ['b', 'other']], columns: [{}, {}], search: true, minDimensions: [2, 0]}]})[0];

        // Apply the user's current search
        sheet.search('match');

        // Refresh with one newly matching record
        sheet.setData([['a', 'match'], ['b', 'other'], ['c', 'match']], {preserveState: true, rowKey: row => row[0]});

        // Preserve the typed query
        expect(sheet.getSearch()).to.equal('match');

        // Reconcile membership with the incoming rows
        expect(sheet.results).to.deep.equal([0, 2]);

    });

});
