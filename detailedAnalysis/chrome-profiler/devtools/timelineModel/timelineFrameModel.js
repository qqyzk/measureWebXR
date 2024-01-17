"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const timelineFrame_1 = __importDefault(require("./timelineFrame/timelineFrame"));
const utils_1 = require("../utils");
const types_1 = require("../types");
const tracingFrameLayerTree_1 = __importDefault(require("./timelineFrame/tracingFrameLayerTree"));
const pendingFrame_1 = __importDefault(require("./timelineFrame/pendingFrame"));
const tracingModel_1 = __importStar(require("../tracingModel"));
const layerPaintEvent_1 = __importDefault(require("./timelineFrame/layerPaintEvent"));
const timelineData_1 = __importDefault(require("./timelineData"));
class TimelineFrameModel {
    /**
     * @param {function(!SDK.TracingModel.Event):string} categoryMapper
     */
    constructor(categoryMapper) {
        this._categoryMapper = categoryMapper;
        this._mainFrameMarkers = [
            types_1.RecordType.ScheduleStyleRecalculation,
            types_1.RecordType.InvalidateLayout,
            types_1.RecordType.BeginMainThreadFrame,
            types_1.RecordType.ScrollLayer,
        ];
        this.reset();
    }
    /**
     * @param {number=} startTime
     * @param {number=} endTime
     * @return {!Array<!TimelineModel.TimelineFrame>}
     */
    frames(startTime, endTime) {
        if (!startTime && !endTime) {
            return this._frames;
        }
        const firstFrame = utils_1.lowerBound(this._frames, startTime || 0, (time, frame) => time - frame.endTime);
        const lastFrame = utils_1.lowerBound(this._frames, endTime || Infinity, (time, frame) => time - frame.startTime);
        return this._frames.slice(firstFrame, lastFrame);
    }
    /**
     * @param {!SDK.TracingModel.Event} rasterTask
     * @return {boolean}
     */
    hasRasterTile(rasterTask) {
        const data = rasterTask.args['tileData'];
        if (!data) {
            return false;
        }
        const frameId = data['sourceFrameNumber'];
        const frame = frameId && this._frameById[frameId];
        if (!frame || !frame.layerTree) {
            return false;
        }
        return true;
    }
    reset() {
        this._minimumRecordTime = Infinity;
        this._frames = [];
        this._frameById = {};
        this._lastFrame = null;
        this._lastLayerTree = null;
        this._mainFrameCommitted = false;
        this._mainFrameRequested = false;
        this._framePendingCommit = null;
        this._lastBeginFrame = null;
        this._lastNeedsBeginFrame = null;
        this._framePendingActivation = null;
        this._lastTaskBeginTime = null;
        this._target = null;
        this._layerTreeId = null;
        this._currentTaskTimeByCategory = {};
    }
    /**
     * @param {number} startTime
     */
    handleBeginFrame(startTime) {
        if (!this._lastFrame) {
            this._startFrame(startTime);
        }
        this._lastBeginFrame = startTime;
    }
    /**
     * @param {number} startTime
     */
    handleDrawFrame(startTime) {
        if (!this._lastFrame) {
            this._startFrame(startTime);
            return;
        }
        // - if it wasn't drawn, it didn't happen!
        // - only show frames that either did not wait for the main thread frame or had one committed.
        if (this._mainFrameCommitted || !this._mainFrameRequested) {
            if (this._lastNeedsBeginFrame) {
                const idleTimeEnd = this._framePendingActivation
                    ? this._framePendingActivation.triggerTime
                    : this._lastBeginFrame || this._lastNeedsBeginFrame;
                if (idleTimeEnd > this._lastFrame.startTime) {
                    this._lastFrame.idle = true;
                    this._startFrame(idleTimeEnd);
                    if (this._framePendingActivation) {
                        this._commitPendingFrame();
                    }
                    this._lastBeginFrame = null;
                }
                this._lastNeedsBeginFrame = null;
            }
            this._startFrame(startTime);
        }
        this._mainFrameCommitted = false;
    }
    handleActivateLayerTree() {
        if (!this._lastFrame) {
            return;
        }
        if (this._framePendingActivation && !this._lastNeedsBeginFrame) {
            this._commitPendingFrame();
        }
    }
    handleRequestMainThreadFrame() {
        if (!this._lastFrame) {
            return;
        }
        this._mainFrameRequested = true;
    }
    handleCompositeLayers() {
        if (!this._framePendingCommit) {
            return;
        }
        this._framePendingActivation = this._framePendingCommit;
        this._framePendingCommit = null;
        this._mainFrameRequested = false;
        this._mainFrameCommitted = true;
    }
    /**
     * @param {!TimelineModel.TracingFrameLayerTree} layerTree
     */
    handleLayerTreeSnapshot(layerTree) {
        this._lastLayerTree = layerTree;
    }
    /**
     * @param {number} startTime
     * @param {boolean} needsBeginFrame
     */
    handleNeedFrameChanged(startTime, needsBeginFrame) {
        if (needsBeginFrame) {
            this._lastNeedsBeginFrame = startTime;
        }
    }
    /**
     * @param {number} startTime
     */
    _startFrame(startTime) {
        if (this._lastFrame) {
            this._flushFrame(this._lastFrame, startTime);
        }
        this._lastFrame = new timelineFrame_1.default(startTime, startTime - this._minimumRecordTime);
    }
    /**
     * @param {!TimelineModel.TimelineFrame} frame
     * @param {number} endTime
     */
    _flushFrame(frame, endTime) {
        frame.setLayerTree(this._lastLayerTree);
        frame.setEndTime(endTime);
        if (this._lastLayerTree) {
            this._lastLayerTree.setPaints(frame.paints);
        }
        if (this._frames.length &&
            (frame.startTime !== this._frames[this._frames.length - 1].endTime ||
                frame.startTime > frame.endTime)) {
            console.assert(false, `Inconsistent frame time for frame ${this._frames.length} (${frame.startTime} - ${frame.endTime})`);
        }
        this._frames.push(frame);
        if (typeof frame.mainFrameId === 'number') {
            this._frameById[frame.mainFrameId] = frame;
        }
    }
    _commitPendingFrame() {
        this._lastFrame.addTimeForCategories(this._framePendingActivation.timeByCategory);
        this._lastFrame.paints = this._framePendingActivation.paints;
        this._lastFrame.mainFrameId = this._framePendingActivation.mainFrameId;
        this._framePendingActivation = null;
    }
    /**
     * @param {?SDK.Target} target
     * @param {!Array.<!SDK.TracingModel.Event>} events
     * @param {!Array<!{thread: !SDK.TracingModel.Thread, time: number}>} threadData
     */
    addTraceEvents(target, events, threadData) {
        this._target = target;
        let j = 0;
        this._currentProcessMainThread = (threadData.length && threadData[0].thread) || null;
        for (let i = 0; i < events.length; ++i) {
            while (j + 1 < threadData.length && threadData[j + 1].time <= events[i].startTime) {
                this._currentProcessMainThread = threadData[++j].thread;
            }
            this._addTraceEvent(events[i]);
        }
        this._currentProcessMainThread = null;
    }
    /**
     * @param {!SDK.TracingModel.Event} event
     */
    _addTraceEvent(event) {
        const eventNames = types_1.RecordType;
        if (event.startTime && event.startTime < this._minimumRecordTime) {
            this._minimumRecordTime = event.startTime;
        }
        if (event.name === eventNames.SetLayerTreeId) {
            this._layerTreeId = event.args['layerTreeId'] || event.args['data']['layerTreeId'];
        }
        else if (event.phase === tracingModel_1.Phase.SnapshotObject &&
            event.name === eventNames.LayerTreeHostImplSnapshot &&
            parseInt(event.id, 0) === this._layerTreeId) {
            // todo fix type here
            const snapshot = event;
            this.handleLayerTreeSnapshot(new tracingFrameLayerTree_1.default(this._target, snapshot));
        }
        else {
            this._processCompositorEvents(event);
            if (event.thread === this._currentProcessMainThread) {
                this._addMainThreadTraceEvent(event);
            }
            // else if (this._lastFrame && event.selfTime && !TracingModel.isTopLevelEvent(event))
            //   this._lastFrame.addTimeForCategory(this._categoryMapper(event), event.selfTime);
        }
    }
    /**
     * @param {!SDK.TracingModel.Event} event
     */
    _processCompositorEvents(event) {
        const eventNames = types_1.RecordType;
        if (event.args['layerTreeId'] !== this._layerTreeId) {
            return;
        }
        const timestamp = event.startTime;
        if (event.name === eventNames.BeginFrame) {
            this.handleBeginFrame(timestamp);
        }
        else if (event.name === eventNames.DrawFrame) {
            this.handleDrawFrame(timestamp);
        }
        else if (event.name === eventNames.ActivateLayerTree) {
            this.handleActivateLayerTree();
        }
        else if (event.name === eventNames.RequestMainThreadFrame) {
            this.handleRequestMainThreadFrame();
        }
        else if (event.name === eventNames.NeedsBeginFrameChanged) {
            this.handleNeedFrameChanged(timestamp, event.args['data'] && event.args['data']['needsBeginFrame']);
        }
    }
    /**
     * @param {!SDK.TracingModel.Event} event
     */
    _addMainThreadTraceEvent(event) {
        const eventNames = types_1.RecordType;
        if (tracingModel_1.default.isTopLevelEvent(event)) {
            this._currentTaskTimeByCategory = {};
            this._lastTaskBeginTime = event.startTime;
        }
        if (!this._framePendingCommit && this._mainFrameMarkers.indexOf(event.name) >= 0) {
            this._framePendingCommit = new pendingFrame_1.default(this._lastTaskBeginTime || event.startTime, this._currentTaskTimeByCategory);
        }
        if (!this._framePendingCommit) {
            this._addTimeForCategory(this._currentTaskTimeByCategory, event);
            return;
        }
        this._addTimeForCategory(this._framePendingCommit.timeByCategory, event);
        if (event.name === eventNames.BeginMainThreadFrame &&
            event.args['data'] &&
            event.args['data']['frameId']) {
            this._framePendingCommit.mainFrameId = event.args['data']['frameId'];
        }
        if (event.name === eventNames.Paint &&
            event.args['data']['layerId'] &&
            timelineData_1.default.forEvent(event).picture &&
            this._target) {
            this._framePendingCommit.paints.push(new layerPaintEvent_1.default(event));
        }
        if (event.name === eventNames.CompositeLayers &&
            event.args['layerTreeId'] === this._layerTreeId) {
            this.handleCompositeLayers();
        }
    }
    /**
     * @param {!Object.<string, number>} timeByCategory
     * @param {!SDK.TracingModel.Event} event
     */
    _addTimeForCategory(timeByCategory, event) {
        if (!event.selfTime) {
            return;
        }
        // const categoryName = this._categoryMapper(event);
        // timeByCategory[categoryName] = (timeByCategory[categoryName] || 0) + event.selfTime;
    }
}
exports.default = TimelineFrameModel;
//# sourceMappingURL=timelineFrameModel.js.map