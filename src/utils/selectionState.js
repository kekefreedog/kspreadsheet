import { getIdFromColumnName } from './internalHelpers.js';

/**
 * Rectangle operations keep selection state independent from mounted table rows.
 */
export const orderRange = (range) => [Math.min(range[0], range[2]), Math.min(range[1], range[3]), Math.max(range[0], range[2]), Math.max(range[1], range[3])];

export const intersectsRange = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

export const isCellInRanges = (ranges, x, y) => ranges.some((range) => x >= range[0] && x <= range[2] && y >= range[1] && y <= range[3]);

/** Remove a rectangle without ever selecting cells between separate ranges. */
export const subtractRange = function (range, removed) {
    if (!intersectsRange(range, removed)) return [range.slice()];

    const x1 = Math.max(range[0], removed[0]);
    const y1 = Math.max(range[1], removed[1]);
    const x2 = Math.min(range[2], removed[2]);
    const y2 = Math.min(range[3], removed[3]);
    const result = [];
    if (range[1] < y1) result.push([range[0], range[1], range[2], y1 - 1]);
    if (range[3] > y2) result.push([range[0], y2 + 1, range[2], range[3]]);
    if (range[0] < x1) result.push([range[0], y1, x1 - 1, y2]);
    if (range[2] > x2) result.push([x2 + 1, y1, range[2], y2]);
    return result;
};

/** Clamp coordinates and expand each intersected merged cell as a whole. */
export const normalizeSelectionRange = function (obj, coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2 || !obj.headers.length || !obj.rows.length) return null;

    let [x1, y1, x2, y2] = coordinates;
    if (y1 == null) {
        if (x1 == null) return null;
        y1 = 0;
        y2 = obj.rows.length - 1;
    } else if (x1 == null) {
        x1 = 0;
        x2 = obj.headers.length - 1;
    }
    if (x2 == null) x2 = x1;
    if (y2 == null) y2 = y1;

    const clamp = (value, maximum) => Math.max(0, Math.min(parseInt(value) || 0, maximum));
    const directional = [clamp(x1, obj.headers.length - 1), clamp(y1, obj.rows.length - 1), clamp(x2, obj.headers.length - 1), clamp(y2, obj.rows.length - 1)];
    const range = orderRange(directional);
    const merges = Object.entries(obj.options.mergeCells || {}).map(([name, size]) => {
        const [x, y] = getIdFromColumnName(name, true);
        return [x, y, Math.min(obj.headers.length - 1, x + size[0] - 1), Math.min(obj.rows.length - 1, y + size[1] - 1)];
    });

    let expanded;
    do {
        expanded = false;
        for (const merge of merges) {
            if (intersectsRange(range, merge)) {
                const next = [Math.min(range[0], merge[0]), Math.min(range[1], merge[1]), Math.max(range[2], merge[2]), Math.max(range[3], merge[3])];
                if (next.some((value, index) => value !== range[index])) {
                    range.splice(0, 4, ...next);
                    expanded = true;
                }
            }
        }
    } while (expanded);

    return {
        range,
        directional: [
            directional[0] <= directional[2] ? range[0] : range[2],
            directional[1] <= directional[3] ? range[1] : range[3],
            directional[0] <= directional[2] ? range[2] : range[0],
            directional[1] <= directional[3] ? range[3] : range[1],
        ],
    };
};

/** Build a disjoint union, then join adjacent rectangles with matching spans. */
export const unionRanges = function (ranges) {
    const result = [];
    for (const input of ranges) {
        let parts = [orderRange(input)];
        for (const existing of result) parts = parts.flatMap((range) => subtractRange(range, existing));
        result.push(...parts);
    }

    let merged;
    do {
        merged = false;
        outer: for (let i = 0; i < result.length; i++) {
            for (let j = i + 1; j < result.length; j++) {
                const a = result[i];
                const b = result[j];
                if (
                    (a[1] === b[1] && a[3] === b[3] && (a[2] + 1 === b[0] || b[2] + 1 === a[0])) ||
                    (a[0] === b[0] && a[2] === b[2] && (a[3] + 1 === b[1] || b[3] + 1 === a[1]))
                ) {
                    result[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
                    result.splice(j, 1);
                    merged = true;
                    break outer;
                }
            }
        }
    } while (merged);

    return result.sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[3] - b[3] || a[2] - b[2]);
};
