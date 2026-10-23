/* global sheet */
const { test, expect } = require('@playwright/test');
const path = require('path');

const file = (...parts) => path.join(__dirname, '..', ...parts);
const platformModifier = process.platform === 'darwin' ? 'Meta' : 'Control';

const setup = async (page, options = {}, style = '') => {
    await page.setContent('<body style="margin:40px"><div id="sheet"></div></body>');
    for (const css of [require.resolve('jsuites/dist/jsuites.css'), file('dist/jspreadsheet.css'), file('dist/jspreadsheet.themes.css')]) {
        await page.addStyleTag({ path: css });
    }
    if (style) await page.addStyleTag({ content: style });
    for (const script of [require.resolve('jsuites/dist/jsuites.js'), require.resolve('@jspreadsheet/formula'), file('dist/index.js')]) {
        await page.addScriptTag({ path: script });
    }
    await page.evaluate((options) => {
        window.sheet = jspreadsheet(document.getElementById('sheet'), {
            worksheets: [
                {
                    multipleSelection: true,
                    minDimensions: [8, 30],
                    data: Array.from({ length: 30 }, (_, y) => Array.from({ length: 8 }, (_, x) => `${x}:${y}`)),
                    columns: Array.from({ length: 8 }, () => ({ width: 110 })),
                    ...options,
                },
            ],
        })[0];
    }, options);
    await expect(page.locator('.jss_worksheet')).toBeVisible();
};
const cell = (page, x, y) => page.locator(`tbody td[data-x="${x}"][data-y="${y}"]`);
const selected = (page) => page.evaluate(() => sheet.getSelected(true).sort());

// Browser geometry checks catch problems that jsdom deliberately does not model.
test('modifier clicks, additive drag, Shift and context menu keep independent ranges', async ({ page }) => {
    await setup(page);
    await cell(page, 0, 0).click();
    await cell(page, 3, 3).click({ modifiers: [platformModifier] });
    expect(await selected(page)).toEqual(['A1', 'D4']);
    await cell(page, 0, 0).click({ button: 'right' });
    expect(await selected(page)).toEqual(['A1', 'D4']);
    // jSuites registers open menus on the next timer tick before handling Escape.
    await page.waitForFunction(() => window.jSuitesStateControl.includes(sheet.parent.contextMenu.contextmenu));
    await page.keyboard.press('Escape');
    await expect(page.locator('.jcontextmenu-focus')).toHaveCount(0);
    await cell(page, 0, 0).click();
    await page.keyboard.down(platformModifier);
    const start = await cell(page, 3, 3).boundingBox();
    const end = await cell(page, 4, 4).boundingBox();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up(platformModifier);
    expect(await selected(page)).toEqual(['A1', 'D4', 'D5', 'E4', 'E5']);
    await page.keyboard.press('Shift+ArrowRight');
    expect(await selected(page)).toEqual(['A1', 'D4', 'D5', 'E4', 'E5', 'F4', 'F5']);
    await page.keyboard.press('Delete');
    expect(await page.evaluate(() => [sheet.getValue('A1'), sheet.getValue('B2'), sheet.getValue('F5')])).toEqual(['', '1:1', '']);
});

test('Ctrl/Cmd+Shift+Z redoes changes across separate cells', async ({ page }) => {
    await setup(page);
    await cell(page, 0, 0).click();
    await cell(page, 2, 2).click({ modifiers: [platformModifier] });
    await page.keyboard.press('Delete');
    for (const modifier of ['Control', 'Meta']) {
        await page.keyboard.press(modifier + '+z');
        expect(await page.evaluate(() => [sheet.getValue('A1'), sheet.getValue('C3')])).toEqual(['0:0', '2:2']);
        await page.keyboard.press(modifier + '+Shift+z');
        expect(await page.evaluate(() => [sheet.getValue('A1'), sheet.getValue('C3')])).toEqual(['', '']);
        expect(await selected(page)).toEqual(['A1', 'C3']);
    }
    expect(await page.evaluate(() => sheet.getValue('B2'))).toBe('1:1');
});

test('nested headers and separate row/column headers use the same selection', async ({ page }) => {
    await setup(page, {
        nestedHeaders: [
            [
                { title: 'First group', colspan: 2 },
                { title: 'Middle', colspan: 4 },
                { title: 'Last group', colspan: 2 },
            ],
        ],
    });
    await page.locator('.jss_nested td').filter({ hasText: 'First group' }).click();
    await page
        .locator('.jss_nested td')
        .filter({ hasText: 'Last group' })
        .click({ modifiers: [platformModifier] });
    expect(await page.evaluate(() => sheet.getSelectedColumns())).toEqual([0, 1, 6, 7]);
    await page
        .locator('tbody tr')
        .nth(1)
        .locator('.jss_row')
        .click({ position: { x: 10, y: 8 } });
    await page
        .locator('tbody tr')
        .nth(4)
        .locator('.jss_row')
        .click({ modifiers: [platformModifier], position: { x: 10, y: 8 } });
    expect(await page.evaluate(() => sheet.getSelectedRows())).toEqual([1, 4]);
});

