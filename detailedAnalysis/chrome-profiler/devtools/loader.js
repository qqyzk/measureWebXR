"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = __importDefault(require("./tracingModel/index"));
const performanceModel_1 = __importDefault(require("./timelineModel/performanceModel"));
class TimelineLoader {
    constructor(traceLog) {
        this._tracingModel = new index_1.default();
        this._traceLog = traceLog;
    }
    /**
    * @param {string} data
    */
    init() {
        try {
            this._tracingModel.addEvents(this._traceLog);
        }
        catch (e) {
            console.error('Malformed timeline data: %s', e.toString());
            return;
        }
        this._tracingModel.tracingComplete();
        this.performanceModel = new performanceModel_1.default();
        this.performanceModel.setTracingModel(this._tracingModel);
    }
}
exports.default = TimelineLoader;
;
//# sourceMappingURL=loader.js.map