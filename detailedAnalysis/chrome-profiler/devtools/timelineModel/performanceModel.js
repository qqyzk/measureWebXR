"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const _1 = __importDefault(require("."));
const timelineFrameModel_1 = __importDefault(require("./timelineFrameModel"));
const track_1 = require("./track");
class PerformanceModel {
    constructor() {
        /** @type {?SDK.Target} */
        this._mainTarget = null;
        /** @type {?SDK.TracingModel} */
        this._tracingModel = null;
        this._timelineModel = new _1.default();
        /** @type {!Array<!{title: string, model: !SDK.TracingModel, timeOffset: number}>} */
        this._extensionTracingModels = [];
        /** @type {number|undefined} */
        this._recordStartTime = undefined;
        this._frameModel = new timelineFrameModel_1.default();
    }
    /**
     * @param {number} time
     */
    setRecordStartTime(time) {
        this._recordStartTime = time;
    }
    /**
     * @return {number|undefined}
     */
    recordStartTime() {
        return this._recordStartTime;
    }
    /**
     * @param {!SDK.TracingModel} model
     */
    setTracingModel(model) {
        this._tracingModel = model;
        this._timelineModel.setEvents(model);
        let inputEvents = null;
        let animationEvents = null;
        for (const track of this._timelineModel.tracks()) {
            if (track.type === track_1.TrackType.Input) {
                inputEvents = track.asyncEvents;
            }
            if (track.type === track_1.TrackType.Animation) {
                animationEvents = track.asyncEvents;
            }
        }
        const mainTracks = this._timelineModel
            .tracks()
            .filter((track) => track.type === track_1.TrackType.MainThread && track.forMainFrame && track.events.length);
        const threadData = mainTracks.map((track) => {
            const event = track.events[0];
            return { thread: event.thread, time: event.startTime };
        });
        this._frameModel.addTraceEvents(this._mainTarget, this._timelineModel.inspectedTargetEvents(), threadData);
        for (const entry of this._extensionTracingModels) {
            entry.model.adjustTime(this._tracingModel.minimumRecordTime() + entry.timeOffset / 1000 - this._recordStartTime);
        }
        this._autoWindowTimes();
    }
    /**
     * @param {string} title
     * @param {!SDK.TracingModel} model
     * @param {number} timeOffset
     */
    addExtensionEvents(title, model, timeOffset) {
        this._extensionTracingModels.push({ model: model, title: title, timeOffset: timeOffset });
        if (!this._tracingModel) {
            return;
        }
        model.adjustTime(this._tracingModel.minimumRecordTime() + timeOffset / 1000 - this._recordStartTime);
    }
    /**
     * @return {!SDK.TracingModel}
     */
    tracingModel() {
        if (!this._tracingModel) {
            throw new Error('call setTracingModel before accessing PerformanceModel');
        }
        return this._tracingModel;
    }
    /**
     * @return {!TimelineModel.TimelineModel}
     */
    timelineModel() {
        return this._timelineModel;
    }
    /**
     * @return {!Array<!TimelineModel.TimelineFrame>} frames
     */
    frames() {
        return this._frameModel.frames();
    }
    /**
     * @return {!TimelineModel.TimelineFrameModel} frames
     */
    frameModel() {
        return this._frameModel;
    }
    /**
     * @param {!Timeline.PerformanceModel.Window} window
     * @param {boolean=} animate
     */
    setWindow(option) {
        this.startTime = option.left;
        this.endTime = option.right;
    }
    _autoWindowTimes() {
        const timelineModel = this._timelineModel;
        let tasks = [];
        for (const track of timelineModel.tracks()) {
            // Deliberately pick up last main frame's track.
            if (track.type === track_1.TrackType.MainThread && track.forMainFrame) {
                tasks = track.tasks;
            }
        }
        if (!tasks.length) {
            this.setWindow({ left: timelineModel.minimumRecordTime(), right: timelineModel.maximumRecordTime() });
            return;
        }
        /**
         * @param {number} startIndex
         * @param {number} stopIndex
         * @return {number}
         */
        function findLowUtilizationRegion(startIndex, stopIndex) {
            const /** @const */ threshold = 0.1;
            let cutIndex = startIndex;
            let cutTime = (tasks[cutIndex].startTime + tasks[cutIndex].endTime) / 2;
            let usedTime = 0;
            const step = Math.sign(stopIndex - startIndex);
            for (let i = startIndex; i !== stopIndex; i += step) {
                const task = tasks[i];
                const taskTime = (task.startTime + task.endTime) / 2;
                const interval = Math.abs(cutTime - taskTime);
                if (usedTime < threshold * interval) {
                    cutIndex = i;
                    cutTime = taskTime;
                    usedTime = 0;
                }
                usedTime += task.duration;
            }
            return cutIndex;
        }
        const rightIndex = findLowUtilizationRegion(tasks.length - 1, 0);
        const leftIndex = findLowUtilizationRegion(0, rightIndex);
        let leftTime = tasks[leftIndex].startTime;
        let rightTime = tasks[rightIndex].endTime;
        const span = rightTime - leftTime;
        const totalSpan = timelineModel.maximumRecordTime() - timelineModel.minimumRecordTime();
        if (span < totalSpan * 0.1) {
            leftTime = timelineModel.minimumRecordTime();
            rightTime = timelineModel.maximumRecordTime();
        }
        else {
            leftTime = Math.max(leftTime - 0.05 * span, timelineModel.minimumRecordTime());
            rightTime = Math.min(rightTime + 0.05 * span, timelineModel.maximumRecordTime());
        }
        this.setWindow({ left: leftTime, right: rightTime });
    }
}
exports.default = PerformanceModel;
//# sourceMappingURL=performanceModel.js.map