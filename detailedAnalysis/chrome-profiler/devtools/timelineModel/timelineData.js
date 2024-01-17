"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class TimelineData {
    constructor() {
        this.warning = null;
        this.previewElement = null;
        this.url = null;
        this.backendNodeId = 0;
        this.stackTrace = null;
        this.picture = null;
        this._initiator = null;
        this.frameId = '';
        this.timeWaitingForMainThread;
    }
    /**
     * @param {!SDK.TracingModel.Event} initiator
     */
    setInitiator(initiator) {
        this._initiator = initiator;
        if (!initiator || this.url) {
            return;
        }
        const initiatorURL = TimelineData.forEvent(initiator).url;
        if (initiatorURL) {
            this.url = initiatorURL;
        }
    }
    /**
     * @return {?SDK.TracingModel.Event}
     */
    initiator() {
        return this._initiator;
    }
    /**
     * @return {?Protocol.Runtime.CallFrame}
     */
    topFrame() {
        const stackTrace = this.stackTraceForSelfOrInitiator();
        return (stackTrace && stackTrace[0]) || null;
    }
    /**
     * @return {?Array<!Protocol.Runtime.CallFrame>}
     */
    stackTraceForSelfOrInitiator() {
        return (this.stackTrace ||
            (this._initiator &&
                TimelineData.forEvent(this._initiator).stackTrace));
    }
    /**
     * @param {!SDK.TracingModel.Event} event
     * @return {!TimelineModel.TimelineData}
     */
    static forEvent(event) {
        let data = event[TimelineData.timelineDataSymbol];
        if (!data) {
            data = new TimelineData();
            event[TimelineData.timelineDataSymbol] = data;
        }
        return data;
    }
}
exports.default = TimelineData;
TimelineData.timelineDataSymbol = Symbol('timelineData');
//# sourceMappingURL=timelineData.js.map