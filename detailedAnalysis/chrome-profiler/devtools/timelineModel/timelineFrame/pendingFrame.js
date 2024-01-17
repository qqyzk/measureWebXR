"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class PendingFrame {
    /**
    * @param {number} triggerTime
    * @param {!Object.<string, number>} timeByCategory
    */
    constructor(triggerTime, timeByCategory) {
        /** @type {!Object.<string, number>} */
        this.timeByCategory = timeByCategory;
        /** @type {!Array.<!TimelineModel.LayerPaintEvent>} */
        this.paints = [];
        /** @type {number|undefined} */
        this.mainFrameId = undefined;
        this.triggerTime = triggerTime;
    }
}
exports.default = PendingFrame;
;
//# sourceMappingURL=pendingFrame.js.map