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
const event_1 = __importDefault(require("./event"));
const namedObject_1 = __importDefault(require("./namedObject"));
const objectSnapshot_1 = __importDefault(require("./objectSnapshot"));
const _1 = __importStar(require("./"));
const utils_1 = require("../utils");
class Thread extends namedObject_1.default {
    /**
     * @param {!Process} process
     * @param {number} id
     */
    constructor(process, id) {
        super(process.model, id);
        this._process = process;
        this._events = [];
        this._asyncEvents = [];
        this._lastTopLevelEvent = null;
    }
    tracingComplete() {
        utils_1.stableSort(this._asyncEvents, event_1.default.compareStartTime);
        utils_1.stableSort(this._events, event_1.default.compareStartTime);
        const phases = _1.Phase;
        const stack = [];
        for (let i = 0; i < this._events.length; ++i) {
            const e = this._events[i];
            e.ordinal = i;
            switch (e.phase) {
                case phases.End:
                    this._events[i] = null; // Mark for removal.
                    // Quietly ignore unbalanced close events, they're legit (we could have missed start one).
                    if (!stack.length) {
                        continue;
                    }
                    const top = stack.pop();
                    if (top.name !== e.name || top.categoriesString !== e.categoriesString) {
                        console.error('B/E events mismatch at ' + top.startTime + ' (' + top.name + ') vs. ' + e.startTime + ' (' + e.name +
                            ')');
                    }
                    else {
                        top._complete(e);
                    }
                    break;
                case phases.Begin:
                    stack.push(e);
                    break;
            }
        }
        while (stack.length) {
            stack.pop().setEndTime(this._model.maximumRecordTime());
        }
        utils_1.remove(this._events, null, false);
    }
    /**
     * @param {!TracingManager.EventPayload} payload
     * @return {?Event} event
     */
    addEvent(payload) {
        const event = payload.ph === _1.Phase.SnapshotObject
            ? objectSnapshot_1.default.fromPayload(payload, this)
            : event_1.default.fromPayload(payload, this);
        if (_1.default.isTopLevelEvent(event)) {
            // Discard nested "top-level" events.
            if (this._lastTopLevelEvent && this._lastTopLevelEvent.endTime > event.startTime) {
                return null;
            }
            this._lastTopLevelEvent = event;
        }
        this._events.push(event);
        return event;
    }
    /**
     * @param {!AsyncEvent} asyncEvent
     */
    addAsyncEvent(asyncEvent) {
        this._asyncEvents.push(asyncEvent);
    }
    /**
     * @override
     * @param {string} name
     */
    setName(name) {
        super._setName(name);
        this._process.setThreadByName(name, this);
    }
    /**
     * @return {number}
     */
    id() {
        return this._id;
    }
    /**
     * @return {!Process}
     */
    process() {
        return this._process;
    }
    /**
     * @return {!Array.<!SDK.TracingModel.Event>}
     */
    events() {
        return this._events;
    }
    /**
     * @return {!Array.<!SDK.TracingModel.AsyncEvent>}
     */
    asyncEvents() {
        return this._asyncEvents;
    }
}
exports.default = Thread;
//# sourceMappingURL=thread.js.map