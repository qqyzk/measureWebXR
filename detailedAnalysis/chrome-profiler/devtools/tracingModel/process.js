"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const thread_1 = __importDefault(require("./thread"));
const namedObject_1 = __importDefault(require("./namedObject"));
class Process extends namedObject_1.default {
    /**
     * @param {!TracingModel} model
     * @param {number} id
     */
    constructor(model, id) {
        super(model, id);
        this._threads = new Map();
        this._threadByName = new Map();
    }
    get threads() {
        return this._threads;
    }
    /**
     * @return {number}
     */
    id() {
        return this._id;
    }
    /**
     * @override
     * @param {string} name
     */
    setName(name) {
        super._setName(name);
    }
    /**
     * @param {number} id
     * @return {!TracingModel.Thread}
     */
    threadById(id) {
        let thread = this._threads.get(id);
        if (!thread) {
            thread = new thread_1.default(this, id);
            this._threads.set(id, thread);
        }
        return thread;
    }
    /**
     * @param {string} name
     * @return {?TracingModel.Thread}
     */
    threadByName(name) {
        return this._threadByName.get(name) || null;
    }
    /**
     * @param {string} name
     * @param {!TracingModel.Thread} thread
     */
    setThreadByName(name, thread) {
        this._threadByName.set(name, thread);
    }
    /**
     * @param {!TracingManager.EventPayload} payload
     * @return {?TracingModel.Event} event
     */
    addEvent(payload) {
        return this.threadById(payload.tid).addEvent(payload);
    }
    /**
     * @return {!Array.<!TracingModel.Thread>}
     */
    sortedThreads() {
        return thread_1.default.sort([...this._threads.values()]);
    }
}
exports.default = Process;
//# sourceMappingURL=process.js.map