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
const index_1 = __importDefault(require("./index"));
const event_1 = __importDefault(require("../tracingModel/event"));
const index_2 = __importStar(require("../tracingModel/index"));
const runtime_1 = __importDefault(require("../runtime"));
const types_1 = require("../types");
const index_3 = __importDefault(require("../common/index"));
var NativeGroups;
(function (NativeGroups) {
    NativeGroups["Compile"] = "Compile";
    NativeGroups["Parse"] = "Parse";
})(NativeGroups = exports.NativeGroups || (exports.NativeGroups = {}));
class TimelineJSProfileProcessor {
    /**
     * @param {!SDK.CPUProfileDataModel} jsProfileModel
     * @param {!SDK.TracingModel.Thread} thread
     * @return {!Array<!SDK.TracingModel.Event>}
     */
    static generateTracingEventsFromCpuProfile(jsProfileModel, thread) {
        const idleNode = jsProfileModel.idleNode;
        const programNode = jsProfileModel.programNode;
        const gcNode = jsProfileModel.gcNode;
        const samples = jsProfileModel.samples;
        const timestamps = jsProfileModel.timestamps;
        const jsEvents = [];
        /** @type {!Map<!Object, !Array<!Protocol.Runtime.CallFrame>>} */
        const nodeToStackMap = new Map();
        nodeToStackMap.set(programNode, []);
        for (let i = 0; i < samples.length; ++i) {
            let node = jsProfileModel.nodeByIndex(i);
            if (!node) {
                console.error(`Node with unknown id ${samples[i]} at index ${i}`);
                continue;
            }
            if (node === gcNode || node === idleNode) {
                continue;
            }
            let callFrames = nodeToStackMap.get(node);
            if (!callFrames) {
                callFrames = /** @type {!Array<!Protocol.Runtime.CallFrame>} */ (new Array(node.depth + 1));
                nodeToStackMap.set(node, callFrames);
                for (let j = 0; node.parent; node = node.parent) {
                    callFrames[j++] = /** @type {!Protocol.Runtime.CallFrame} */ (node);
                }
            }
            const jsSampleEvent = new event_1.default(index_2.DevToolsTimelineEventCategory, types_1.RecordType.JSSample, index_2.Phase.Instant, timestamps[i], thread);
            jsSampleEvent.args.data = { stackTrace: callFrames };
            jsEvents.push(jsSampleEvent);
        }
        return jsEvents;
    }
    /**
     * @param {!Array<!SDK.TracingModel.Event>} events
     * @return {!Array<!SDK.TracingModel.Event>}
     */
    static generateJSFrameEvents(events) {
        const jsFrameEvents = [];
        const jsFramesStack = [];
        const lockedJsStackDepth = [];
        let ordinal = 0;
        const showAllEvents = runtime_1.default.experiments.isEnabled('timelineShowAllEvents');
        const showRuntimeCallStats = runtime_1.default.experiments.isEnabled('timelineV8RuntimeCallStats');
        const showNativeFunctions = index_3.default.moduleSetting('showNativeFunctionsInJSProfile').get();
        /**
         * @param {!Protocol.Runtime.CallFrame} frame1
         * @param {!Protocol.Runtime.CallFrame} frame2
         * @return {boolean}
         */
        function equalFrames(frame1, frame2) {
            return (frame1.scriptId === frame2.scriptId &&
                frame1.functionName === frame2.functionName &&
                frame1.lineNumber === frame2.lineNumber);
        }
        /**
         * @param {number} depth
         * @param {number} time
         */
        function truncateJSStack(depth, time) {
            if (lockedJsStackDepth.length) {
                const lockedDepth = lockedJsStackDepth[lockedJsStackDepth.length - 1];
                if (depth < lockedDepth) {
                    console.error(`Child stack is shallower (${depth}) than the parent stack (${lockedDepth}) at ${time}`);
                    depth = lockedDepth;
                }
            }
            if (jsFramesStack.length < depth) {
                console.error(`Trying to truncate higher than the current stack size at ${time}`);
                depth = jsFramesStack.length;
            }
            for (let k = 0; k < jsFramesStack.length; ++k) {
                jsFramesStack[k].setEndTime(time);
            }
            jsFramesStack.length = depth;
        }
        /**
         * @param {string} name
         * @return {boolean}
         */
        function showNativeName(name) {
            return showRuntimeCallStats && !!TimelineJSProfileProcessor.nativeGroup(name);
        }
        /**
         * @param {!Array<!Protocol.Runtime.CallFrame>} stack
         */
        function filterStackFrames(stack) {
            if (showAllEvents) {
                return;
            }
            let previousNativeFrameName = null;
            let j = 0;
            for (let i = 0; i < stack.length; ++i) {
                const frame = stack[i];
                const url = frame.url;
                const isNativeFrame = url && url.startsWith('native ');
                if (!showNativeFunctions && isNativeFrame) {
                    continue;
                }
                const isNativeRuntimeFrame = TimelineJSProfileProcessor.isNativeRuntimeFrame(frame);
                if (isNativeRuntimeFrame && !showNativeName(frame.functionName)) {
                    continue;
                }
                const nativeFrameName = isNativeRuntimeFrame
                    ? TimelineJSProfileProcessor.nativeGroup(frame.functionName)
                    : null;
                if (previousNativeFrameName && previousNativeFrameName === nativeFrameName) {
                    continue;
                }
                previousNativeFrameName = nativeFrameName;
                stack[j++] = frame;
            }
            stack.length = j;
        }
        /**
         * @param {!SDK.TracingModel.Event} e
         */
        function extractStackTrace(e) {
            const recordTypes = types_1.RecordType;
            /** @type {!Array<!Protocol.Runtime.CallFrame>} */
            const callFrames = e.name === recordTypes.JSSample
                ? e.args['data']['stackTrace'].slice().reverse()
                : jsFramesStack.map((frameEvent) => frameEvent.args['data']);
            filterStackFrames(callFrames);
            const endTime = e.endTime || e.startTime;
            const minFrames = Math.min(callFrames.length, jsFramesStack.length);
            let i;
            for (i = lockedJsStackDepth[lockedJsStackDepth.length - 1] || 0; i < minFrames; ++i) {
                const newFrame = callFrames[i];
                const oldFrame = jsFramesStack[i].args['data'];
                if (!equalFrames(newFrame, oldFrame)) {
                    break;
                }
                jsFramesStack[i].setEndTime(Math.max(jsFramesStack[i].endTime, endTime));
            }
            truncateJSStack(i, e.startTime);
            for (; i < callFrames.length; ++i) {
                const frame = callFrames[i];
                const jsFrameEvent = new event_1.default(index_2.DevToolsTimelineEventCategory, recordTypes.JSFrame, index_2.Phase.Complete, e.startTime, e.thread);
                jsFrameEvent.ordinal = e.ordinal;
                jsFrameEvent.addArgs({ data: frame });
                jsFrameEvent.setEndTime(endTime);
                jsFramesStack.push(jsFrameEvent);
                jsFrameEvents.push(jsFrameEvent);
            }
        }
        /**
         * @param {!SDK.TracingModel.Event} e
         * @return {boolean}
         */
        function isJSInvocationEvent(e) {
            switch (e.name) {
                case types_1.RecordType.RunMicrotasks:
                case types_1.RecordType.FunctionCall:
                case types_1.RecordType.EvaluateScript:
                case types_1.RecordType.EvaluateModule:
                case types_1.RecordType.EventDispatch:
                case types_1.RecordType.V8Execute:
                    return true;
            }
            return false;
        }
        /**
         * @param {!SDK.TracingModel.Event} e
         */
        function onStartEvent(e) {
            e.ordinal = ++ordinal;
            extractStackTrace(e);
            // For the duration of the event we cannot go beyond the stack associated with it.
            lockedJsStackDepth.push(jsFramesStack.length);
        }
        /**
         * @param {!SDK.TracingModel.Event} e
         * @param {?SDK.TracingModel.Event} parent
         */
        function onInstantEvent(e, parent) {
            e.ordinal = ++ordinal;
            if (parent && isJSInvocationEvent(parent)) {
                extractStackTrace(e);
            }
        }
        /**
         * @param {!SDK.TracingModel.Event} e
         */
        function onEndEvent(e) {
            truncateJSStack(lockedJsStackDepth.pop(), e.endTime);
        }
        const firstTopLevelEvent = events.find(index_2.default.isTopLevelEvent);
        const startTime = firstTopLevelEvent ? firstTopLevelEvent.startTime : 0;
        index_1.default.forEachEvent(events, onStartEvent, onEndEvent, onInstantEvent, startTime);
        return jsFrameEvents;
    }
    /**
     * @param {!Protocol.Runtime.CallFrame} frame
     * @return {boolean}
     */
    static isNativeRuntimeFrame(frame) {
        return frame.url === 'native V8Runtime';
    }
    /**
     * @param {string} nativeName
     * @return {?TimelineModel.TimelineJSProfileProcessor.NativeGroups}
     */
    static nativeGroup(nativeName) {
        if (nativeName.startsWith('Parse')) {
            return NativeGroups.Parse;
        }
        if (nativeName.startsWith('Compile') || nativeName.startsWith('Recompile')) {
            return NativeGroups.Compile;
        }
        return null;
    }
    /**
     * @param {*} profile
     * @param {number} tid
     * @param {boolean} injectPageEvent
     * @param {?string=} name
     * @return {!Array<!SDK.TracingManager.TraceEvent>}
     */
    static buildTraceProfileFromCpuProfile(profile, tid, injectPageEvent, name) {
        const events = [];
        if (injectPageEvent) {
            appendEvent('TracingStartedInPage', { data: { sessionId: '1' } }, 0, 0, 'M');
        }
        if (!name) {
            name = `Thread ${tid}`; // todo: original: name = ls`Thread ${tid}`
        }
        appendEvent(index_2.MetadataEvent.ThreadName, { name }, 0, 0, 'M', '__metadata');
        if (!profile) {
            return events;
        }
        const idToNode = new Map();
        const nodes = profile['nodes'];
        for (let i = 0; i < nodes.length; ++i) {
            idToNode.set(nodes[i].id, nodes[i]);
        }
        let programEvent = null;
        let functionEvent = null;
        let nextTime = profile.startTime;
        let currentTime;
        const samples = profile['samples'];
        const timeDeltas = profile['timeDeltas'];
        for (let i = 0; i < samples.length; ++i) {
            currentTime = nextTime;
            nextTime += timeDeltas[i];
            const node = idToNode.get(samples[i]);
            const name = node.callFrame.functionName;
            if (name === '(idle)') {
                closeEvents();
                continue;
            }
            if (!programEvent) {
                programEvent = appendEvent('MessageLoop::RunTask', {}, currentTime, 0, 'X', 'toplevel');
            }
            if (name === '(program)') {
                if (functionEvent) {
                    functionEvent.dur = currentTime - functionEvent.ts;
                    functionEvent = null;
                }
            }
            else if (!functionEvent) {
                functionEvent = appendEvent('FunctionCall', { data: { sessionId: '1' } }, currentTime);
            }
        }
        closeEvents();
        appendEvent('CpuProfile', { data: { cpuProfile: profile } }, profile.endTime, 0, 'I');
        return events;
        function closeEvents() {
            if (programEvent) {
                programEvent.dur = currentTime - programEvent.ts;
            }
            if (functionEvent) {
                functionEvent.dur = currentTime - functionEvent.ts;
            }
            programEvent = null;
            functionEvent = null;
        }
        /**
         * @param {string} name
         * @param {*} args
         * @param {number} ts
         * @param {number=} dur
         * @param {string=} ph
         * @param {string=} cat
         * @return {!SDK.TracingManager.TraceEvent}
         */
        function appendEvent(name, args, ts, dur, ph, cat) {
            const event = ({
                cat: cat || 'disabled-by-default-devtools.timeline',
                name,
                ph: ph || 'X',
                pid: 1,
                tid,
                ts,
                args,
            });
            if (dur) {
                event.dur = dur;
            }
            events.push(event);
            return event;
        }
    }
}
exports.default = TimelineJSProfileProcessor;
//# sourceMappingURL=timelineJSProfileProcessor.js.map