test('modifier drag subtracts a block, restores it when shrinking, and Shift extends an added range', async ({ page }) => {
    await setup(page);
    await cell(page, 0, 0).click();
    await cell(page, 3, 3).click({ modifiers: ['Shift'] });
    await page.keyboard.down(platformModifier);
    const start = await cell(page, 1, 1).boundingBox();
    const end = await cell(page, 2, 2).boundingBox();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 5 });
    expect(await selected(page)).toHaveLength(12);
    expect(await selected(page)).not.toContain('B2');
    expect(await selected(page)).not.toContain('C3');
    await page.mouse.move(end.x + end.width / 2, start.y + start.height / 2, { steps: 3 });
    expect(await selected(page)).toHaveLength(14);
    expect(await selected(page)).toContain('C3');
    await page.mouse.up();
    await page.keyboard.up(platformModifier);
    await cell(page, 2, 2).click({ modifiers: [platformModifier, 'Shift'] });
    expect(await selected(page)).toHaveLength(12);
    expect(await selected(page)).not.toContain('C3');
    await cell(page, 1, 1).click({ modifiers: [platformModifier, 'Shift'] });
    expect(await selected(page)).toHaveLength(15);
    expect(await selected(page)).toContain('C3');
    await cell(page, 2, 1).click({ modifiers: [platformModifier, 'Shift'] });
    expect(await selected(page)).toHaveLength(14);
    await page.keyboard.press('Delete');
    expect(await page.evaluate(() => [sheet.getValue('A1'), sheet.getValue('B2'), sheet.getValue('C2')])).toEqual(['', '1:1', '2:1']);
    await page.keyboard.press(platformModifier + '+z');
    expect(await page.evaluate(() => sheet.getValue('A1'))).toBe('0:0');
    expect(await selected(page)).toHaveLength(14);
    await cell(page, 5, 5).click({ modifiers: [platformModifier] });
    await cell(page, 6, 6).click({ modifiers: [platformModifier, 'Shift'] });
    const names = await selected(page);
    expect(names).toHaveLength(18);
    for (const name of ['F6', 'G6', 'F7', 'G7']) expect(names).toContain(name);
    expect(names).not.toContain('B2');
});

test('modifier drag removes selected rows without selecting intervening gaps again', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => sheet.updateSelectionFromCoords(0, 0, 7, 5));
    const row = (index) => page.locator('tbody tr').nth(index).locator('.jss_row');
    const start = await row(1).boundingBox();
    const end = await row(3).boundingBox();
    await page.keyboard.down(platformModifier);
    await page.mouse.move(start.x + 10, start.y + 8);
    await page.mouse.down();
    await page.mouse.move(end.x + 10, end.y + 8, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up(platformModifier);
    expect(await page.evaluate(() => sheet.getSelectedRows())).toEqual([0, 4, 5]);
});

test('modifier drag can subtract nested header groups backwards including the whole starting group', async ({ page }) => {
    await setup(page, {
        nestedHeaders: [
            [
                { title: 'First', colspan: 2 },
                { title: 'Middle', colspan: 4 },
                { title: 'Last', colspan: 2 },
            ],
        ],
    });
    await page.evaluate(() => sheet.selectAll());
    const start = await page.locator('.jss_nested td').filter({ hasText: 'Last' }).boundingBox();
    const end = await page.locator('.jss_nested td').filter({ hasText: 'First' }).boundingBox();
    await page.keyboard.down(platformModifier);
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up(platformModifier);
    expect(await selected(page)).toEqual([]);
    await page
        .locator('.jss_nested td')
        .filter({ hasText: 'Last' })
        .click({ modifiers: [platformModifier, 'Shift'] });
    expect(await page.evaluate(() => sheet.getSelectedColumns())).toEqual([0, 1, 2, 3, 4, 5]);
    await page
        .locator('.jss_nested td')
        .filter({ hasText: 'Middle' })
        .click({ modifiers: [platformModifier, 'Shift'] });
    expect(await page.evaluate(() => sheet.getSelectedColumns())).toEqual([0, 1]);
});

