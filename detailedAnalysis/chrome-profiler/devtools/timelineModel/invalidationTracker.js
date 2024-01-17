"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const invalidationTrackingEvent_1 = __importDefault(require("./invalidationTrackingEvent"));
const types_1 = require("../types");
class InvalidationTracker {
    constructor() {
        this._lastRecalcStyle = null;
        this._lastPaintWithLayer = null;
        this._didPaint = false;
        this._initializePerFrameState();
    }
    /**
     * @param {!SDK.TracingModel.Event} event
     * @return {?Array<!TimelineModel.InvalidationTrackingEvent>}
     */
    static invalidationEventsFor(event) {
        return event[InvalidationTracker.invalidationTrackingEventsSymbol] || null;
    }
    /**
     * @param {!TimelineModel.InvalidationTrackingEvent} invalidation
     */
    addInvalidation(invalidation) {
        this._startNewFrameIfNeeded();
        if (!invalidation.nodeId) {
            console.error('Invalidation lacks node information.');
            console.error(invalidation);
            return;
        }
        // Suppress StyleInvalidator StyleRecalcInvalidationTracking invalidations because they
        // will be handled by StyleInvalidatorInvalidationTracking.
        // FIXME: Investigate if we can remove StyleInvalidator invalidations entirely.
        if (invalidation.type === types_1.RecordType.StyleRecalcInvalidationTracking &&
            invalidation.cause.reason === 'StyleInvalidator') {
            return;
        }
        // Style invalidation events can occur before and during recalc style. didRecalcStyle
        // handles style invalidations that occur before the recalc style event but we need to
        // handle style recalc invalidations during recalc style here.
        const styleRecalcInvalidation = (invalidation.type === types_1.RecordType.ScheduleStyleInvalidationTracking ||
            invalidation.type === types_1.RecordType.StyleInvalidatorInvalidationTracking ||
            invalidation.type === types_1.RecordType.StyleRecalcInvalidationTracking);
        if (styleRecalcInvalidation) {
            const duringRecalcStyle = (invalidation.startTime &&
                this._lastRecalcStyle &&
                invalidation.startTime >= this._lastRecalcStyle.startTime &&
                invalidation.startTime <= this._lastRecalcStyle.endTime);
            if (duringRecalcStyle) {
                this._associateWithLastRecalcStyleEvent(invalidation);
            }
        }
        /**
         * Record the invalidation so later events can look it up.
         */
        // TODO(Christian) fix typings
        if (this._invalidations[invalidation.type]) {
            // TODO(Christian) fix typings
            this._invalidations[invalidation.type].push(invalidation);
        }
        else {
            // TODO(Christian) fix typings
            this._invalidations[invalidation.type] = [invalidation];
        }
        if (invalidation.nodeId) {
            if (this._invalidationsByNodeId[invalidation.nodeId]) {
                // TODO(Christian) fix typings
                this._invalidationsByNodeId[invalidation.nodeId].push(invalidation);
            }
            else {
                // TODO(Christian) fix typings
                this._invalidationsByNodeId[invalidation.nodeId] = [invalidation];
            }
        }
    }
    /**
    * @param {!SDK.TracingModel.Event} recalcStyleEvent
    */
    didRecalcStyle(recalcStyleEvent) {
        this._lastRecalcStyle = recalcStyleEvent;
        const types = [
            types_1.RecordType.ScheduleStyleInvalidationTracking,
            types_1.RecordType.StyleInvalidatorInvalidationTracking,
            types_1.RecordType.StyleRecalcInvalidationTracking
        ];
        for (const invalidation of this._invalidationsOfTypes(types)) {
            this._associateWithLastRecalcStyleEvent(invalidation);
        }
    }
    /**
    * @param {!TimelineModel.InvalidationTrackingEvent} invalidation
    */
    _associateWithLastRecalcStyleEvent(invalidation) {
        if (invalidation.linkedRecalcStyleEvent) {
            return;
        }
        const recalcStyleFrameId = this._lastRecalcStyle.args.beginData.frame;
        if (invalidation.type === types_1.RecordType.StyleInvalidatorInvalidationTracking) {
            /**
             * Instead of calling _addInvalidationToEvent directly, we create synthetic
             * StyleRecalcInvalidationTracking events which will be added in _addInvalidationToEvent.
             */
            this._addSyntheticStyleRecalcInvalidations(this._lastRecalcStyle, recalcStyleFrameId, invalidation);
        }
        else if (invalidation.type === types_1.RecordType.ScheduleStyleInvalidationTracking) {
            /**
             * ScheduleStyleInvalidationTracking events are only used for adding information to
             * StyleInvalidatorInvalidationTracking events. See: _addSyntheticStyleRecalcInvalidations.
             */
        }
        else {
            this._addInvalidationToEvent(this._lastRecalcStyle, recalcStyleFrameId, invalidation);
        }
        invalidation.linkedRecalcStyleEvent = true;
    }
    /**
    * @param {!SDK.TracingModel.Event} event
    * @param {number} frameId
    * @param {!TimelineModel.InvalidationTrackingEvent} styleInvalidatorInvalidation
    */
    // TODO(Christian) fix typings
    _addSyntheticStyleRecalcInvalidations(event, frameId, styleInvalidatorInvalidation) {
        if (!styleInvalidatorInvalidation.invalidationList) {
            this._addSyntheticStyleRecalcInvalidation(styleInvalidatorInvalidation.tracingEvent, styleInvalidatorInvalidation);
            return;
        }
        if (!styleInvalidatorInvalidation.nodeId) {
            console.error('Invalidation lacks node information.');
            console.error(styleInvalidatorInvalidation);
            return;
        }
        for (let i = 0; i < styleInvalidatorInvalidation.invalidationList.length; i++) {
            const setId = styleInvalidatorInvalidation.invalidationList[i]['id'];
            let lastScheduleStyleRecalculation;
            const emptyList = [];
            const nodeInvalidations = this._invalidationsByNodeId[styleInvalidatorInvalidation.nodeId] || emptyList;
            for (let j = 0; j < nodeInvalidations.length; j++) {
                const invalidation = nodeInvalidations[j];
                if (invalidation.frame !== frameId || invalidation.invalidationSet !== setId ||
                    invalidation.type !== types_1.RecordType.ScheduleStyleInvalidationTracking) {
                    continue;
                }
                lastScheduleStyleRecalculation = invalidation;
            }
            if (!lastScheduleStyleRecalculation) {
                console.error('Failed to lookup the event that scheduled a style invalidator invalidation.');
                continue;
            }
            this._addSyntheticStyleRecalcInvalidation(lastScheduleStyleRecalculation.tracingEvent, styleInvalidatorInvalidation);
        }
    }
    /**
    * @param {!SDK.TracingModel.Event} baseEvent
    * @param {!TimelineModel.InvalidationTrackingEvent} styleInvalidatorInvalidation
    */
    _addSyntheticStyleRecalcInvalidation(baseEvent, styleInvalidatorInvalidation) {
        const invalidation = new invalidationTrackingEvent_1.default(baseEvent);
        invalidation.type = types_1.RecordType.StyleRecalcInvalidationTracking;
        if (styleInvalidatorInvalidation.cause.reason) {
            invalidation.cause.reason = styleInvalidatorInvalidation.cause.reason;
        }
        if (styleInvalidatorInvalidation.selectorPart) {
            invalidation.selectorPart = styleInvalidatorInvalidation.selectorPart;
        }
        this.addInvalidation(invalidation);
        if (!invalidation.linkedRecalcStyleEvent) {
            this._associateWithLastRecalcStyleEvent(invalidation);
        }
    }
    /**
    * @param {!SDK.TracingModel.Event} layoutEvent
    */
    didLayout(layoutEvent) {
        if (!layoutEvent.args.beginData) {
            return;
        }
        const layoutFrameId = layoutEvent.args.beginData.frame;
        for (const invalidation of this._invalidationsOfTypes([types_1.RecordType.LayoutInvalidationTracking])) {
            if (invalidation.linkedLayoutEvent) {
                continue;
            }
            this._addInvalidationToEvent(layoutEvent, layoutFrameId, invalidation);
            invalidation.linkedLayoutEvent = true;
        }
    }
    /**
     * @param {!SDK.TracingModel.Event} paintEvent
     */
    didPaint() {
        this._didPaint = true;
    }
    /**
     * @param {!SDK.TracingModel.Event} event
     * @param {number} eventFrameId
     * @param {!TimelineModel.InvalidationTrackingEvent} invalidation
     */
    _addInvalidationToEvent(event, eventFrameId, invalidation) {
        if (eventFrameId !== invalidation.frame) {
            return;
        }
        if (!event[InvalidationTracker.invalidationTrackingEventsSymbol]) {
            event[InvalidationTracker.invalidationTrackingEventsSymbol] = [invalidation];
            return;
        }
        event[InvalidationTracker.invalidationTrackingEventsSymbol].push(invalidation);
    }
    /**
     * @param {!Array.<string>=} types
     * @return {!Iterator.<!TimelineModel.InvalidationTrackingEvent>}
     */
    _invalidationsOfTypes(types) {
        const invalidations = this._invalidations;
        if (!types) {
            types = Object.keys(invalidations);
        }
        // eslint-disable-next-line
        function* generator() {
            for (let i = 0; i < types.length; ++i) {
                // TODO(Christian) fix typings
                const invalidationList = invalidations[types[i]] || [];
                for (let j = 0; j < invalidationList.length; ++j) {
                    yield invalidationList[j];
                }
            }
        }
        return generator();
    }
    _startNewFrameIfNeeded() {
        if (!this._didPaint) {
            return;
        }
        this._initializePerFrameState();
    }
    _initializePerFrameState() {
        /** @type {!Object.<string, !Array.<!TimelineModel.InvalidationTrackingEvent>>} */
        this._invalidations = {};
        /** @type {!Object.<number, !Array.<!TimelineModel.InvalidationTrackingEvent>>} */
        this._invalidationsByNodeId = {};
        this._lastRecalcStyle = null;
        this._lastPaintWithLayer = null;
        this._didPaint = false;
    }
}
exports.default = InvalidationTracker;
InvalidationTracker.invalidationTrackingEventsSymbol = Symbol('invalidationTrackingEvents');
//# sourceMappingURL=invalidationTracker.js.map