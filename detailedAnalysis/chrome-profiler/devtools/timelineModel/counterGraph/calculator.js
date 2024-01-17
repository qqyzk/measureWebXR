"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @implements {PerfUI.TimelineGrid.Calculator}
 * @unrestricted
 */
class Calculator {
    /**
     * @param {number} time
     */
    setZeroTime(time) {
        this._zeroTime = time;
    }
    /**
     * @override
     * @param {number} time
     * @return {number}
     */
    computePosition(time) {
        return ((time - this._minimumBoundary) / this.boundarySpan()) * this._workingArea;
    }
    setWindow(minimumBoundary, maximumBoundary) {
        this._minimumBoundary = minimumBoundary;
        this._maximumBoundary = maximumBoundary;
    }
    /**
     * @param {number} clientWidth
     */
    setDisplayWidth(clientWidth) {
        this._workingArea = clientWidth;
    }
    /**
     * @override
     * @return {number}
     */
    maximumBoundary() {
        return this._maximumBoundary;
    }
    /**
     * @override
     * @return {number}
     */
    minimumBoundary() {
        return this._minimumBoundary;
    }
    /**
     * @override
     * @return {number}
     */
    zeroTime() {
        return this._zeroTime;
    }
    /**
     * @override
     * @return {number}
     */
    boundarySpan() {
        return this._maximumBoundary - this._minimumBoundary;
    }
}
exports.default = Calculator;
//# sourceMappingURL=calculator.js.map