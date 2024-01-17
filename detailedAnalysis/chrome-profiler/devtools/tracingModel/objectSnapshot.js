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
const _1 = __importStar(require("./"));
class ObjectSnapshot extends event_1.default {
    /**
     * @param {string|undefined} category
     * @param {string} name
     * @param {number} startTime
     * @param {!SDK.TracingModel.Thread} thread
     */
    constructor(category, name, startTime, thread) {
        super(category, name, _1.Phase.SnapshotObject, startTime, thread);
        /** @type {?function():!Promise<?string>} */
        /** @type {string} */
        this.id;
        /** @type {?Promise<?>} */
        this._objectPromise = null;
    }
    /**
     * @param {!SDK.TracingManager.EventPayload} payload
     * @param {!SDK.TracingModel.Thread} thread
     * @return {!SDK.TracingModel.ObjectSnapshot}
     */
    static fromPayload(payload, thread) {
        const snapshot = new ObjectSnapshot(payload.cat, payload.name, payload.ts / 1000, thread);
        const id = _1.default.extractId(payload);
        if (typeof id !== 'undefined') {
            snapshot.id = id;
        }
        if (!payload.args || !payload.args['snapshot']) {
            console.error(`Missing mandatory 'snapshot' argument at ${payload.ts / 1000}`);
            return snapshot;
        }
        if (payload.args) {
            snapshot.addArgs(payload.args);
        }
        return snapshot;
    }
    /**
     * @param {function(?)} callback
     */
    // todo fix callback type
    requestObject(callback) {
        const snapshot = this.args['snapshot'];
        if (snapshot) {
            callback(snapshot);
            return;
        }
        /**
         * @param {?string} result
         */
        function onRead(result) {
            if (!result) {
                callback(null);
                return;
            }
            try {
                const payload = JSON.parse(result);
                callback(payload['args']['snapshot']);
            }
            catch (e) {
                console.error('Malformed event data in backing storage');
                callback(null);
            }
        }
    }
    /**
     * @return {!Promise<?>}
     */
    objectPromise() {
        if (!this._objectPromise) {
            this._objectPromise = new Promise(this.requestObject.bind(this));
        }
        return this._objectPromise;
    }
}
exports.default = ObjectSnapshot;
//# sourceMappingURL=objectSnapshot.js.map