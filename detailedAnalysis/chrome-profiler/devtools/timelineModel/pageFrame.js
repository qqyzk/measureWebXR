"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class PageFrame {
    // public ownerNode: any
    /**
     * @param {!Object} payload
     */
    constructor(payload) {
        this.frameId = payload.frame;
        this.url = payload.url || '';
        this.name = payload.name;
        this.children = [];
        this.parent = null;
        this.processes = [];
        this.deletedTime = null;
        // TODO(dgozman): figure this out.
        // this.ownerNode = target && payload['nodeId'] ? new SDK.DeferredDOMNode(target, payload['nodeId']) : null
        // this.ownerNode = null
    }
    /**
     * @param {number} time
     * @param {!Object} payload
     */
    update(time, payload) {
        this.url = payload['url'] || '';
        this.name = payload['name'];
        this.processes.push({
            time,
            processId: payload.processId ? payload.processId : -1,
            processPseudoId: payload.processId ? '' : payload.processPseudoId,
            url: payload.url || ''
        });
    }
    /**
     * @param {string} processPseudoId
     * @param {number} processId
     */
    processReady(processPseudoId, processId) {
        for (const process of this.processes) {
            if (process.processPseudoId === processPseudoId) {
                process.processPseudoId = '';
                process.processId = processId;
            }
        }
    }
    /**
     * @param {!TimelineModel.TimelineModel.PageFrame} child
     */
    addChild(child) {
        this.children.push(child);
        child.parent = this;
    }
}
exports.default = PageFrame;
//# sourceMappingURL=pageFrame.js.map