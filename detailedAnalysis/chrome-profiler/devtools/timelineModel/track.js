"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const event_1 = __importDefault(require("../tracingModel/event"));
const tracingModel_1 = require("../tracingModel");
var TrackType;
(function (TrackType) {
    TrackType[TrackType["MainThread"] = 0] = "MainThread";
    TrackType[TrackType["Worker"] = 1] = "Worker";
    TrackType[TrackType["Input"] = 2] = "Input";
    TrackType[TrackType["Animation"] = 3] = "Animation";
    TrackType[TrackType["Timings"] = 4] = "Timings";
    TrackType[TrackType["Console"] = 5] = "Console";
    TrackType[TrackType["Raster"] = 6] = "Raster";
    TrackType[TrackType["GPU"] = 7] = "GPU";
    TrackType[TrackType["Other"] = 8] = "Other";
})(TrackType = exports.TrackType || (exports.TrackType = {}));
class Track {
    constructor() {
        this.name = '';
        this.url = '';
        this.type = TrackType.Other;
        this.asyncEvents = [];
        this.tasks = [];
        this._syncEvents = null;
        this.thread = null;
        // TODO(dgozman): replace forMainFrame with a list of frames, urls and time ranges.
        this.forMainFrame = false;
        // TODO(dgozman): do not distinguish between sync and async events.
        this.events = [];
    }
    /**
     * @return {!Array<!TracingModel.Event>}
     */
    syncEvents() {
        if (this.events.length) {
            return this.events;
        }
        if (this._syncEvents) {
            return this._syncEvents;
        }
        const stack = [];
        this._syncEvents = [];
        for (const event of this.asyncEvents) {
            const startTime = event.startTime;
            const endTime = event.endTime;
            while (stack.length && startTime >= stack[stack.length - 1].endTime) {
                stack.pop();
            }
            if (stack.length && endTime > stack[stack.length - 1].endTime) {
                this._syncEvents = [];
                break;
            }
            const syncEvent = new event_1.default(event.categoriesString, event.name, tracingModel_1.Phase.Complete, startTime, event.thread);
            syncEvent.setEndTime(endTime);
            syncEvent.addArgs(event.args);
            this._syncEvents.push(syncEvent);
            stack.push(syncEvent);
        }
        return this._syncEvents;
    }
}
exports.default = Track;
//# sourceMappingURL=track.js.map