test('selection overlays and handle do not create scrollbars or shift a centered table', async ({ page }) => {
    await setup(
        page,
        {
            minDimensions: [5, 1],
            columns: [200, 200, 265, 200, 200].map((width) => ({ width, wordWrap: true })),
            data: [['Package', 'Asset', 'Version', 'For', 'Line\n'.repeat(18)]],
            tableOverflow: true,
            tableWidth: '100%',
        },
        '#sheet,.jss_container {width:100%} .jss_content {display:block;width:100%!important;overflow:auto;max-height:700px} .jss_worksheet {margin:auto}'
    );
    const before = await page.evaluate(() => ({ width: sheet.content.clientWidth, height: sheet.content.scrollHeight }));
    await cell(page, 1, 0).click();
    const result = await page.evaluate(() => {
        const target = sheet.records[0][1].element.getBoundingClientRect();
        const border = sheet.highlightBorder.getBoundingClientRect();
        return { dx: border.left - target.left, dy: border.top - target.top, width: sheet.content.clientWidth, height: sheet.content.scrollHeight };
    });
    expect(Math.abs(result.dx)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.dy)).toBeLessThanOrEqual(1);
    expect(result.width).toBe(before.width);
    expect(result.height).toBe(before.height);
});

test('frozen rows and columns, sticky footers and zoom retain separate selections', async ({ page }) => {
    await setup(page, {
        freezeRows: 2,
        freezeColumns: 2,
        stickyFooter: true,
        footers: [['Footer']],
        tableOverflow: true,
        tableWidth: '650px',
        tableHeight: '350px',
        nestedHeaders: [[{ title: 'Group', colspan: 8 }]],
    });
    await page.evaluate(() => {
        sheet.setSelections([
            [0, 0, 0, 0],
            [3, 3, 4, 12],
        ]);
        sheet.setZoom(80);
    });
    await page.evaluate(() => {
        sheet.content.scrollLeft = 140;
        sheet.content.scrollTop = 100;
    });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => sheet.getHighlighted())).toEqual([
        [0, 0, 0, 0],
        [3, 3, 4, 12],
    ]);
    expect(await page.evaluate(() => sheet.corner.style.display)).toBe('none');
    await expect(cell(page, 0, 0)).toHaveClass(/highlight/);
    const geometry = await page.evaluate(() => {
        const overlays = Array.from(document.querySelectorAll('.jss_border_main')).filter((element) => getComputedStyle(element).display !== 'none');
        const first = sheet.records[3][3].element.getBoundingClientRect();
        const last = sheet.records[12][4].element.getBoundingClientRect();
        const frozenRight = sheet.headers[1].getBoundingClientRect().right;
        const frozenBottom = sheet.records[1][1].element.getBoundingClientRect().bottom;
        const footerTop = sheet.tfoot.querySelector('.jss_footer_sticky').getBoundingClientRect().top;
        return {
            actual: overlays.map((element) => {
                const r = element.getBoundingClientRect();
                return [r.left, r.top, r.right, r.bottom];
            }),
            expected: [Math.max(first.left, frozenRight), Math.max(first.top, frozenBottom), last.right, Math.min(last.bottom, footerTop)],
        };
    });
    expect(geometry.actual).toHaveLength(1);
    geometry.actual[0].forEach((value, index) => expect(Math.abs(value - geometry.expected[index])).toBeLessThanOrEqual(1));
});

test('lazy loading preserves logical selections outside mounted rows', async ({ page }) => {
    await setup(page, {
        lazyLoading: true,
        tableOverflow: true,
        tableWidth: '650px',
        tableHeight: '250px',
        data: Array.from({ length: 300 }, (_, y) => [y, y, y]),
        columns: [{ width: 100 }, { width: 100 }, { width: 100 }],
        minDimensions: [3, 300],
    });
    await page.evaluate(() =>
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 250, 2, 250],
        ])
    );
    expect(await selected(page)).toEqual(['A1', 'C251']);
    await page.evaluate(() => {
        sheet.content.scrollTop = 5000;
    });
    await page.waitForTimeout(150);
    expect(await selected(page)).toEqual(['A1', 'C251']);
});

