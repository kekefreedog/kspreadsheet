title: Spreadsheet Selection
keywords: Jspreadsheet, Jexcel, data grid, JavaScript, excel-like selection, spreadsheet selection, cell selection, data grid selection, selection methods, range selection, multiple cell selection
description: This section covers the properties, events, and methods for managing data grid selections, including range and multiple cell selection.

# Spreadsheet Selection

This section covers the technical aspects of handling spreadsheet selections in Jspreadsheet, detailing the key properties, events, and methods for managing selection behaviour.

## Disconnected selections in kspreadsheet

Set worksheet option `multipleSelection: true` to select separate cells and rectangles. It defaults to `false`. The worksheet keeps normalized, non-overlapping ranges and an active directional range. Cells between ranges are never implicitly selected.

| Input | Behavior |
| --- | --- |
| Click | Replace the selection with one cell |
| Ctrl/Cmd-click | Add an unselected cell/group or remove a fully selected cell/group |
| Ctrl/Cmd-drag | Add a rectangle when starting outside the selection; subtract it when starting on a selected cell/group |
| Ctrl/Cmd+Shift-click / drag | Extend or shrink the last add/remove operation from its original anchor |
| Shift-click / Shift-arrow | Extend the active range while retaining other ranges |
| Arrow / Tab / Enter | Move from the active range and return to single selection |
| Escape | Keep the active cell and clear copy outlines |
| Right-click inside a selected range | Preserve the complete selection |
| Row / column / nested-header click | Apply the same range gestures to the indicated rows or columns |

Ctrl is used on Windows/Linux; Cmd is used on macOS. Existing resize and drag handles retain their behavior. Touch continues to use ordinary single-range selection.

The add/remove operation is chosen when the drag starts and stays fixed until release. Dragging back restores cells outside the current rectangle. After release, Ctrl/Cmd+Shift-click or drag continues that same operation against the selection as it was before the operation began. After a removal, extending removes more cells; shrinking restores cells. This also works when the last operation removed the entire selection. Subtraction removes whole merged cells and never changes cell values. A partially selected row, column, or nested-header group is added; a fully selected group is removed.

Shift alone extends the active selected range. Ctrl/Cmd+Shift uses that same behavior when there is no previous add/remove operation to continue. A plain click, keyboard navigation, a programmatic selection replacement, or a data replacement clears the remembered operation.

### Programmatic ranges

`setSelections(ranges, activeRangeIndex?)` replaces the complete selection. Ranges use inclusive zero-based `[x1, y1, x2, y2]` coordinates; the last supplied range is active by default. An empty list clears selection. More than one input range requires `multipleSelection: true`.

`addSelectionFromCoords(x1, y1, x2?, y2?, toggle = false)` adds a rectangle. Pass `true` as the fifth argument to remove it when fully selected. Merged cells expand the rectangle to their complete extent.

`getHighlighted()` returns a copy of all normalized rectangles. `getSelected()`, `getSelectedRows()`, `getSelectedColumns()`, and `isSelected()` cover their union. `getSelected()` excludes explicitly hidden cells but retains selected cells on detached lazy-loading or pagination rows. `getSelection()`, `getRange()`, and `selectedCell` describe the active range for compatibility; `updateSelectionFromCoords()` replaces all ranges.

`onbeforeselection` and `onselection` retain their existing arguments and receive the complete range list as an optional final argument. Returning `false` from `onbeforeselection` cancels the entire change. Read selection state through the methods rather than modifying `selectedRanges` directly.

### Operations and lifecycle

Formatting and value clearing target selected cells once and respect readonly cells. Space toggles selected checkboxes; radio columns change only the active radio cell, retaining their single-choice behavior and recording displaced values for undo. Selected row/column deletion uses exact indices, preserving intervening rows/columns; bulk operations undo as one action. Insertions and moves remap selections to existing cells. Newly inserted rows/columns remain unselected. Search, filtering, sorting, full data replacement, and worksheet changes reset selection. Pagination and lazy scrolling preserve logical selections, drawing only their visible portions.

