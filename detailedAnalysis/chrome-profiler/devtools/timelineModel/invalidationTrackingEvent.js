"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("../types");
class InvalidationTrackingEvent {
    constructor(event) {
        this.type = event.name;
        this.startTime = event.startTime;
        this.tracingEvent = event;
        const eventData = event.args['data'];
        // this.frame = eventData['frame']
        this.nodeId = eventData['nodeId'];
        this.nodeName = eventData['nodeName'];
        this.invalidationSet = eventData['invalidationSet'];
        this.invalidatedSelectorId = eventData['invalidatedSelectorId'];
        this.changedId = eventData['changedId'];
        this.changedClass = eventData['changedClass'];
        this.changedAttribute = eventData['changedAttribute'];
        this.changedPseudo = eventData['changedPseudo'];
        this.selectorPart = eventData['selectorPart'];
        this.extraData = eventData['extraData'];
        this.invalidationList = eventData['invalidationList'];
        this.cause = {
            reason: eventData['reason'],
            stackTrace: eventData['stackTrace'],
        };
        if (!this.cause.reason &&
            this.cause.stackTrace &&
            this.type === types_1.RecordType.LayoutInvalidationTracking) {
            this.cause.reason = 'Layout forced';
        }
    }
}
exports.default = InvalidationTrackingEvent;
//# sourceMappingURL=invalidationTrackingEvent.js.map