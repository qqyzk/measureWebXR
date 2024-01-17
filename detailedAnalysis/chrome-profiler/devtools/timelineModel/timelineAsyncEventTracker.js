"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = __importDefault(require("./index"));
const timelineData_1 = __importDefault(require("./timelineData"));
const types_1 = require("../types");
class TimelineAsyncEventTracker {
    constructor() {
        TimelineAsyncEventTracker._initialize();
        /** @type {!Map<!TimelineModel.TimelineModel.RecordType, !Map<string, !SDK.TracingModel.Event>>} */
        this._initiatorByType = new Map();
        for (const initiator of TimelineAsyncEventTracker._asyncEvents.keys()) {
            this._initiatorByType.set(initiator, new Map());
        }
    }
    static _initialize() {
        if (TimelineAsyncEventTracker._asyncEvents) {
            return;
        }
        /**
         * ToDo: type events
         */
        const events = new Map();
        events.set(types_1.RecordType.TimerInstall, {
            causes: [types_1.RecordType.TimerFire],
            joinBy: 'timerId',
        });
        events.set(types_1.RecordType.ResourceSendRequest, {
            causes: [
                types_1.RecordType.ResourceReceiveResponse,
                types_1.RecordType.ResourceReceivedData,
                types_1.RecordType.ResourceFinish,
            ],
            joinBy: 'requestId',
        });
        events.set(types_1.RecordType.RequestAnimationFrame, {
            causes: [types_1.RecordType.FireAnimationFrame],
            joinBy: 'id',
        });
        events.set(types_1.RecordType.RequestIdleCallback, {
            causes: [types_1.RecordType.FireIdleCallback],
            joinBy: 'id',
        });
        events.set(types_1.RecordType.WebSocketCreate, {
            causes: [
                types_1.RecordType.WebSocketSendHandshakeRequest,
                types_1.RecordType.WebSocketReceiveHandshakeResponse,
                types_1.RecordType.WebSocketDestroy,
            ],
            joinBy: 'identifier',
        });
        TimelineAsyncEventTracker._asyncEvents = events;
        /** @type {!Map<!TimelineModel.TimelineModel.RecordType, !TimelineModel.TimelineModel.RecordType>} */
        this._typeToInitiator = new Map();
        for (const entry of events) {
            const types = entry[1].causes;
            for (let causeType of types) {
                // TODO(Christian) fix typings
                this._typeToInitiator.set(causeType, entry[0]);
            }
        }
    }
    /**
     * @param {!SDK.TracingModel.Event} event
     */
    processEvent(event) {
        /** @type {!TimelineModel.TimelineModel.RecordType} */
        let initiatorType = TimelineAsyncEventTracker._typeToInitiator.get(event.name);
        const isInitiator = !initiatorType;
        if (!initiatorType) {
            /** @type {!TimelineModel.TimelineModel.RecordType} */
            initiatorType = event.name;
        }
        const initiatorInfo = TimelineAsyncEventTracker._asyncEvents.get(initiatorType);
        if (!initiatorInfo) {
            return;
        }
        const id = index_1.default.globalEventId(event, initiatorInfo.joinBy);
        if (!id) {
            return;
        }
        /** @type {!Map<string, !SDK.TracingModel.Event>|undefined} */
        const initiatorMap = this._initiatorByType.get(initiatorType);
        if (isInitiator) {
            initiatorMap.set(id, event);
            return;
        }
        const initiator = initiatorMap.get(id) || null;
        const timelineData = timelineData_1.default.forEvent(event);
        timelineData.setInitiator(initiator);
        if (!timelineData.frameId && initiator) {
            timelineData.frameId = index_1.default.eventFrameId(initiator);
        }
    }
}
exports.default = TimelineAsyncEventTracker;
//# sourceMappingURL=timelineAsyncEventTracker.js.map