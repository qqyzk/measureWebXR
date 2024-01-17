"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("../../types");
class TimelineSelection {
    /**
     * @param {!Timeline.TimelineSelection.Type} type
     * @param {number} startTime
     * @param {number} endTime
     * @param {!Object=} object
     */
    constructor(type, startTime, endTime, object) {
        this._type = type;
        this._startTime = startTime;
        this._endTime = endTime;
        this._object = object || null;
    }
    /**
     * @param {!TimelineModel.TimelineFrame} frame
     * @return {!Timeline.TimelineSelection}
     */
    static fromFrame(frame) {
        return new TimelineSelection(types_1.TimelineSelectionType.Frame, frame.startTime, frame.endTime, frame);
    }
    /**
     * @param {!TimelineModel.TimelineModel.NetworkRequest} request
     * @return {!Timeline.TimelineSelection}
     */
    static fromNetworkRequest(request) {
        return new TimelineSelection(types_1.TimelineSelectionType.NetworkRequest, request.startTime, request.endTime || request.startTime, request);
    }
    /**
     * @param {!SDK.TracingModel.Event} event
     * @return {!Timeline.TimelineSelection}
     */
    static fromTraceEvent(event) {
        return new TimelineSelection(types_1.TimelineSelectionType.TraceEvent, event.startTime, event.endTime || event.startTime + 1, event);
    }
    /**
     * @param {number} startTime
     * @param {number} endTime
     * @return {!Timeline.TimelineSelection}
     */
    static fromRange(startTime, endTime) {
        return new TimelineSelection(types_1.TimelineSelectionType.Range, startTime, endTime);
    }
    /**
     * @return {!Timeline.TimelineSelection.Type}
     */
    type() {
        return this._type;
    }
    /**
     * @return {?Object}
     */
    object() {
        return this._object;
    }
    /**
     * @return {number}
     */
    startTime() {
        return this._startTime;
    }
    /**
     * @return {number}
     */
    endTime() {
        return this._endTime;
    }
}
exports.default = TimelineSelection;
//# sourceMappingURL=timelineSelection.js.map