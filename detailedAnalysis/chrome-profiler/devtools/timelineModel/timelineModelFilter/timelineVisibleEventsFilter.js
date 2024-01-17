"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const _1 = __importDefault(require("./"));
const types_1 = require("../../types");
class TimelineVisibleEventsFilter extends _1.default {
    /**
     * @param {!Array<string>} visibleTypes
     */
    constructor(visibleTypes) {
        super();
        this._visibleTypes = new Set(visibleTypes);
    }
    /**
     * @override
     * @param {!SDK.TracingModel.Event} event
     * @return {boolean}
     */
    accept(event) {
        return this._visibleTypes.has(TimelineVisibleEventsFilter._eventType(event));
    }
    /**
     * @return {!TimelineModel.TimelineModel.RecordType}
     */
    static _eventType(event) {
        if (event.hasCategory(types_1.Category.Console)) {
            return types_1.RecordType.ConsoleTime;
        }
        if (event.hasCategory(types_1.Category.UserTiming)) {
            return types_1.RecordType.UserTiming;
        }
        if (event.hasCategory(types_1.Category.LatencyInfo)) {
            return types_1.RecordType.LatencyInfo;
        }
        return /** @type !TimelineModel.TimelineModel.RecordType */ event.name;
    }
}
exports.default = TimelineVisibleEventsFilter;
//# sourceMappingURL=timelineVisibleEventsFilter.js.map