"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ProfileNode {
    /**
     * @param {!Protocol.Runtime.CallFrame} callFrame
     */
    constructor(callFrame) {
        this.callFrame = callFrame;
        this.callUID = `${callFrame.functionName}@${callFrame.scriptId}:${callFrame.lineNumber}:${callFrame.columnNumber}`;
        this.self = 0;
        this.total = 0;
        this.id = 0;
        this.parent = null;
        this.children = [];
    }
    /**
     * @return {string}
     */
    get functionName() {
        return this.callFrame.functionName;
    }
    /**
     * @return {string}
     */
    get scriptId() {
        return this.callFrame.scriptId;
    }
    /**
     * @return {string}
     */
    get url() {
        return this.callFrame.url;
    }
    /**
     * @return {number}
     */
    get lineNumber() {
        return this.callFrame.lineNumber;
    }
    /**
     * @return {number}
     */
    get columnNumber() {
        return this.callFrame.columnNumber;
    }
}
exports.default = ProfileNode;
//# sourceMappingURL=profileNode.js.map