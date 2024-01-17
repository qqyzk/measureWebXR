"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const calculator_1 = __importDefault(require("./calculator"));
const counter_1 = __importDefault(require("./counter"));
const types_1 = require("../../types");
/**
 * UI class, therefor only a portion of the original logic is ported
 *
 * @unrestricted
 * @custom
 */
class CountersGraph {
    constructor() {
        this._calculator = new calculator_1.default();
        this._counters = [];
        this._countersByName = {};
        this._countersByName['jsHeapSizeUsed'] = this._createCounter('JS Heap');
        this._countersByName['documents'] = this._createCounter('Documents');
        this._countersByName['nodes'] = this._createCounter('Nodes');
        this._countersByName['jsEventListeners'] = this._createCounter('Listeners');
        this._gpuMemoryCounter = this._createCounter('GPU Memory');
        this._countersByName['gpuMemoryUsedKB'] = this._gpuMemoryCounter;
    }
    /**
     * @param {?Timeline.PerformanceModel} model
     * @param {?TimelineModel.TimelineModel.Track} track
     */
    setModel(model, track) {
        this._calculator.setZeroTime(model ? model.timelineModel().minimumRecordTime() : 0);
        for (let i = 0; i < this._counters.length; ++i) {
            this._counters[i].reset();
        }
        this._track = track;
        if (!track) {
            return;
        }
        const events = track.syncEvents();
        for (let i = 0; i < events.length; ++i) {
            const event = events[i];
            if (event.name !== types_1.RecordType.UpdateCounters) {
                continue;
            }
            const counters = event.args.data;
            if (!counters) {
                return;
            }
            for (const name in counters) {
                const counter = this._countersByName[name];
                if (counter) {
                    counter.appendSample(event.startTime, counters[name]);
                }
            }
            const gpuMemoryLimitCounterName = 'gpuMemoryLimitKB';
            if (gpuMemoryLimitCounterName in counters) {
                this._gpuMemoryCounter.setLimit(counters[gpuMemoryLimitCounterName]);
            }
        }
        return this._countersByName;
    }
    /**
     * @param {string} uiName
     * @return {!Timeline.CountersGraph.Counter}
     */
    _createCounter(uiName) {
        const counter = new counter_1.default();
        this._counters.push(counter);
        return counter;
    }
}
exports.default = CountersGraph;
//# sourceMappingURL=index.js.map