test('selection and copy outlines do not draw internal edges across frozen bands and a merge', async ({ page }) => {
    await setup(page, {
        freezeRows: 2,
        freezeColumns: 2,
        mergeCells: { B2: [2, 2] },
        nestedHeaders: [
            [
                { title: 'First', colspan: 2 },
                { title: 'Middle', colspan: 4 },
                { title: 'Last', colspan: 2 },
            ],
        ],
        tableOverflow: true,
        tableWidth: '760px',
        tableHeight: '350px',
        stickyFooter: true,
        footers: [['Pinned footer']],
    });
    await page.evaluate(() => sheet.updateSelectionFromCoords(0, 1, 5, 6));
    const edges = await page.evaluate(() => {
        const css = getComputedStyle(sheet.highlightBorder);
        const merged = getComputedStyle(sheet.records[1][1].element);
        return {
            top: css.borderTopColor,
            left: css.borderLeftColor,
            right: css.borderRightColor,
            bottom: css.borderBottomColor,
            z: Number(css.zIndex),
            mergedZ: Number(merged.zIndex),
        };
    });
    expect(edges.top).toBe('rgba(0, 0, 0, 0)');
    expect(edges.left).toBe('rgba(0, 0, 0, 0)');
    expect(edges.right).not.toBe('rgba(0, 0, 0, 0)');
    expect(edges.bottom).not.toBe('rgba(0, 0, 0, 0)');
    expect(edges.z).toBeLessThan(edges.mergedZ);
    await page.evaluate(() => sheet.copy());
    const copySizes = await page.evaluate(() =>
        getComputedStyle(sheet.highlightCopy)
            .backgroundSize.split(',')
            .map((part) => part.trim())
    );
    expect(copySizes).toEqual(['8px 0px', '8px 1px', '0px 8px', '1px 8px']);

    // Reused overlay nodes must restore all four edges for a range outside the frozen bands.
    await page.evaluate(() => sheet.updateSelectionFromCoords(3, 3, 5, 6));
    const restored = await page.evaluate(() => {
        const css = getComputedStyle(sheet.highlightBorder);
        return [css.borderTopColor, css.borderLeftColor];
    });
    expect(restored.every((color) => color !== 'rgba(0, 0, 0, 0)')).toBe(true);
});

test('hidden frozen cells do not remove the visible selection perimeter', async ({ page }) => {
    await setup(page, { freezeRows: 2, freezeColumns: 2 });
    await page.evaluate(() => {
        sheet.hideColumn(1);
        sheet.hideRow(1);
        sheet.updateSelectionFromCoords(1, 1, 3, 3);
    });
    const edges = await page.evaluate(() => {
        const css = getComputedStyle(sheet.highlightBorder);
        return [css.borderTopColor, css.borderRightColor, css.borderBottomColor, css.borderLeftColor];
    });
    expect(edges.every((color) => color !== 'rgba(0, 0, 0, 0)')).toBe(true);
});

for (const tableOverflow of [false, true]) {
    test(`zoom repositions the fill handle without requiring a scroll (tableOverflow=${tableOverflow})`, async ({ page }) => {
        await setup(page, { freezeRows: 2, freezeColumns: 2, tableOverflow, tableWidth: '1000px', tableHeight: '550px', mergeCells: { B2: [2, 2] } });
        await page.evaluate(() => sheet.updateSelectionFromCoords(0, 1, 5, 6));
        for (const zoom of [80, 150, 100]) {
            await page.evaluate((zoom) => sheet.setZoom(zoom), zoom);
            await expect
                .poll(() =>
                    page.evaluate(() => {
                        const corner = sheet.corner.getBoundingClientRect();
                        const last = sheet.records[6][5].element.getBoundingClientRect();
                        return Math.max(Math.abs(corner.left + corner.width / 2 - last.right), Math.abs(corner.top + corner.height / 2 - last.bottom));
                    })
                )
                .toBeLessThanOrEqual(1);
            await expect(page.locator('.jss_corner')).toBeVisible();
        }
    });
}

test('pagination hides detached overlays and redraws selections when returning', async ({ page }) => {
    await setup(page, { pagination: 5 });
    await page.evaluate(() =>
        sheet.setSelections([
            [0, 0, 0, 0],
            [2, 11, 2, 11],
        ])
    );
    await page.locator('.jss_page').filter({ hasText: /^3$/ }).click();
    expect(await selected(page)).toEqual(['A1', 'C12']);
    await expect(cell(page, 2, 11)).toHaveClass(/highlight/);
    expect(await page.locator('.jss_border_main:visible').count()).toBe(1);
    await page.locator('.jss_page').filter({ hasText: /^1$/ }).click();
    await expect(cell(page, 0, 0)).toHaveClass(/highlight/);
    expect(await selected(page)).toEqual(['A1', 'C12']);
    expect(await page.locator('.jss_border_main:visible').count()).toBe(1);
});

