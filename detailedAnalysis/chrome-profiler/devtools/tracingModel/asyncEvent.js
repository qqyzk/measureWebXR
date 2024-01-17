"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const _1 = require("./");
const event_1 = __importDefault(require("./event"));
class AsyncEvent extends event_1.default {
    /**
     * @param {!TracingModel.Event} startEvent
     */
    constructor(startEvent) {
        super(startEvent.categoriesString, startEvent.name, startEvent.phase, startEvent.startTime, startEvent.thread);
        this.addArgs(startEvent.args);
        this.steps = [startEvent];
    }
    /**
     * @param {!TracingModel.Event} event
     */
    addStep(event) {
        this.steps.push(event);
        if (event.phase === _1.Phase.AsyncEnd || event.phase === _1.Phase.NestableAsyncEnd) {
            this.setEndTime(event.startTime);
            // FIXME: ideally, we shouldn't do this, but this makes the logic of converting
            // async console events to sync ones much simpler.
            this.steps[0].setEndTime(event.startTime);
        }
    }
}
exports.default = AsyncEvent;
//# sourceMappingURL=asyncEvent.js.map