"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const profileNode_1 = __importDefault(require("../profileTreeModel/profileNode"));
class CPUProfileNode extends profileNode_1.default {
    /**
     * @param {!Protocol.Profiler.ProfileNode} node
     * @param {number} sampleTime
     */
    constructor(node, sampleTime) {
        /**
         * Backward compatibility for old SamplingHeapProfileNode format.
         */
        const nodeCallFrame = {
            functionName: node.functionName,
            scriptId: node.scriptId,
            url: node.url,
            lineNumber: node.lineNumber - 1,
            columnNumber: node.columnNumber - 1
        };
        const callFrame = node.callFrame || nodeCallFrame;
        super(callFrame);
        this.id = node.id;
        this.self = node.hitCount * sampleTime;
        this.positionTicks = node.positionTicks;
        /**
         * Compatibility: legacy backends could provide "no reason" for optimized functions.
         */
        this.deoptReason = node.deoptReason && node.deoptReason !== 'no reason' ? node.deoptReason : null;
    }
}
exports.default = CPUProfileNode;
//# sourceMappingURL=cpuProfileNode.js.map