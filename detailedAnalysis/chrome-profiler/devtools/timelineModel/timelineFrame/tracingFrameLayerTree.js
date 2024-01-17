"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class TracingFrameLayerTree {
    /**
     * @param {!SDK.Target} target
     * @param {!SDK.TracingModel.ObjectSnapshot} snapshot
     */
    constructor(target, snapshot) {
        this._snapshot = snapshot;
        /** @type {!Array<!TimelineModel.LayerPaintEvent>|undefined} */
        this._paints;
    }
    /**
     * @return {!Array<!TimelineModel.LayerPaintEvent>}
     */
    paints() {
        return this._paints || [];
    }
    /**
     * @param {!Array<!TimelineModel.LayerPaintEvent>} paints
     */
    setPaints(paints) {
        this._paints = paints;
    }
}
exports.default = TracingFrameLayerTree;
;
//# sourceMappingURL=tracingFrameLayerTree.js.map