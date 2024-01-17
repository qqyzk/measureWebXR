"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const event_1 = __importDefault(require("./event"));
const process_1 = __importDefault(require("./process"));
const asyncEvent_1 = __importDefault(require("./asyncEvent"));
const profileEventsGroup_1 = __importDefault(require("./profileEventsGroup"));
const utils_1 = require("../utils");
var Phase;
(function (Phase) {
    Phase["Begin"] = "B";
    Phase["End"] = "E";
    Phase["Complete"] = "X";
    Phase["Instant"] = "I";
    Phase["AsyncBegin"] = "S";
    Phase["AsyncStepInto"] = "T";
    Phase["AsyncStepPast"] = "p";
    Phase["AsyncEnd"] = "F";
    Phase["NestableAsyncBegin"] = "b";
    Phase["NestableAsyncEnd"] = "e";
    Phase["NestableAsyncInstant"] = "n";
    Phase["FlowBegin"] = "s";
    Phase["FlowStep"] = "t";
    Phase["FlowEnd"] = "f";
    Phase["Metadata"] = "M";
    Phase["Counter"] = "C";
    Phase["Sample"] = "P";
    Phase["CreateObject"] = "N";
    Phase["SnapshotObject"] = "O";
    Phase["DeleteObject"] = "D";
})(Phase = exports.Phase || (exports.Phase = {}));
var MetadataEvent;
(function (MetadataEvent) {
    MetadataEvent["ProcessSortIndex"] = "process_sort_index";
    MetadataEvent["ProcessName"] = "process_name";
    MetadataEvent["ThreadSortIndex"] = "thread_sort_index";
    MetadataEvent["ThreadName"] = "thread_name";
})(MetadataEvent = exports.MetadataEvent || (exports.MetadataEvent = {}));
exports.LegacyTopLevelEventCategory = 'toplevel';
exports.DevToolsMetadataEventCategory = 'disabled-by-default-devtools.timeline';
exports.DevToolsTimelineEventCategory = 'disabled-by-default-devtools.timeline';
exports.FrameLifecycleEventCategory = 'cc,devtools';
class TracingModel {
    constructor() {
        this._processById = new Map();
        this._processByName = new Map();
        this._minimumRecordTime = 0;
        this._maximumRecordTime = 0;
        this._devToolsMetadataEvents = [];
        this._asyncEvents = [];
        this._openAsyncEvents = new Map();
        this._openNestableAsyncEvents = new Map();
        this._profileGroups = new Map();
        this._parsedCategories = new Map();
    }
    /**
     * @param {string} phase
     * @return {boolean}
     */
    static isNestableAsyncPhase(phase) {
        return (phase === Phase.NestableAsyncBegin ||
            phase === Phase.NestableAsyncEnd ||
            phase === Phase.NestableAsyncInstant);
    }
    /**
     * @param {string} phase
     * @return {boolean}
     */
    static isAsyncBeginPhase(phase) {
        return phase === Phase.AsyncBegin || phase === Phase.NestableAsyncBegin;
    }
    /**
     * @param {string} phase
     * @return {boolean}
     */
    static isAsyncPhase(phase) {
        return (TracingModel.isNestableAsyncPhase(phase) ||
            phase === Phase.AsyncBegin ||
            phase === Phase.AsyncStepInto ||
            phase === Phase.AsyncEnd ||
            phase === Phase.AsyncStepPast);
    }
    /**
     * @param {string} phase
     * @return {boolean}
     */
    static isFlowPhase(phase) {
        return phase === Phase.FlowBegin || phase === Phase.FlowStep || phase === Phase.FlowEnd;
    }
    /**
     * @param {!TracingModel.Event} event
     * @return {boolean}
     */
    static isTopLevelEvent(event) {
        return ((event.hasCategory(exports.DevToolsTimelineEventCategory) && event.name === 'RunTask') ||
            event.hasCategory(exports.LegacyTopLevelEventCategory) ||
            (event.hasCategory(exports.DevToolsMetadataEventCategory) && event.name === 'Program')); // Older timelines may have this instead of toplevel.
    }
    /**
     * @param {!TracingManager.EventPayload} payload
     * @return {string|undefined}
     */
    static extractId(payload) {
        const scope = payload.scope || '';
        if (typeof payload.id2 === 'undefined') {
            return scope && payload.id ? `${scope}@${payload.id}` : payload.id;
        }
        const id2 = payload.id2;
        if (typeof id2 === 'object' && 'global' in id2 !== 'local' in id2) {
            return typeof id2['global'] !== 'undefined'
                ? `:${scope}:${id2['global']}`
                : `:${scope}:${payload.pid}:${id2['local']}`;
        }
        console.error(`Unexpected id2 field at ${payload.ts / 1000}, one and only one of 'local' and 'global' should be present.`);
    }
    /**
     * @param {!TracingModel} tracingModel
     * @return {?TracingModel.Thread}
     *
     * TODO: Move this to a better place. This is here just for convenience o
     * re-use between modules. This really belongs to a higher level, since it
     * is specific to chrome's usage of tracing.
     */
    static browserMainThread(tracingModel) {
        const processes = tracingModel.sortedProcesses();
        // Avoid warning for an empty model.
        if (!processes.length) {
            return null;
        }
        const browserMainThreadName = 'CrBrowserMain';
        const browserProcesses = [];
        const browserMainThreads = [];
        for (const process of processes) {
            if (process
                .name()
                .toLowerCase()
                .endsWith('browser')) {
                browserProcesses.push(process);
            }
            browserMainThreads.push(...process.sortedThreads().filter((t) => t.name() === browserMainThreadName));
        }
        if (browserMainThreads.length === 1) {
            return browserMainThreads[0];
        }
        if (browserProcesses.length === 1) {
            return browserProcesses[0].threadByName(browserMainThreadName);
        }
        const tracingStartedInBrowser = tracingModel
            .devToolsMetadataEvents()
            .filter((e) => e.name === 'TracingStartedInBrowser');
        if (tracingStartedInBrowser.length === 1) {
            return tracingStartedInBrowser[0].thread;
        }
        console.error('Failed to find browser main thread in trace, some timeline features may be unavailable');
        return null;
    }
    /**
     * @return {!Array.<!Event>}
     */
    devToolsMetadataEvents() {
        return this._devToolsMetadataEvents;
    }
    /**
     * @param {!Array.<!TracingManager.EventPayload>} events
     */
    addEvents(events) {
        for (let i = 0; i < events.length; ++i) {
            this._addEvent(events[i]);
        }
    }
    tracingComplete() {
        this._processPendingAsyncEvents();
        for (const process of this._processById.values()) {
            for (const thread of process.threads.values()) {
                thread.tracingComplete();
            }
        }
    }
    /**
     * @param {number} offset
     */
    adjustTime(offset) {
        this._minimumRecordTime += offset;
        this._maximumRecordTime += offset;
        for (const process of this._processById.values()) {
            for (const thread of process.threads.values()) {
                for (const event of thread.events()) {
                    event.startTime += offset;
                    if (typeof event.endTime === 'number') {
                        event.endTime += offset;
                    }
                }
                for (const event of thread.asyncEvents()) {
                    event.startTime += offset;
                    if (typeof event.endTime === 'number') {
                        event.endTime += offset;
                    }
                }
            }
        }
    }
    /**
     * @param {!TraceEvent} payload
     */
    _addEvent(payload) {
        let process = this._processById.get(payload.pid);
        if (!process) {
            process = new process_1.default(this, payload.pid);
            this._processById.set(payload.pid, process);
        }
        const timestamp = payload.ts / 1000;
        // We do allow records for unrelated threads to arrive out-of-order,
        // so there's a chance we're getting records from the past.
        if (timestamp &&
            (!this._minimumRecordTime || timestamp < this._minimumRecordTime) &&
            (payload.ph === Phase.Begin || payload.ph === Phase.Complete || payload.ph === Phase.Instant)) {
            this._minimumRecordTime = timestamp;
        }
        const endTimeStamp = (payload.ts + (payload.dur || 0)) / 1000;
        this._maximumRecordTime = Math.max(this._maximumRecordTime, endTimeStamp);
        const event = process.addEvent(payload);
        if (!event) {
            return;
        }
        if (payload.ph === Phase.Sample) {
            this._addSampleEvent(event);
            return;
        }
        // Build async event when we've got events from all threads & processes, so we can sort them and process in the
        // chronological order. However, also add individual async events to the thread flow (above), so we can easily
        // display them on the same chart as other events, should we choose so.
        if (TracingModel.isAsyncPhase(payload.ph)) {
            this._asyncEvents.push(event);
        }
        if (event.hasCategory(exports.DevToolsMetadataEventCategory)) {
            this._devToolsMetadataEvents.push(event);
        }
        if (payload.ph !== Phase.Metadata) {
            return;
        }
        switch (payload.name) {
            case MetadataEvent.ProcessSortIndex:
                // TODO(Christian) fix typings
                process.setSortIndex(payload.args['sort_index']);
                break;
            case MetadataEvent.ProcessName:
                const processName = payload.args['name'];
                process.setName(processName);
                this._processByName.set(processName, process);
                break;
            case MetadataEvent.ThreadSortIndex:
                process.threadById(payload.tid).setSortIndex(payload.args['sort_index']);
                break;
            case MetadataEvent.ThreadName:
                process.threadById(payload.tid).setName(payload.args['name']);
                break;
        }
    }
    /**
     * @param {!Event} event
     */
    _addSampleEvent(event) {
        const id = `${event.thread.process().id()}:${event.id}`;
        const group = this._profileGroups.get(id);
        if (group) {
            group.addChild(event);
            return;
        }
        this._profileGroups.set(id, new profileEventsGroup_1.default(event));
    }
    /**
     * @param {!Event} event
     * @return {?ProfileEventsGroup}
     */
    profileGroup(event) {
        return this._profileGroups.get(`${event.thread.process().id()}:${event.id}`) || null;
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
     * @return {!Array.<!Process>}
     */
    sortedProcesses() {
        return process_1.default.sort([...this._processById.values()]);
    }
    /**
     * @param {string} name
     * @return {?Process}
     */
    processByName(name) {
        return this._processByName.get(name);
    }
    /**
     * @param {number} pid
     * @return {?Process}
     */
    processById(pid) {
        return this._processById.get(pid) || null;
    }
    /**
     * @param {string} processName
     * @param {string} threadName
     * @return {?Thread}
     */
    threadByName(processName, threadName) {
        const process = this.processByName(processName);
        return process && process.threadByName(threadName);
    }
    _processPendingAsyncEvents() {
        utils_1.stableSort(this._asyncEvents, event_1.default.compareStartTime);
        for (let i = 0; i < this._asyncEvents.length; ++i) {
            const event = this._asyncEvents[i];
            if (TracingModel.isNestableAsyncPhase(event.phase)) {
                this._addNestableAsyncEvent(event);
            }
            else {
                this._addAsyncEvent(event);
            }
        }
        this._asyncEvents = [];
        this._closeOpenAsyncEvents();
    }
    _closeOpenAsyncEvents() {
        for (const event of this._openAsyncEvents.values()) {
            event.setEndTime(this._maximumRecordTime);
            // FIXME: remove this once we figure a better way to convert async console
            // events to sync [waterfall] timeline records.
            event.steps[0].setEndTime(this._maximumRecordTime);
        }
        this._openAsyncEvents.clear();
        for (const eventStack of this._openNestableAsyncEvents.values()) {
            while (eventStack.length) {
                eventStack.pop().setEndTime(this._maximumRecordTime);
            }
        }
        this._openNestableAsyncEvents.clear();
    }
    /**
     * @param {!SDK.TracingModel.Event} event
     */
    _addAsyncEvent(event) {
        const phase = Phase;
        const key = event.categoriesString + '.' + event.name + '.' + event.id;
        let asyncEvent = this._openAsyncEvents.get(key);
        if (event.phase === phase.AsyncBegin) {
            if (asyncEvent) {
                console.error(`Event ${event.name} has already been started`);
                return;
            }
            asyncEvent = new asyncEvent_1.default(event);
            this._openAsyncEvents.set(key, asyncEvent);
            event.thread.addAsyncEvent(asyncEvent);
            return;
        }
        if (!asyncEvent) {
            // Quietly ignore stray async events, we're probably too late for the start.
            return;
        }
        if (event.phase === phase.AsyncEnd) {
            asyncEvent.addStep(event);
            this._openAsyncEvents.delete(key);
            return;
        }
        if (event.phase === phase.AsyncStepInto || event.phase === phase.AsyncStepPast) {
            const lastStep = asyncEvent.steps[asyncEvent.steps.length - 1];
            if (lastStep.phase !== phase.AsyncBegin && lastStep.phase !== event.phase) {
                console.assert(false, 'Async event step phase mismatch: ' + lastStep.phase + ' at ' + lastStep.startTime + ' vs. ' +
                    event.phase + ' at ' + event.startTime);
                return;
            }
            asyncEvent.addStep(event);
            return;
        }
        console.assert(false, 'Invalid async event phase');
    }
    /**
     * @param {!Event} event
     */
    _addNestableAsyncEvent(event) {
        const phase = Phase;
        const key = event.categoriesString + '.' + event.id;
        let openEventsStack = this._openNestableAsyncEvents.get(key);
        switch (event.phase) {
            case phase.NestableAsyncBegin:
                if (!openEventsStack) {
                    openEventsStack = [];
                    this._openNestableAsyncEvents.set(key, openEventsStack);
                }
                const asyncEvent = new asyncEvent_1.default(event);
                openEventsStack.push(asyncEvent);
                event.thread.addAsyncEvent(asyncEvent);
                break;
            case phase.NestableAsyncInstant:
                if (openEventsStack && openEventsStack.length) {
                    openEventsStack[openEventsStack.length - 1].addStep(event);
                }
                break;
            case phase.NestableAsyncEnd:
                if (!openEventsStack || !openEventsStack.length) {
                    break;
                }
                const top = openEventsStack.pop();
                if (top.name !== event.name) {
                    console.error(`Begin/end event mismatch for nestable async event, ${top.name} vs. ${event.name}, key: ${key}`);
                    break;
                }
                top.addStep(event);
        }
    }
    /**
     * @param {!Event} event
     */
    addAsyncEvent(event) {
        const key = event.categoriesString + '.' + event.name + '.' + event.id;
        let asyncEvent = this._openAsyncEvents.get(key);
        if (event.phase === Phase.AsyncBegin) {
            if (asyncEvent) {
                console.error(`Event ${event.name} has already been started`);
                return;
            }
            asyncEvent = new asyncEvent_1.default(event);
            this._openAsyncEvents.set(key, asyncEvent);
            event.thread.addAsyncEvent(asyncEvent);
            return;
        }
        if (!asyncEvent) {
            // Quietly ignore stray async events, we're probably too late for the start.
            return;
        }
        if (event.phase === Phase.AsyncEnd) {
            asyncEvent.addStep(event);
            this._openAsyncEvents.delete(key);
            return;
        }
        if (event.phase === Phase.AsyncStepInto || event.phase === Phase.AsyncStepPast) {
            const lastStep = asyncEvent.steps[asyncEvent.steps.length - 1];
            if (lastStep.phase !== Phase.AsyncBegin && lastStep.phase !== event.phase) {
                console.assert(false, 'Async event step phase mismatch: ' +
                    lastStep.phase +
                    ' at ' +
                    lastStep.startTime +
                    ' vs. ' +
                    event.phase +
                    ' at ' +
                    event.startTime);
                return;
            }
            asyncEvent.addStep(event);
            return;
        }
        console.assert(false, 'Invalid async event phase');
    }
    /**
     * @param {string} str
     * @return {!Set<string>}
     */
    parsedCategoriesForString(str) {
        let parsedCategories = this._parsedCategories.get(str);
        if (!parsedCategories) {
            parsedCategories = new Set(str ? str.split(',') : []);
            this._parsedCategories.set(str, parsedCategories);
        }
        return parsedCategories;
    }
}
exports.default = TracingModel;
//# sourceMappingURL=index.js.map