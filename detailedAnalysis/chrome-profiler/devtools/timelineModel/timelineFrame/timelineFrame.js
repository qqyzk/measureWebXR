"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class TimelineFrame {
    /**
    * @param {number} startTime
    * @param {number} startTimeOffset
    */
    constructor(startTime, startTimeOffset) {
        this.startTime = startTime;
        this.startTimeOffset = startTimeOffset;
        this.endTime = this.startTime;
        this.duration = 0;
        this.timeByCategory = {};
        this.cpuTime = 0;
        this.idle = false;
        /** @type {?TimelineModel.TracingFrameLayerTree} */
        this.layerTree = null;
        /** @type {!Array.<!TimelineModel.LayerPaintEvent>} */
        this.paints = [];
        /** @type {number|undefined} */
        this.mainFrameId = undefined;
    }
    /**
    * @return {boolean}
    */
    hasWarnings() {
        return false;
    }
    /**
    * @param {number} endTime
    */
    setEndTime(endTime) {
        this.endTime = endTime;
        this.duration = this.endTime - this.startTime;
    }
    /**
    * @param {?TimelineModel.TracingFrameLayerTree} layerTree
    */
    setLayerTree(layerTree) {
        this.layerTree = layerTree;
    }
    /**
    * @param {!Object} timeByCategory
    */
    addTimeForCategories(timeByCategory) {
        for (const category in timeByCategory) {
            this.addTimeForCategory(category, timeByCategory[category]);
        }
    }
    /**
    * @param {string} category
    * @param {number} time
    */
    addTimeForCategory(category, time) {
        this.timeByCategory[category] = (this.timeByCategory[category] || 0) + time;
        this.cpuTime += time;
    }
}
exports.default = TimelineFrame;
;
//# sourceMappingURL=timelineFrame.js.map