Frozen rows/columns, nested headers, sticky footers, and zoom retain independent selection outlines. The fill handle is hidden for disconnected ranges, and selection-based merging rejects them. These restrictions prevent filling or merging unselected gaps.

## Documentation

### Methods

The following methods manage selections in the Jspreadsheet data grid.

#### Main Selection

| Method                               | Description                                                                                                                                                                                                                        |
|--------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `getSelection`                       | Get the coordinates of the main selection.<br/>`getSelection(preserveOrder: Boolean) : Array \| null`                                                                                                                              |
| `getHighlighted`                     | Get the coordinates of the highlighted selections.<br/>`getHighlighted() : Array \| null`                                                                                                                                          |
| `getRange`                           | Get the range description of the highlighted cells.<br/>`getRange() : String \| null`                                                                                                                                              |
| `getSelectedColumns`                 | Get the selected columns.<br/>@param `visibleOnly` - If true, the method returns only visible columns.<br/>`worksheetInstance.getSelectedColumns(visibleOnly?: boolean): number[];`                                                                                                                                                  |
| `getSelectedRows`                    | Get the selected rows.<br/>@param `visibleOnly` - If true, the method returns only visible rows.<br/>`worksheetInstance.getSelectedRows(visibleOnly?: boolean): number[];`                                                                                                                                                        |
| `getSelected`                        | Get the worksheet selected cell names or objects. <br/>@param {Boolean?} columnNameOnly: To get only the cell names as string (true). Get the cell coordinates as an object (false).  `worksheetInstance.getSelected(columnNameOnly: Boolean) => []` |
| `isSelected`                         | Verify if the coordinates given are included in the current selection.<br/>`isSelected(x: Number, y: Number) : Boolean`                                                                                                            |
| `selectAll`                          | Select all cells available in the data grid.<br/>`worksheetInstance.selectAll(): void;`                                                                                                                                                              |
| `updateSelectionFromCoords`{.nowrap} | Select cells based on the given coordinates.<br/>@param `x1` - Column index of the first cell of the selection. If omitted or null, rows "y1" through "y2" are selected.<br/>@param `y1` - Row index of the first cell of the selection. If omitted or null, columns "x1" through "x2" are selected.<br/>@param `x2` - Column index of the last cell of the selection. Default: Parameter "x1".<br/>@param `y2` - Row index of the last cell of the selection. Default: Parameter "y1".<br/>`worksheetInstance.updateSelectionFromCoords: (x1: number \| null, y1: number \| null, x2?: number \| null, y2?: number \| null): void;`                                                                                            |
| `resetSelection`                     | Remove the selection.<br/>@returns If there were highlighted cells, it returns 1, otherwise it returns 0.<br/>`worksheetInstance.resetSelection(): 0 \| 1;`                                                                                                                                                                                |


 ### Selection Events

| Event                        | Description                                                                                                                                                                         |
|------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `onblur`                     | Occurs when the table is blurred.<br/>`onblur(instance: WorksheetInstance): void;`                                                                                                  |
| `onfocus`                    | Occurs when the table is focused.<br/>`onfocus(instance: WorksheetInstance): void;`                                                                                                 |
| `onbeforeselection`{.nowrap} | `onbeforeselection(worksheet: Object, x1: Number, y1: Number, x2: Number, y2: Number, e: MouseEvent) : void`                                                                        |
| `onselection`                | `onselection(instance: WorksheetInstance, borderLeftIndex: number, borderTopIndex: number, borderRightIndex: number, borderBottomIndex: number, origin: Event \| undefined): void;` |

 
### Initial Settings

| Property                | Description                  |
|-------------------------|------------------------------|
| `selectionCopy: boolean`  | Disable the clone selection. |


## Examples

### Programmatically Data Grid Selection

Demonstrates how to select all cells within a worksheet in the grid programmatically.