test('pagination clicks cannot start a cell drag or replace selections across pages', async ({ page }) => {
    await setup(page, { pagination: 10 });
    await cell(page, 0, 0).click();
    await page.evaluate(() => sheet.addSelectionFromCoords(2, 11, 2, 11));
    const pageTwo = await page.locator('.jss_page').filter({ hasText: /^2$/ }).boundingBox();
    await page.mouse.move(pageTwo.x + pageTwo.width / 2, pageTwo.y + pageTwo.height / 2);
    await page.mouse.down();
    await expect(cell(page, 2, 11)).toBeVisible();
    // A held click on a page number must not become a selection drag over the new rows.
    const destination = await cell(page, 4, 12).boundingBox();
    await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(await selected(page)).toEqual(['A1', 'C12']);
    await page.locator('.jss_page').filter({ hasText: /^3$/ }).click();
    expect(await page.locator('.jss_border_main:visible').count()).toBe(0);
    expect(await selected(page)).toEqual(['A1', 'C12']);
    await page.locator('.jss_page').filter({ hasText: /^1$/ }).click();
    await expect(cell(page, 0, 0)).toHaveClass(/highlight/);
    const copied = await page.evaluate(() => {
        sheet.copy();
        return sheet.textarea.value;
    });
    expect(copied).toContain('0:0');
    expect(copied).toContain('2:11');
    await page.keyboard.press('Delete');
    expect(await page.evaluate(() => [sheet.getValue('A1'), sheet.getValue('C12'), sheet.getValue('B1')])).toEqual(['', '', '1:0']);
    await page.keyboard.press(platformModifier + '+z');
    expect(await page.evaluate(() => [sheet.getValue('A1'), sheet.getValue('C12')])).toEqual(['0:0', '2:11']);
    expect(await selected(page)).toEqual(['A1', 'C12']);
});

test('merged cells crossing frozen boundaries retain their full selection and copy perimeter', async ({ page }) => {
    await setup(page, { freezeRows: 2, freezeColumns: 2, mergeCells: { B2: [2, 2] }, tableOverflow: true, tableWidth: '650px', tableHeight: '300px' });
    await page.evaluate(() => {
        sheet.setSelections([
            [1, 1, 1, 1],
            [5, 5, 5, 5],
        ]);
        sheet.copy();
    });
    await page.evaluate(() => {
        sheet.content.scrollLeft = 120;
        sheet.content.scrollTop = 80;
    });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => sheet.getHighlighted())).toEqual([
        [1, 1, 2, 2],
        [5, 5, 5, 5],
    ]);
    await expect(cell(page, 1, 1)).toHaveClass(/highlight/);
    await expect(cell(page, 1, 1)).toHaveClass(/copying/);
    const borders = await cell(page, 1, 1).evaluate((element) => {
        const css = getComputedStyle(element);
        return [css.borderLeftStyle, css.borderTopStyle, css.borderRightStyle, css.borderBottomStyle];
    });
    expect(borders.every((value) => value !== 'none')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(cell(page, 1, 1)).not.toHaveClass(/copying/);
});

test('sparse selection remains responsive on a large virtual worksheet', async ({ page }) => {
    await setup(page, {
        lazyLoading: true,
        tableOverflow: true,
        tableWidth: '650px',
        tableHeight: '300px',
        minDimensions: [20, 1000],
        columns: Array.from({ length: 20 }, () => ({ width: 100 })),
        data: Array.from({ length: 1000 }, (_, y) => Array.from({ length: 20 }, (_, x) => x + y)),
    });
    const result = await page.evaluate(() => {
        const ranges = Array.from({ length: 100 }, (_, index) => [index % 20, index * 9, index % 20, index * 9]);
        const start = performance.now();
        sheet.setSelections(ranges);
        return { elapsed: performance.now() - start, selected: sheet.getSelected().length };
    });
    expect(result.selected).toBe(100);
    expect(result.elapsed).toBeLessThan(3000);
});

test('modifier-clicking a checkbox selects it without changing its value', async ({ page }) => {
    await setup(page, {
        columns: [
            { type: 'checkbox', width: 100 },
            { type: 'checkbox', width: 100 },
        ],
        minDimensions: [2, 3],
        data: [
            [false, false],
            [false, false],
            [false, false],
        ],
    });
    await cell(page, 0, 0).click({ position: { x: 10, y: 8 } });
    await cell(page, 1, 2)
        .locator('input')
        .click({ modifiers: [platformModifier] });
    expect(await selected(page)).toEqual(['A1', 'B3']);
    expect(await page.evaluate(() => sheet.getValue('B3'))).toBe(false);
    await expect(cell(page, 1, 2).locator('input')).not.toBeChecked();
});
