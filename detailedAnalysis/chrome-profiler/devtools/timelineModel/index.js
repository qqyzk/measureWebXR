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
const pageFrame_1 = __importDefault(require("./pageFrame"));
const track_1 = __importStar(require("./track"));
const timelineData_1 = __importDefault(require("./timelineData"));
const networkRequest_1 = __importDefault(require("./networkRequest"));
const invalidationTracker_1 = __importDefault(require("./invalidationTracker"));
const invalidationTrackingEvent_1 = __importDefault(require("./invalidationTrackingEvent"));
const timelineAsyncEventTracker_1 = __importDefault(require("./timelineAsyncEventTracker"));
const timelineJSProfileProcessor_1 = __importDefault(require("./timelineJSProfileProcessor"));
const tracingModel_1 = __importStar(require("../tracingModel"));
const index_1 = __importDefault(require("../cpuProfileDataModel/index"));
const event_1 = __importDefault(require("../tracingModel/event"));
const types_1 = require("../types");
const utils_1 = require("../utils");
exports.WorkerThreadName = 'DedicatedWorker thread';
exports.WorkerThreadNameLegacy = 'DedicatedWorker Thread';
exports.RendererMainThreadName = 'CrRendererMain';
exports.BrowserMainThreadName = 'CrBrowserMain';
class TimelineModel {
    constructor() {
        this._reset();
    }
    _reset() {
        this._isGenericTrace = false;
        this._tracks = [];
        this._namedTracks = new Map();
        this._inspectedTargetEvents = [];
        this._timeMarkerEvents = [];
        this._sessionId = null;
        this._mainFrameNodeId = null;
        this._cpuProfiles = [];
        this._workerIdByThread = new WeakMap();
        this._pageFrames = new Map();
        this._mainFrame = null;
        this._minimumRecordTime = 0;
        this._maximumRecordTime = 0;
    }
    /**
     * @param {!Array<!TracingModel.Event>} events
     * @param {function(!TracingModel.Event)} onStartEvent
     * @param {function(!TracingModel.Event)} onEndEvent
     * @param {function(!TracingModel.Event,?TracingModel.Event)|undefined=} onInstantEvent
     * @param {number=} startTime
     * @param {number=} endTime
     * @param {function(!TracingModel.Event):boolean=} filter
     */
    static forEachEvent(events, onStartEvent, onEndEvent, onInstantEvent, startTime, endTime, filter) {
        startTime = startTime || 0;
        endTime = endTime || Infinity;
        const stack = [];
        const startEvent = TimelineModel._topLevelEventEndingAfter(events, startTime);
        for (let i = startEvent; i < events.length; ++i) {
            const e = events[i];
            if ((e.endTime || e.startTime) < startTime) {
                continue;
            }
            if (e.startTime >= endTime) {
                break;
            }
            if (tracingModel_1.default.isAsyncPhase(e.phase) ||
                tracingModel_1.default.isFlowPhase(e.phase)) {
                continue;
            }
            while (stack.length &&
                stack[stack.length - 1].endTime <= e.startTime) {
                onEndEvent(stack.pop());
            }
            if (filter && !filter(e)) {
                continue;
            }
            if (e.duration) {
                onStartEvent(e);
                stack.push(e);
            }
            else {
                onInstantEvent &&
                    onInstantEvent(e, stack[stack.length - 1] || null);
            }
        }
        while (stack.length) {
            onEndEvent(stack.pop());
        }
    }
    /**
     * @param {!Array<!TracingModel.Event>} events
     * @param {number} time
     */
    static _topLevelEventEndingAfter(events, time) {
        let index = utils_1.upperBound(events, time, (time, event) => time - event.startTime) - 1;
        while (index > 0 && !tracingModel_1.default.isTopLevelEvent(events[index])) {
            index--;
        }
        return Math.max(index, 0);
    }
    /**
     * @param {!TracingModel.Event} event
     * @return {boolean}
     */
    isMarkerEvent(event) {
        switch (event.name) {
            case types_1.RecordType.TimeStamp:
                return true;
            case types_1.RecordType.MarkFirstPaint:
            case types_1.RecordType.MarkFCP:
            case types_1.RecordType.MarkFMP:
                // TODO(alph): There are duplicate FMP events coming from the backend. Keep the one having 'data' property.
                return (this._mainFrame &&
                    event.args.frame === this._mainFrame.frameId &&
                    !!event.args.data);
            case types_1.RecordType.MarkDOMContent:
            case types_1.RecordType.MarkLoad:
                return !!event.args.data.isMainFrame;
            default:
                return false;
        }
    }
    /**
     * @param {!TracingModel.Event} event
     * @param {string} field
     * @return {string}
     */
    static globalEventId(event, field) {
        const data = event.args.data || event.args.beginData;
        // TODO(Christian) fix typings
        const id = data && data[field];
        if (!id) {
            return '';
        }
        return `${event.thread.process().id()}.${id}`;
    }
    /**
     * @param {!TracingModel.Event} event
     * @return {string}
     */
    static eventFrameId(event) {
        const data = event.args['data'] || event.args['beginData'];
        return (data && data['frame']) || '';
    }
    /**
     * @return {!Array<!SDK.CPUProfileDataModel>}
     */
    cpuProfiles() {
        return this._cpuProfiles;
    }
    /**
     * @param {!TracingModel.Event} event
     * @return {?SDK.Target}
     */
    targetByEvent() {
        /**
         * not applicable for loaded tracelogs
         */
        return null;
    }
    /**
     * @param {!TracingModel} tracingModel
     */
    setEvents(tracingModel) {
        this._reset();
        this._resetProcessingState();
        this._tracingModel = tracingModel;
        this._minimumRecordTime = tracingModel.minimumRecordTime();
        this._maximumRecordTime = tracingModel.maximumRecordTime();
        this._processSyncBrowserEvents(tracingModel);
        if (this._browserFrameTracking) {
            this._processThreadsForBrowserFrames(tracingModel);
        }
        else {
            // The next line is for loading legacy traces recorded before M67.
            // TODO(alph): Drop the support at some point.
            const metadataEvents = this._processMetadataEvents(tracingModel);
            this._isGenericTrace = !metadataEvents;
            if (metadataEvents) {
                this._processMetadataAndThreads(tracingModel, metadataEvents);
            }
            else {
                this._processGenericTrace(tracingModel);
            }
        }
        utils_1.stableSort(this._inspectedTargetEvents, event_1.default.compareStartTime);
        this._processAsyncBrowserEvents(tracingModel);
        this._buildGPUEvents(tracingModel);
        this._resetProcessingState();
    }
    /**
     * @param {!TracingModel} tracingModel
     */
    _processGenericTrace(tracingModel) {
        let browserMainThread = tracingModel_1.default.browserMainThread(tracingModel);
        if (!browserMainThread && tracingModel.sortedProcesses().length) {
            browserMainThread = tracingModel
                .sortedProcesses()[0]
                .sortedThreads()[0];
        }
        for (const process of tracingModel.sortedProcesses()) {
            for (const thread of process.sortedThreads()) {
                this._processThreadEvents(tracingModel, [{ from: 0, to: Infinity }], thread, thread === browserMainThread, false, true, null);
            }
        }
    }
    /**
     * @param {!TracingModel} tracingModel
     * @param {!TimelineModel.MetadataEvents} metadataEvents
     */
    _processMetadataAndThreads(tracingModel, metadataEvents) {
        let startTime = 0;
        for (let i = 0, length = metadataEvents.page.length; i < length; i++) {
            const metaEvent = metadataEvents.page[i];
            const process = metaEvent.thread.process();
            const endTime = i + 1 < length ? metadataEvents.page[i + 1].startTime : Infinity;
            if (startTime === endTime) {
                continue;
            }
            this._legacyCurrentPage = metaEvent.args.data && metaEvent.args.data.page;
            for (const thread of process.sortedThreads()) {
                let workerUrl = null;
                if (thread.name() === exports.WorkerThreadName ||
                    thread.name() === exports.WorkerThreadNameLegacy) {
                    const workerMetaEvent = metadataEvents.workers.find((event) => {
                        if (event.args.data.workerThreadId !== thread.id()) {
                            return false;
                        }
                        /**
                         * This is to support old traces.
                         */
                        if (event.args.data.sessionId === this._sessionId) {
                            return true;
                        }
                        return Boolean(this._pageFrames.get(TimelineModel.eventFrameId(event)));
                    });
                    if (!workerMetaEvent) {
                        continue;
                    }
                    const workerId = workerMetaEvent.args.data.workerId;
                    if (workerId) {
                        this._workerIdByThread.set(thread, workerId);
                    }
                    workerUrl = workerMetaEvent.args.data.url || '';
                }
                this._processThreadEvents(tracingModel, [{
                        from: startTime,
                        to: endTime,
                    }], thread, thread === metaEvent.thread, !!workerUrl, true, workerUrl);
            }
            startTime = endTime;
        }
    }
    /**
     * @param {!TracingModel} tracingModel
     */
    _processThreadsForBrowserFrames(tracingModel) {
        const processData = new Map();
        for (const frame of this._pageFrames.values()) {
            for (let i = 0; i < frame.processes.length; i++) {
                const pid = frame.processes[i].processId;
                let data = processData.get(pid);
                if (!data) {
                    data = [];
                    processData.set(pid, data);
                }
                const to = i === frame.processes.length - 1
                    ? frame.deletedTime || this._maximumRecordTime
                    : frame.processes[i + 1].time;
                data.push({
                    from: frame.processes[i].time,
                    to: to,
                    main: !frame.parent,
                    url: frame.processes[i].url,
                });
            }
        }
        const allMetadataEvents = tracingModel.devToolsMetadataEvents();
        for (const process of tracingModel.sortedProcesses()) {
            const data = processData.get(process.id());
            if (!data) {
                continue;
            }
            data.sort((a, b) => a.from - b.from || a.to - b.to);
            const ranges = [];
            let lastUrl = null;
            let lastMainUrl = null;
            let hasMain = false;
            for (const item of data) {
                if (!ranges.length ||
                    item.from > ranges[ranges.length - 1].to) {
                    ranges.push({ from: item.from, to: item.to });
                }
                else {
                    ranges[ranges.length - 1].to = item.to;
                }
                if (item.main) {
                    hasMain = true;
                }
                if (item.url) {
                    if (item.main) {
                        lastMainUrl = item.url;
                    }
                    lastUrl = item.url;
                }
            }
            for (const thread of process.sortedThreads()) {
                if (thread.name() === exports.RendererMainThreadName) {
                    this._processThreadEvents(tracingModel, ranges, thread, true /* isMainThread */, false /* isWorker */, hasMain, hasMain ? lastMainUrl : lastUrl);
                }
                else if (thread.name() === exports.WorkerThreadName ||
                    thread.name() === exports.WorkerThreadNameLegacy) {
                    const workerMetaEvent = allMetadataEvents.find((e) => {
                        if (e.name !==
                            types_1.DevToolsMetadataEvent.TracingSessionIdForWorker) {
                            return false;
                        }
                        if (e.thread.process() !== process) {
                            return false;
                        }
                        if (e.args['data']['workerThreadId'] !== thread.id()) {
                            return false;
                        }
                        return !!this._pageFrames.get(TimelineModel.eventFrameId(e));
                    });
                    if (!workerMetaEvent) {
                        continue;
                    }
                    this._workerIdByThread.set(thread, workerMetaEvent.args.data.workerId || '');
                    this._processThreadEvents(tracingModel, ranges, thread, false /* isMainThread */, true /* isWorker */, false /* forMainFrame */, workerMetaEvent.args['data']['url'] || '');
                }
                else {
                    this._processThreadEvents(tracingModel, ranges, thread, false /* isMainThread */, false /* isWorker */, false /* forMainFrame */, null);
                }
            }
        }
    }
    /**
     * @param {!TracingModel} tracingModel
     * @return {?TimelineModel.MetadataEvents}
     */
    _processMetadataEvents(tracingModel) {
        const metadataEvents = tracingModel.devToolsMetadataEvents();
        const pageDevToolsMetadataEvents = [];
        const workersDevToolsMetadataEvents = [];
        for (const event of metadataEvents) {
            if (event.name === types_1.DevToolsMetadataEvent.TracingStartedInPage) {
                pageDevToolsMetadataEvents.push(event);
                if (event.args.data && event.args.data.persistentIds) {
                    this._persistentIds = true;
                }
                const frames = (event.args.data && event.args.data.frames) || [];
                // todo fix type
                frames.forEach((payload) => this._addPageFrame(event, payload));
                this._mainFrame = this.rootFrames()[0];
            }
            else if (event.name === types_1.DevToolsMetadataEvent.TracingSessionIdForWorker) {
                workersDevToolsMetadataEvents.push(event);
            }
            else if (event.name === types_1.DevToolsMetadataEvent.TracingStartedInBrowser) {
                console.assert(!this._mainFrameNodeId, 'Multiple sessions in trace');
                // TODO(Christian) fix typings
                this._mainFrameNodeId = event.args.frameTreeNodeId;
            }
        }
        if (!pageDevToolsMetadataEvents.length) {
            return null;
        }
        const sessionId = (pageDevToolsMetadataEvents[0].args.sessionId ||
            pageDevToolsMetadataEvents[0].args.data.sessionId);
        // this._sessionId = sessionId
        const mismatchingIds = new Set();
        /**
         * @param {!TracingModel.Event} event
         * @return {boolean}
         */
        function checkSessionId(event) {
            let args = event.args;
            // FIXME: put sessionId into args["data"] for TracingStartedInPage event.
            // TODO(Christian) fix typings
            // if (args.data) {
            //     args = args.data
            // }
            const id = args.sessionId;
            if (id === sessionId) {
                return true;
            }
            mismatchingIds.add(id);
            return false;
        }
        const result = {
            page: pageDevToolsMetadataEvents
                .filter(checkSessionId)
                .sort(event_1.default.compareStartTime),
            workers: workersDevToolsMetadataEvents.sort(event_1.default.compareStartTime),
        };
        if (mismatchingIds.size) {
            console.error('Timeline recording was started in more than one page simultaneously. Session id mismatch: ' +
                this._sessionId +
                ' and ' +
                Array.from(mismatchingIds.values()) +
                '.');
        }
        return result;
    }
    /**
     * @param {!TracingModel} tracingModel
     */
    _processSyncBrowserEvents(tracingModel) {
        const browserMain = tracingModel_1.default.browserMainThread(tracingModel);
        if (browserMain) {
            browserMain.events().forEach(this._processBrowserEvent, this);
        }
    }
    /**
     * @param {!TracingModel} tracingModel
     */
    _processAsyncBrowserEvents(tracingModel) {
        const browserMain = tracingModel_1.default.browserMainThread(tracingModel);
        if (browserMain) {
            this._processAsyncEvents(browserMain, [{ from: 0, to: Infinity }]);
        }
    }
    /**
     * @param {!TracingModel} tracingModel
     */
    _buildGPUEvents(tracingModel) {
        const thread = tracingModel.threadByName('GPU Process', 'CrGpuMain');
        // console.log('gpu thread',thread);
        if (!thread) {
            return;
        }
        const gpuEventName = types_1.RecordType.GPUTask;
        const track = this._ensureNamedTrack(track_1.TrackType.GPU);
        track.thread = thread;
        track.events = thread
            .events()
            .filter((event) => event.name === gpuEventName);
    }
    _resetProcessingState() {
        this._asyncEventTracker = new timelineAsyncEventTracker_1.default();
        this._invalidationTracker = new invalidationTracker_1.default();
        this._layoutInvalidate = {};
        this._lastScheduleStyleRecalculation = {};
        this._paintImageEventByPixelRefId = {};
        this._lastPaintForLayer = {};
        this._lastRecalculateStylesEvent = null;
        this._currentScriptEvent = null;
        this._eventStack = [];
        /** @type {!Set<string>} */
        this._knownInputEvents = new Set();
        this._browserFrameTracking = false;
        this._persistentIds = false;
        this._legacyCurrentPage = null;
    }
    /**
   * @param {!SDK.TracingModel} tracingModel
   * @param {!SDK.TracingModel.Thread} thread
   * @return {?SDK.CPUProfileDataModel}
   */
    _extractCpuProfile(tracingModel, thread) {
        const events = thread.events();
        let cpuProfile;
        // Check for legacy CpuProfile event format first.
        let cpuProfileEvent = events[events.length - 1];
        if (cpuProfileEvent && cpuProfileEvent.name === types_1.RecordType.CpuProfile) {
            const eventData = cpuProfileEvent.args['data'];
            cpuProfile = /** @type {?Protocol.Profiler.Profile} */ (eventData && eventData['cpuProfile']);
        }
        if (!cpuProfile) {
            cpuProfileEvent = events.find((e) => e.name === types_1.RecordType.Profile);
            if (!cpuProfileEvent) {
                return null;
            }
            const profileGroup = tracingModel.profileGroup(cpuProfileEvent);
            if (!profileGroup) {
                console.error('Invalid CPU profile format.');
                return null;
            }
            cpuProfile = /** @type {!Protocol.Profiler.Profile} */ ({
                startTime: cpuProfileEvent.args['data']['startTime'],
                endTime: 0,
                nodes: [],
                samples: [],
                timeDeltas: [],
                lines: []
            });
            for (const profileEvent of profileGroup.children) {
                const eventData = profileEvent.args['data'];
                if ('startTime' in eventData) {
                    cpuProfile.startTime = eventData['startTime'];
                }
                if ('endTime' in eventData) {
                    cpuProfile.endTime = eventData['endTime'];
                }
                const nodesAndSamples = eventData['cpuProfile'] || {};
                const samples = nodesAndSamples['samples'] || [];
                const lines = eventData['lines'] || Array(samples.length).fill(0);
                utils_1.pushAll(cpuProfile.nodes, nodesAndSamples['nodes'] || []);
                utils_1.pushAll(cpuProfile.lines, lines);
                utils_1.pushAll(cpuProfile.samples, samples);
                utils_1.pushAll(cpuProfile.timeDeltas, eventData['timeDeltas'] || []);
                if (cpuProfile.samples.length !== cpuProfile.timeDeltas.length) {
                    console.error('Failed to parse CPU profile.');
                    return null;
                }
            }
            if (!cpuProfile.endTime) {
                cpuProfile.endTime = cpuProfile.timeDeltas.reduce((x, y) => x + y, cpuProfile.startTime);
            }
        }
        try {
            const jsProfileModel = new index_1.default(cpuProfile);
            this._cpuProfiles.push(jsProfileModel);
            return jsProfileModel;
        }
        catch (e) {
            console.error('Failed to parse CPU profile.');
        }
        return null;
    }
    /**
     * @param {!TracingModel} tracingModel
     * @param {!TracingModel.Thread} thread
     * @return {!Array<!TracingModel.Event>}
     */
    _injectJSFrameEvents(tracingModel, thread) {
        const jsProfileModel = this._extractCpuProfile(tracingModel, thread);
        let events = thread.events();
        const jsSamples = jsProfileModel
            ? timelineJSProfileProcessor_1.default.generateTracingEventsFromCpuProfile(jsProfileModel, thread)
            : null;
        if (jsSamples && jsSamples.length) {
            events = utils_1.mergeOrIntersect(events, jsSamples, event_1.default.orderedCompareStartTime, true);
        }
        if (jsSamples ||
            events.some((e) => e.name === types_1.RecordType.JSSample)) {
            const jsFrameEvents = timelineJSProfileProcessor_1.default.generateJSFrameEvents(events);
            if (jsFrameEvents && jsFrameEvents.length) {
                events = utils_1.mergeOrIntersect(jsFrameEvents, events, event_1.default.orderedCompareStartTime, true);
            }
        }
        return events;
    }
    /**
     * @param {!TracingModel} tracingModel
     * @param {!Array<!{from: number, to: number}>} ranges
     * @param {!TracingModel.Thread} thread
     * @param {boolean} isMainThread
     * @param {boolean} isWorker
     * @param {boolean} forMainFrame
     * @param {?string} url
     */
    _processThreadEvents(tracingModel, ranges, thread, isMainThread, isWorker, forMainFrame, url) {
        const track = new track_1.default();
        track.name = thread.name() || `Thread ${thread.id()}`; // todo: original ls`Thread ${thread.id()}`
        track.type = track_1.TrackType.Other;
        track.thread = thread;
        if (isMainThread) {
            track.type = track_1.TrackType.MainThread;
            track.url = url || null;
            track.forMainFrame = forMainFrame;
        }
        else if (isWorker) {
            track.type = track_1.TrackType.Worker;
            track.url = url;
        }
        else if (thread.name().startsWith('CompositorTileWorker')) {
            track.type = track_1.TrackType.Raster;
        }
        this._tracks.push(track);
        const events = this._injectJSFrameEvents(tracingModel, thread);
        this._eventStack = [];
        const eventStack = this._eventStack;
        for (const range of ranges) {
            let i = utils_1.lowerBound(events, range.from, (time, event) => time - event.startTime);
            for (; i < events.length; i++) {
                const event = events[i];
                if (event.startTime >= range.to) {
                    break;
                }
                while (eventStack.length &&
                    eventStack[eventStack.length - 1].endTime <= event.startTime) {
                    eventStack.pop();
                }
                if (!this._processEvent(event)) {
                    continue;
                }
                if (!tracingModel_1.default.isAsyncPhase(event.phase) && event.duration) {
                    if (eventStack.length) {
                        const parent = eventStack[eventStack.length - 1];
                        parent.selfTime -= event.duration;
                        if (parent.selfTime < 0) {
                            this._fixNegativeDuration(parent, event);
                        }
                    }
                    event.selfTime = event.duration;
                    if (!eventStack.length) {
                        track.tasks.push(event);
                    }
                    eventStack.push(event);
                }
                if (this.isMarkerEvent(event)) {
                    this._timeMarkerEvents.push(event);
                }
                track.events.push(event);
                this._inspectedTargetEvents.push(event);
            }
        }
        this._processAsyncEvents(thread, ranges);
    }
    /**
     * @param {!TracingModel.Event} event
     * @param {!TracingModel.Event} child
     */
    _fixNegativeDuration(event, child) {
        const epsilon = 1e-3;
        if (event.selfTime < -epsilon) {
            console.error(`Children are longer than parent at ${event.startTime} ` +
                `(${(child.startTime - this.minimumRecordTime()).toFixed(3)} by ${(-event.selfTime).toFixed(3)}`);
        }
        event.selfTime = 0;
    }
    /**
     * @param {!TracingModel.Thread} thread
     * @param {!Array<!{from: number, to: number}>} ranges
     */
    _processAsyncEvents(thread, ranges) {
        const asyncEvents = thread.asyncEvents();
        const groups = new Map();
        /**
         * @param {!TrackType} type
         * @return {!Array<!TracingModel.AsyncEvent>}
         */
        function group(type) {
            if (!groups.has(type)) {
                groups.set(type, []);
            }
            return groups.get(type);
        }
        for (const range of ranges) {
            let i = utils_1.lowerBound(asyncEvents, range.from, (time, asyncEvent) => time - asyncEvent.startTime);
            for (; i < asyncEvents.length; ++i) {
                const asyncEvent = asyncEvents[i];
                if (asyncEvent.startTime >= range.to) {
                    break;
                }
                if (asyncEvent.hasCategory(types_1.Category.Console)) {
                    group(track_1.TrackType.Console).push(asyncEvent);
                    continue;
                }
                if (asyncEvent.hasCategory(types_1.Category.UserTiming)) {
                    group(track_1.TrackType.Timings).push(asyncEvent);
                    continue;
                }
                if (asyncEvent.name === types_1.RecordType.Animation) {
                    group(track_1.TrackType.Animation).push(asyncEvent);
                    continue;
                }
                if (asyncEvent.hasCategory(types_1.Category.LatencyInfo) ||
                    asyncEvent.name === types_1.RecordType.ImplSideFling) {
                    const lastStep = asyncEvent.steps[asyncEvent.steps.length - 1];
                    // FIXME: fix event termination on the back-end instead.
                    if (lastStep.phase !== tracingModel_1.Phase.AsyncEnd) {
                        continue;
                    }
                    const data = lastStep.args['data'];
                    asyncEvent.causedFrame = !!(data &&
                        data['INPUT_EVENT_LATENCY_RENDERER_SWAP_COMPONENT']);
                    if (asyncEvent.hasCategory(types_1.Category.LatencyInfo)) {
                        if ((!this._knownInputEvents.has(lastStep.id)) ||
                            (asyncEvent.name === types_1.RecordType.InputLatencyMouseMove &&
                                !asyncEvent.causedFrame)) {
                            continue;
                        }
                        const rendererMain = data['INPUT_EVENT_LATENCY_RENDERER_MAIN_COMPONENT'];
                        if (rendererMain) {
                            const time = rendererMain['time'] / 1000;
                            timelineData_1.default.forEvent(asyncEvent.steps[0]).timeWaitingForMainThread =
                                time - asyncEvent.steps[0].startTime;
                        }
                    }
                    group(track_1.TrackType.Input).push(asyncEvent);
                    continue;
                }
            }
        }
        for (const [type, events] of groups) {
            const track = this._ensureNamedTrack(type);
            track.thread = thread;
            track.asyncEvents = utils_1.mergeOrIntersect(track.asyncEvents, events, event_1.default.compareStartTime, true);
        }
    }
    /**
     * @param {!TracingModel.Event} event
     * @return {boolean}
     */
    _processEvent(event) {
        const recordTypes = types_1.RecordType;
        const eventStack = this._eventStack;
        if (!eventStack.length) {
            if (this._currentTaskLayoutAndRecalcEvents &&
                this._currentTaskLayoutAndRecalcEvents.length) {
                const totalTime = this._currentTaskLayoutAndRecalcEvents.reduce((time, event) => time + event.duration, 0);
                if (totalTime > types_1.Thresholds.ForcedLayout) {
                    for (const e of this._currentTaskLayoutAndRecalcEvents) {
                        const timelineData = timelineData_1.default.forEvent(e);
                        timelineData.warning =
                            e.name === recordTypes.Layout
                                ? types_1.WarningType.ForcedLayout
                                : types_1.WarningType.ForcedStyle;
                    }
                }
            }
            this._currentTaskLayoutAndRecalcEvents = [];
        }
        if (this._currentScriptEvent &&
            event.startTime > this._currentScriptEvent.endTime) {
            this._currentScriptEvent = null;
        }
        const eventData = event.args.data || event.args.beginData || {};
        const timelineData = timelineData_1.default.forEvent(event);
        if (eventData.stackTrace) {
            timelineData.stackTrace = eventData.stackTrace;
        }
        if (timelineData.stackTrace && event.name !== recordTypes.JSSample) {
            // TraceEvents come with 1-based line & column numbers. The frontend code
            // requires 0-based ones. Adjust the values.
            for (let i = 0; i < timelineData.stackTrace.length; ++i) {
                --timelineData.stackTrace[i].lineNumber;
                --timelineData.stackTrace[i].columnNumber;
            }
        }
        let pageFrameId = TimelineModel.eventFrameId(event);
        if (!pageFrameId && eventStack.length) {
            pageFrameId = timelineData_1.default.forEvent(eventStack[eventStack.length - 1]).frameId;
        }
        timelineData.frameId =
            pageFrameId || (this._mainFrame && this._mainFrame.frameId) || '';
        this._asyncEventTracker.processEvent(event);
        if (this.isMarkerEvent(event)) {
            this._ensureNamedTrack(track_1.TrackType.Timings);
        }
        switch (event.name) {
            case recordTypes.ResourceSendRequest:
            case recordTypes.WebSocketCreate:
                timelineData.setInitiator(eventStack[eventStack.length - 1] || null);
                timelineData.url = eventData.url;
                break;
            case recordTypes.ScheduleStyleRecalculation:
                this._lastScheduleStyleRecalculation[eventData.frame] = event;
                break;
            case recordTypes.UpdateLayoutTree:
            case recordTypes.RecalculateStyles:
                this._invalidationTracker.didRecalcStyle(event);
                if (event.args['beginData']) {
                    timelineData.setInitiator(this._lastScheduleStyleRecalculation[event.args['beginData']['frame']]);
                }
                this._lastRecalculateStylesEvent = event;
                if (this._currentScriptEvent) {
                    this._currentTaskLayoutAndRecalcEvents.push(event);
                }
                break;
            case recordTypes.ScheduleStyleInvalidationTracking:
            case recordTypes.StyleRecalcInvalidationTracking:
            case recordTypes.StyleInvalidatorInvalidationTracking:
            case recordTypes.LayoutInvalidationTracking:
                this._invalidationTracker.addInvalidation(new invalidationTrackingEvent_1.default(event));
                break;
            case recordTypes.InvalidateLayout: {
                // Consider style recalculation as a reason for layout invalidation,
                // but only if we had no earlier layout invalidation records.
                let layoutInitator = event;
                const frameId = eventData['frame'];
                if (!this._layoutInvalidate[frameId] &&
                    this._lastRecalculateStylesEvent &&
                    this._lastRecalculateStylesEvent.endTime > event.startTime) {
                    layoutInitator = timelineData_1.default.forEvent(this._lastRecalculateStylesEvent).initiator();
                }
                this._layoutInvalidate[frameId] = layoutInitator;
                break;
            }
            case recordTypes.Layout: {
                this._invalidationTracker.didLayout(event);
                if (!event.args.beginData) {
                    return;
                }
                const frameId = event.args['beginData']['frame'];
                timelineData.setInitiator(this._layoutInvalidate[frameId]);
                // In case we have no closing Layout event, endData is not available.
                if (event.args['endData']) {
                    timelineData.backendNodeId = event.args.endData.rootNode;
                }
                this._layoutInvalidate[frameId] = null;
                if (this._currentScriptEvent) {
                    this._currentTaskLayoutAndRecalcEvents.push(event);
                }
                break;
            }
            case recordTypes.Task:
                if (event.duration > types_1.Thresholds.LongTask) {
                    timelineData.warning = types_1.WarningType.LongTask;
                }
                break;
            case recordTypes.EventDispatch:
                if (event.duration > types_1.Thresholds.RecurringHandler) {
                    timelineData.warning = types_1.WarningType.LongHandler;
                }
                break;
            case recordTypes.TimerFire:
            case recordTypes.FireAnimationFrame:
                if (event.duration > types_1.Thresholds.RecurringHandler) {
                    timelineData.warning = types_1.WarningType.LongRecurringHandler;
                }
                break;
            case recordTypes.FunctionCall:
                // Compatibility with old format.
                if (typeof eventData.scriptName === 'string') {
                    eventData.url = eventData.scriptName;
                }
                if (typeof eventData.scriptLine === 'number') {
                    eventData.lineNumber = eventData.scriptLine;
                }
            // Fallthrough.
            case recordTypes.EvaluateScript:
            case recordTypes.CompileScript:
                if (typeof eventData.lineNumber === 'number') {
                    --eventData.lineNumber;
                }
                // TODO(Christian) fix typings
                if (typeof eventData.columnNumber === 'number') {
                    --eventData.columnNumber;
                }
            // Fallthrough intended.
            case recordTypes.RunMicrotasks:
                // Microtasks technically are not necessarily scripts, but for purpose of
                // forced sync style recalc or layout detection they are.
                if (!this._currentScriptEvent) {
                    this._currentScriptEvent = event;
                }
                break;
            case recordTypes.SetLayerTreeId:
                // This is to support old traces.
                if (this._sessionId &&
                    eventData.sessionId &&
                    this._sessionId === eventData.sessionId) {
                    this._mainFrameLayerTreeId = eventData.layerTreeId;
                    break;
                }
                // We currently only show layer tree for the main frame.
                const frameId = TimelineModel.eventFrameId(event);
                const pageFrame = this._pageFrames.get(frameId);
                if (!pageFrame || pageFrame.parent) {
                    return false;
                }
                this._mainFrameLayerTreeId = eventData['layerTreeId'];
                break;
            case recordTypes.Paint: {
                this._invalidationTracker.didPaint();
                timelineData.backendNodeId = eventData['nodeId'];
                // Only keep layer paint events, skip paints for subframes that get painted to the same layer as parent.
                if (!eventData['layerId']) {
                    break;
                }
                const layerId = eventData['layerId'];
                this._lastPaintForLayer[layerId] = event;
                break;
            }
            case recordTypes.DisplayItemListSnapshot:
            case recordTypes.PictureSnapshot: {
                const layerUpdateEvent = this._findAncestorEvent(recordTypes.UpdateLayer);
                if (!layerUpdateEvent ||
                    layerUpdateEvent.args['layerTreeId'] !== this._mainFrameLayerTreeId) {
                    break;
                }
                // TODO(Christian) fix typings
                const paintEvent = this._lastPaintForLayer[layerUpdateEvent.args['layerId']];
                if (paintEvent) {
                    /** @type {!TracingModel.ObjectSnapshot} */
                    timelineData_1.default.forEvent(paintEvent).picture = event;
                }
                break;
            }
            case recordTypes.ScrollLayer:
                timelineData.backendNodeId = eventData.nodeId;
                break;
            case recordTypes.PaintImage:
                timelineData.backendNodeId = eventData.nodeId;
                timelineData.url = eventData.url;
                break;
            case recordTypes.DecodeImage:
            case recordTypes.ResizeImage: {
                let paintImageEvent = this._findAncestorEvent(recordTypes.PaintImage);
                if (!paintImageEvent) {
                    const decodeLazyPixelRefEvent = this._findAncestorEvent(recordTypes.DecodeLazyPixelRef);
                    paintImageEvent =
                        decodeLazyPixelRefEvent &&
                            // TODO(Christian) fix typings
                            this._paintImageEventByPixelRefId[decodeLazyPixelRefEvent.args.LazyPixelRef];
                }
                if (!paintImageEvent) {
                    break;
                }
                const paintImageData = timelineData_1.default.forEvent(paintImageEvent);
                timelineData.backendNodeId = paintImageData.backendNodeId;
                timelineData.url = paintImageData.url;
                break;
            }
            case recordTypes.DrawLazyPixelRef: {
                const paintImageEvent = this._findAncestorEvent(recordTypes.PaintImage);
                if (!paintImageEvent) {
                    break;
                }
                // TODO(Christian) fix typings
                this._paintImageEventByPixelRefId[event.args.LazyPixelRef] = paintImageEvent;
                const paintImageData = timelineData_1.default.forEvent(paintImageEvent);
                timelineData.backendNodeId = paintImageData.backendNodeId;
                timelineData.url = paintImageData.url;
                break;
            }
            case recordTypes.FrameStartedLoading:
                if (timelineData.frameId !== event.args['frame']) {
                    return false;
                }
                break;
            case recordTypes.MarkDOMContent:
            case recordTypes.MarkLoad: {
                const frameId = TimelineModel.eventFrameId(event);
                if (!this._pageFrames.has(frameId)) {
                    return false;
                }
                break;
            }
            case recordTypes.CommitLoad: {
                if (this._browserFrameTracking) {
                    break;
                }
                const frameId = TimelineModel.eventFrameId(event);
                const isMainFrame = !!eventData.isMainFrame;
                const pageFrame = this._pageFrames.get(frameId);
                if (pageFrame) {
                    pageFrame.update(event.startTime, eventData);
                }
                else if (!this._persistentIds) {
                    if (eventData.page &&
                        eventData.page !== this._legacyCurrentPage) {
                        return false;
                    }
                }
                else if (isMainFrame) {
                    return false;
                    // TODO(Christian) fix typings
                }
                else if (!this._addPageFrame(event, eventData)) {
                    return false;
                }
                if (isMainFrame) {
                    this._mainFrame = this._pageFrames.get(frameId);
                }
                break;
            }
            case recordTypes.FireIdleCallback:
                if (event.duration >
                    eventData['allottedMilliseconds'] +
                        types_1.Thresholds.IdleCallbackAddon) {
                    timelineData.warning = types_1.WarningType.IdleDeadlineExceeded;
                }
                break;
        }
        return true;
    }
    /**
     * @param {!TracingModel.Event} event
     */
    _processBrowserEvent(event) {
        if (event.name === types_1.RecordType.LatencyInfoFlow) {
            const frameId = event.args['frameTreeNodeId'];
            if (typeof frameId === 'number' &&
                frameId === this._mainFrameNodeId) {
                this._knownInputEvents.add(event.bind_id);
            }
            return;
        }
        if (event.hasCategory(tracingModel_1.DevToolsMetadataEventCategory) &&
            event.args['data']) {
            const data = event.args['data'];
            if (event.name === types_1.DevToolsMetadataEvent.TracingStartedInBrowser) {
                if (!data['persistentIds']) {
                    return;
                }
                this._browserFrameTracking = true;
                this._mainFrameNodeId = data['frameTreeNodeId'];
                const frames = data['frames'] || [];
                frames.forEach((payload) => {
                    // TODO(Christian) fix typings
                    const parent = (payload.parent &&
                        this._pageFrames.get(payload.parent));
                    // TODO(Christian) fix typings
                    if (payload.parent && !parent) {
                        return;
                    }
                    let frame = this._pageFrames.get(payload.frame);
                    if (!frame) {
                        frame = new pageFrame_1.default(payload);
                        this._pageFrames.set(frame.frameId, frame);
                        if (parent) {
                            parent.addChild(frame);
                        }
                        else {
                            this._mainFrame = frame;
                        }
                    }
                    // TODO: this should use event.startTime, but due to races between tracing start
                    // in different processes we cannot do this yet.
                    frame.update(this._minimumRecordTime, payload);
                });
                return;
            }
            if (event.name === types_1.DevToolsMetadataEvent.FrameCommittedInBrowser &&
                this._browserFrameTracking) {
                let frame = this._pageFrames.get(data['frame']);
                if (!frame) {
                    // TODO(Christian) fix typings
                    const parent = (data.parent &&
                        this._pageFrames.get(data.parent));
                    if (!parent) {
                        return;
                    }
                    frame = new pageFrame_1.default(data);
                    this._pageFrames.set(frame.frameId, frame);
                    parent.addChild(frame);
                }
                frame.update(event.startTime, data);
                return;
            }
            if (event.name === types_1.DevToolsMetadataEvent.ProcessReadyInBrowser &&
                this._browserFrameTracking) {
                const frame = this._pageFrames.get(data['frame']);
                if (frame) {
                    frame.processReady(data['processPseudoId'], data['processId']);
                }
                return;
            }
            if (event.name === types_1.DevToolsMetadataEvent.FrameDeletedInBrowser &&
                this._browserFrameTracking) {
                const frame = this._pageFrames.get(data['frame']);
                if (frame) {
                    frame.deletedTime = event.startTime;
                }
                return;
            }
        }
    }
    /**
     * @param {!TrackType} type
     * @return {!TimelineModel.Track}
     */
    _ensureNamedTrack(type) {
        if (!this._namedTracks.has(type)) {
            const track = new track_1.default();
            track.type = type;
            this._tracks.push(track);
            this._namedTracks.set(type, track);
        }
        return this._namedTracks.get(type);
    }
    /**
     * @param {string} name
     * @return {?TracingModel.Event}
     */
    _findAncestorEvent(name) {
        for (let i = this._eventStack.length - 1; i >= 0; --i) {
            const event = this._eventStack[i];
            if (event.name === name) {
                return event;
            }
        }
        return null;
    }
    /**
     * @param {!TracingModel.Event} event
     * @param {!Object} payload
     * @return {boolean}
     */
    _addPageFrame(event, payload) {
        const parent = payload['parent'] && this._pageFrames.get(payload['parent']);
        if (payload['parent'] && !parent) {
            return false;
        }
        const pageFrame = new pageFrame_1.default(payload);
        this._pageFrames.set(pageFrame.frameId, pageFrame);
        pageFrame.update(event.startTime, payload);
        if (parent) {
            parent.addChild(pageFrame);
        }
        return true;
    }
    /**
     * @return {boolean}
     */
    isGenericTrace() {
        return this._isGenericTrace;
    }
    /**
     * @return {!TracingModel}
     */
    tracingModel() {
        return this._tracingModel;
    }
    /**
     * @return {number}
     */
    minimumRecordTime() {
        return this._minimumRecordTime;
    }
    /**
     * @return {number}
     */
    maximumRecordTime() {
        return this._maximumRecordTime;
    }
    /**
     * @return {!Array<!TracingModel.Event>}
     */
    inspectedTargetEvents() {
        return this._inspectedTargetEvents;
    }
    /**
     * @return {!Array<!TimelineModel.Track>}
     */
    tracks() {
        return this._tracks;
    }
    /**
     * @return {boolean}
     */
    isEmpty() {
        return this.minimumRecordTime() === 0 && this.maximumRecordTime() === 0;
    }
    /**
     * @return {!Array<!TracingModel.Event>}
     */
    timeMarkerEvents() {
        return this._timeMarkerEvents;
    }
    /**
     * @return {!Array<!PageFrame>}
     */
    rootFrames() {
        return Array.from(this._pageFrames.values()).filter((frame) => !frame.parent);
    }
    /**
     * @return {string}
     */
    pageURL() {
        return (this._mainFrame && this._mainFrame.url) || '';
    }
    /**
     * @param {string} frameId
     * @return {?PageFrame}
     */
    pageFrameById(frameId) {
        return frameId ? this._pageFrames.get(frameId) || null : null;
    }
    /**
     * @return {!Array<!TimelineModel.NetworkRequest>}
     */
    networkRequests() {
        if (this.isGenericTrace()) {
            return [];
        }
        /** @type {!Map<string,!TimelineModel.NetworkRequest>} */
        const requests = new Map();
        /** @type {!Array<!TimelineModel.NetworkRequest>} */
        const requestsList = [];
        /** @type {!Array<!TimelineModel.NetworkRequest>} */
        const zeroStartRequestsList = [];
        const resourceTypes = new Set([
            types_1.RecordType.ResourceSendRequest,
            types_1.RecordType.ResourceReceiveResponse,
            types_1.RecordType.ResourceReceivedData,
            types_1.RecordType.ResourceFinish,
        ]);
        const events = this.inspectedTargetEvents();
        for (let i = 0; i < events.length; ++i) {
            const e = events[i];
            // TODO(Christian) fix typings
            if (!resourceTypes.has(e.name)) {
                continue;
            }
            const id = TimelineModel.globalEventId(e, 'requestId');
            let request = requests.get(id);
            if (request) {
                request.addEvent(e);
            }
            else {
                request = new networkRequest_1.default(e);
                requests.set(id, request);
                if (request.startTime) {
                    requestsList.push(request);
                }
                else {
                    zeroStartRequestsList.push(request);
                }
            }
        }
        return zeroStartRequestsList.concat(requestsList);
    }
}
exports.default = TimelineModel;
//# sourceMappingURL=index.js.map