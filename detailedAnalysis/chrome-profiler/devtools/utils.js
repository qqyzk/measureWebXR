"use strict";
/* eslint-disable @typescript-eslint/no-explicit-any */
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Return index of the leftmost element that is greater
 * than the specimen object. If there's no such element (i.e. all
 * elements are smaller or equal to the specimen) returns right bound.
 * The function works for sorted array.
 * When specified, |left| (inclusive) and |right| (exclusive) indices
 * define the search window.
 *
 * @param {!T} object
 * @param {function(!T,!S):number=} comparator
 * @param {number=} left
 * @param {number=} right
 * @return {number}
 * @this {Array.<!S>}
 * @template T,S
 */
function upperBound(self, object, comparator, left, right) {
    function defaultComparator(a, b) {
        return a < b ? -1 : a > b ? 1 : 0;
    }
    comparator = comparator || defaultComparator;
    let l = left || 0;
    let r = right !== undefined ? right : self.length;
    while (l < r) {
        const m = (l + r) >> 1;
        if (comparator(object, self[m]) >= 0) {
            l = m + 1;
        }
        else {
            r = m;
        }
    }
    return r;
}
exports.upperBound = upperBound;
/**
 * Return index of the leftmost element that is equal or greater
 * than the specimen object. If there's no such element (i.e. all
 * elements are smaller than the specimen) returns right bound.
 * The function works for sorted array.
 * When specified, |left| (inclusive) and |right| (exclusive) indices
 * define the search window.
 *
 * @param {!T} object
 * @param {function(!T,!S):number=} comparator
 * @param {number=} left
 * @param {number=} right
 * @return {number}
 * @this {Array.<!S>}
 * @template T,S
 */
function lowerBound(self, object, comparator, left, right) {
    function defaultComparator(a, b) {
        return a < b ? -1 : a > b ? 1 : 0;
    }
    comparator = comparator || defaultComparator;
    let l = left || 0;
    let r = right !== undefined ? right : self.length;
    while (l < r) {
        const m = (l + r) >> 1;
        if (comparator(object, self[m]) > 0) {
            l = m + 1;
        }
        else {
            r = m;
        }
    }
    return r;
}
exports.lowerBound = lowerBound;
/**
 * @param {function(?T, ?T): number=} comparator
 * @return {!Array.<?T>}
 * @this {Array.<?T>}
 * @template T
 */
function stableSort(that, comparator) {
    function defaultComparator(a, b) {
        return a < b ? -1 : a > b ? 1 : 0;
    }
    comparator = comparator || defaultComparator;
    const indices = new Array(that.length);
    for (let i = 0; i < that.length; ++i) {
        indices[i] = i;
    }
    const self = that;
    /**
     * @param {number} a
     * @param {number} b
     * @return {number}
     */
    function indexComparator(a, b) {
        const result = comparator(self[a], self[b]);
        return result ? result : a - b;
    }
    indices.sort(indexComparator);
    for (let i = 0; i < that.length; ++i) {
        if (indices[i] < 0 || i === indices[i]) {
            continue;
        }
        let cyclical = i;
        const saved = that[i];
        while (true) {
            const next = indices[cyclical];
            indices[cyclical] = -1;
            if (next === i) {
                that[cyclical] = saved;
                break;
            }
            else {
                that[cyclical] = that[next];
                cyclical = next;
            }
        }
    }
    return that;
}
exports.stableSort = stableSort;
function pushAll(self, newData) {
    for (let i = 0; i < newData.length; ++i) {
        self.push(newData[i]);
    }
    return newData;
}
exports.pushAll = pushAll;
/**
 * @param {!Array.<T>} array1
 * @param {!Array.<T>} array2
 * @param {function(T,T):number} comparator
 * @param {boolean} mergeNotIntersect
 * @return {!Array.<T>}
 * @template T
 */
function mergeOrIntersect(array1, array2, comparator, mergeNotIntersect) {
    const result = [];
    let i = 0;
    let j = 0;
    while (i < array1.length && j < array2.length) {
        const compareValue = comparator(array1[i], array2[j]);
        if (mergeNotIntersect || !compareValue) {
            result.push(compareValue <= 0 ? array1[i] : array2[j]);
        }
        if (compareValue <= 0) {
            i++;
        }
        if (compareValue >= 0) {
            j++;
        }
    }
    if (mergeNotIntersect) {
        while (i < array1.length) {
            result.push(array1[i++]);
        }
        while (j < array2.length) {
            result.push(array2[j++]);
        }
    }
    return result;
}
exports.mergeOrIntersect = mergeOrIntersect;
/**
 * @param {!number} frameDuration
 * @return {!number}
 */
function calcFPS(frameDuration) {
    return 1000 / frameDuration;
}
exports.calcFPS = calcFPS;
/**
 * @param {!T} value
 * @param {function(!T,!S):number} comparator
 * @return {number}
 * @this {Array.<!S>}
 * @template T,S
 */
function binaryIndexOf(array1, value, comparator) {
    const index = lowerBound(array1, value, comparator);
    return index < array1.length && comparator(value, array1[index]) === 0 ? index : -1;
}
exports.binaryIndexOf = binaryIndexOf;
/**
 * @param {!T} value
 * @param {boolean=} firstOnly
 * @return {boolean}
 * @this {Array.<!T>}
 * @template T
 */
function remove(array1, value, firstOnly) {
    let index = array1.indexOf(value);
    if (index === -1) {
        return false;
    }
    if (firstOnly) {
        array1.splice(index, 1);
        return true;
    }
    for (let i = index + 1, n = array1.length; i < n; ++i) {
        if (array1[i] !== value) {
            array1[index++] = array1[i];
        }
    }
    array1.length = index;
    return true;
}
exports.remove = remove;
/**
 * @param {number} num
 * @param {number} min
 * @param {number} max
 * @return {number}
 */
function constrain(num, min, max) {
    if (num < min) {
        num = min;
    }
    else if (num > max) {
        num = max;
    }
    return num;
}
exports.constrain = constrain;
;
//# sourceMappingURL=utils.js.map