```html
<html>
<script src="https://bossanova.uk/jspreadsheet/v5/jspreadsheet.js"></script>
<script src="https://jsuites.net/v5/jsuites.js"></script>
<link rel="stylesheet" href="https://bossanova.uk/jspreadsheet/v5/jspreadsheet.css" type="text/css" />
<link rel="stylesheet" href="https://jsuites.net/v5/jsuites.css" type="text/css" />

<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Material+Icons" />

<div id="spreadsheet"></div>

<p>
<input type="button" value="Select all" id="btn1" />
<input type="button" value="updateSelectionFromCoords(2,2,3,3)" id="btn2" /></p>

<script>
// Create the spreadsheet
let table = jspreadsheet(document.getElementById('spreadsheet'), {
    worksheets: [{
        minDimensions: [6,6],
    }],
});

document.getElementById("btn1").onclick = () => table[0].selectAll();
document.getElementById("btn2").onclick = () => table[0].updateSelectionFromCoords(2,2,3,3);
</script>
</html>
```
```jsx
import React, { useRef } from "react";
import { Spreadsheet, Worksheet } from "@jspreadsheet-ce/react";
import "jsuites/dist/jsuites.css";
import "jspreadsheet-ce/dist/jspreadsheet.css";

export default function App() {
    // Spreadsheet array of worksheets
    const spreadsheet = useRef();
    // Render component
    return (
        <>
            <Spreadsheet ref={spreadsheet}>
                <Worksheet minDimensions={[6,6]} />
            </Spreadsheet>
            <button onClick={() => spreadsheet.current[0].selectAll()}>Select all</button>
            <button onClick={() => spreadsheet.current[0].updateSelectionFromCoords(2,2,3,3)}>Select coords (2,2,3,3)</button>
        </>
    );
}
```
```vue
<template>
    <Spreadsheet ref="spreadsheet">
        <Worksheet :minDimensions="[6,6]" />
    </Spreadsheet>
    <input type="button" value="Select all" @click="selectAll" />
    <input type="button" value="Select coords (2,2,3,3)" @click="updateSelectionFromCoords(2,2,3,3)" />
</template>

<script>
import { ref } from 'vue';
import { Spreadsheet, Worksheet } from "@jspreadsheet-ce/vue";
import "jsuites/dist/jsuites.css";
import "jspreadsheet-ce/dist/jspreadsheet.css";

export default {
    components: {
        Spreadsheet,
        Worksheet,
    },
    setup() {
        const spreadsheet = ref(null);

        const updateSelectionFromCoords = (...args) => {
            spreadsheet.value.current[0].updateSelectionFromCoords(...args);
        };

        const selectAll = () => {
            spreadsheet.value.current[0].selectAll();
        };

        return {
            spreadsheet,
            updateSelectionFromCoords,
            selectAll
        };
    }
}
</script>
```
```angularjs
import { Component, ViewChild, ElementRef } from "@angular/core";
import jspreadsheet from "jspreadsheet-ce";

import "jspreadsheet-ce/dist/jspreadsheet.css"
import "jsuites/dist/jsuites.css"

@Component({
    standalone: true,
    selector: "app-root",
    template: `
        <div #spreadsheet></div>
        <input type="button" value="Select all" (click)="this.worksheets[0].selectAll()" />
        <input type="button" value="Select coords (2,2,3,3)" (click)="this.worksheets[0].updateSelectionFromCoords(2,2,3,3)" />`
})
export class AppComponent {
    @ViewChild("spreadsheet") spreadsheet: ElementRef;
    // Worksheets
    worksheets: jspreadsheet.worksheetInstance[];
    // Create a new data grid
    ngAfterViewInit() {
        // Create spreadsheet
        this.worksheets = jspreadsheet(this.spreadsheet.nativeElement, {
            worksheets: [
                {
                    minDimensions: [6,6],
                }
            ]
        });
    }
}
```
