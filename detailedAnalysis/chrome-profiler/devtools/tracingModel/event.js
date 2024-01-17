"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = __importDefault(require("./index"));
const invalidationTracker_1 = __importDefault(require("../timelineModel/invalidationTracker"));
class Event {
    /**
     * @param {number} startTime     * @param {string|undefined} categories
     * @param {string} name
     * @param {!Phase} phase
     * @param {!Thread} thread
     */
    constructor(categories, name, phase, startTime, thread) {
        this.categoriesString = categories || '';
        this._parsedCategories = thread.model.parsedCategoriesForString(this.categoriesString);
        this.name = name;
        this.phase = phase;
        this.startTime = startTime;
        this.thread = thread;
        this.args = {};
        this.selfTime = 0;
    }
    /**
     * @param {!TracingManager.EventPayload} payload
     * @param {!Thread} thread
     * @return {!Event}
     */
    static fromPayload(payload, thread) {
        const event = new Event(payload.cat, payload.name, payload.ph, payload.ts / 1000, thread);
        if (payload.args) {
            event.addArgs(payload.args);
        }
        if (typeof payload.dur === 'number') {
            event.setEndTime((payload.ts + payload.dur) / 1000);
        }
        const id = index_1.default.extractId(payload);
        if (typeof id !== 'undefined') {
            event.id = id;
        }
        if (payload.bind_id) {
            // eslint-disable-next-line
            event.bind_id = payload.bind_id;
        }
        return event;
    }
    /**
     * @param {!Event} a
     * @param {!Event} b
     * @return {number}
     */
    static compareStartTime(a, b) {
        return a.startTime - b.startTime;
    }
    /**
     * @param {!Event} a
     * @param {!Event} b
     * @return {number}
     */
    static orderedCompareStartTime(a, b) {
        // Array.mergeOrdered coalesces objects if comparator returns 0.
        // To change this behavior this comparator return -1 in the case events
        // startTime's are equal, so both events got placed into the result array.
        return a.startTime - b.startTime || -1;
    }
    /**
     * @param {string} categoryName
     * @return {boolean}
     */
    hasCategory(categoryName) {
        return this._parsedCategories.has(categoryName);
    }
    /**
     * @param {number} endTime
     */
    setEndTime(endTime) {
        if (endTime < this.startTime) {
            console.assert(false, 'Event out of order: ' + this.name);
            return;
        }
        this.endTime = endTime;
        this.duration = endTime - this.startTime;
    }
    /**
     * @param {!Object} args
     */
    addArgs(args) {
        /**
         * Shallow copy args to avoid modifying original payload which may be saved to file.
         */
        for (const name in args) {
            if (name in this.args) {
                console.error(`Same argument name (${name}) is used for begin and end phases of ${this.name}`);
            }
            this.args[name] = args[name];
        }
    }
    /**
     * @param {!Event} endEvent
     */
    _complete(endEvent) {
        if (endEvent.args) {
            this.addArgs(endEvent.args);
        }
        else {
            console.error(`Missing mandatory event argument 'args' at ${endEvent.startTime}`);
        }
        this.setEndTime(endEvent.startTime);
    }
}
exports.default = Event;
invalidationTracker_1.default.invalidationTrackingEventsSymbol;
//# sourceMappingURL=event.js.map