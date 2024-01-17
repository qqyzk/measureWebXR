"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ProfileEventsGroup {
    /**
     * @param {!TracingModel.Event} event
     */
    constructor(event) {
        /** @type {!Array<!TracingModel.Event>} */
        this.children = [event];
    }
    /**
     * @param {!TracingModel.Event} event
     */
    addChild(event) {
        this.children.push(event);
    }
}
exports.default = ProfileEventsGroup;
//# sourceMappingURL=profileEventsGroup.js.map