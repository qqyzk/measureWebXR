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
const types_1 = require("../types");
const timelineRecordStyle_1 = __importDefault(require("./timelineModelFilter/timelineRecordStyle"));
const timelineJSProfileProcessor_1 = __importStar(require("./timelineJSProfileProcessor"));
const timelineData_1 = __importDefault(require("./timelineData"));
const tracingModel_1 = __importDefault(require("../tracingModel"));
const _1 = __importDefault(require("."));
const utils_1 = require("../utils");
const timelineVisibleEventsFilter_1 = __importDefault(require("./timelineModelFilter/timelineVisibleEventsFilter"));
const timelineCategory_1 = __importDefault(require("./timelineModelFilter/timelineCategory"));
var CategoryBreakdownCacheSymbol;
(function (CategoryBreakdownCacheSymbol) {
    CategoryBreakdownCacheSymbol[CategoryBreakdownCacheSymbol["categoryBreakdownCache"] = 0] = "categoryBreakdownCache";
})(CategoryBreakdownCacheSymbol = exports.CategoryBreakdownCacheSymbol || (exports.CategoryBreakdownCacheSymbol = {}));
class TimelineUIUtils {
    constructor() { }
    /**
     * @return {!Object.<string, !Timeline.TimelineRecordStyle>}
     */
    _initEventStyles() {
        if (this._eventStylesMap) {
            return this._eventStylesMap;
        }
        const type = types_1.RecordType;
        const categories = this.categories();
        const rendering = categories['rendering'];
        const scripting = categories['scripting'];
        const loading = categories['loading'];
        const painting = categories['painting'];
        const other = categories['other'];
        const eventStyles = {};
        eventStyles[type.Task] = new timelineRecordStyle_1.default('Task', other);
        eventStyles[type.Program] = new timelineRecordStyle_1.default('Other', other);
        eventStyles[type.Animation] = new timelineRecordStyle_1.default('Animation', rendering);
        eventStyles[type.EventDispatch] = new timelineRecordStyle_1.default('Event', scripting);
        eventStyles[type.RequestMainThreadFrame] = new timelineRecordStyle_1.default('Request Main Thread Frame', rendering, true);
        eventStyles[type.BeginFrame] = new timelineRecordStyle_1.default('Frame Start', rendering, true);
        eventStyles[type.BeginMainThreadFrame] = new timelineRecordStyle_1.default('Frame Start (main thread)', rendering, true);
        eventStyles[type.DrawFrame] = new timelineRecordStyle_1.default('Draw Frame', rendering, true);
        eventStyles[type.HitTest] = new timelineRecordStyle_1.default('Hit Test', rendering);
        eventStyles[type.ScheduleStyleRecalculation] = new timelineRecordStyle_1.default('Schedule Style Recalculation', rendering);
        eventStyles[type.RecalculateStyles] = new timelineRecordStyle_1.default('Recalculate Style', rendering);
        eventStyles[type.UpdateLayoutTree] = new timelineRecordStyle_1.default('Recalculate Style', rendering);
        eventStyles[type.InvalidateLayout] = new timelineRecordStyle_1.default('Invalidate Layout', rendering, true);
        eventStyles[type.Layout] = new timelineRecordStyle_1.default('Layout', rendering);
        eventStyles[type.PaintSetup] = new timelineRecordStyle_1.default('Paint Setup', painting);
        eventStyles[type.PaintImage] = new timelineRecordStyle_1.default('Paint Image', painting, true);
        eventStyles[type.UpdateLayer] = new timelineRecordStyle_1.default('Update Layer', painting, true);
        eventStyles[type.UpdateLayerTree] = new timelineRecordStyle_1.default('Update Layer Tree', rendering);
        eventStyles[type.Paint] = new timelineRecordStyle_1.default('Paint', painting);
        eventStyles[type.RasterTask] = new timelineRecordStyle_1.default('Rasterize Paint', painting);
        eventStyles[type.ScrollLayer] = new timelineRecordStyle_1.default('Scroll', rendering);
        eventStyles[type.CompositeLayers] = new timelineRecordStyle_1.default('Composite Layers', painting);
        eventStyles[type.ParseHTML] = new timelineRecordStyle_1.default('Parse HTML', loading);
        eventStyles[type.ParseAuthorStyleSheet] = new timelineRecordStyle_1.default('Parse Stylesheet', loading);
        eventStyles[type.TimerInstall] = new timelineRecordStyle_1.default('Install Timer', scripting);
        eventStyles[type.TimerRemove] = new timelineRecordStyle_1.default('Remove Timer', scripting);
        eventStyles[type.TimerFire] = new timelineRecordStyle_1.default('Timer Fired', scripting);
        eventStyles[type.XHRReadyStateChange] = new timelineRecordStyle_1.default('XHR Ready State Change', scripting);
        eventStyles[type.XHRLoad] = new timelineRecordStyle_1.default('XHR Load', scripting);
        eventStyles[type.CompileScript] = new timelineRecordStyle_1.default('Compile Script', scripting);
        eventStyles[type.EvaluateScript] = new timelineRecordStyle_1.default('Evaluate Script', scripting);
        eventStyles[type.CompileModule] = new timelineRecordStyle_1.default('Compile Module', scripting);
        eventStyles[type.EvaluateModule] = new timelineRecordStyle_1.default('Evaluate Module', scripting);
        eventStyles[type.ParseScriptOnBackground] = new timelineRecordStyle_1.default('Parse Script', scripting);
        eventStyles[type.WasmStreamFromResponseCallback] = new timelineRecordStyle_1.default('Streaming Wasm Response', scripting);
        eventStyles[type.WasmCompiledModule] = new timelineRecordStyle_1.default('Compiled Wasm Module', scripting);
        eventStyles[type.WasmCachedModule] = new timelineRecordStyle_1.default('Cached Wasm Module', scripting);
        eventStyles[type.WasmModuleCacheHit] = new timelineRecordStyle_1.default('Wasm Module Cache Hit', scripting);
        eventStyles[type.WasmModuleCacheInvalid] = new timelineRecordStyle_1.default('Wasm Module Cache Invalid', scripting);
        eventStyles[type.FrameStartedLoading] = new timelineRecordStyle_1.default('Frame Started Loading', loading, true);
        eventStyles[type.MarkLoad] = new timelineRecordStyle_1.default('Onload Event', scripting, true);
        eventStyles[type.MarkDOMContent] = new timelineRecordStyle_1.default('DOMContentLoaded Event', scripting, true);
        eventStyles[type.MarkFirstPaint] = new timelineRecordStyle_1.default('First Paint', painting, true);
        eventStyles[type.MarkFCP] = new timelineRecordStyle_1.default('First Contentful Paint', rendering, true);
        eventStyles[type.MarkFMP] = new timelineRecordStyle_1.default('First Meaningful Paint', rendering, true);
        eventStyles[type.TimeStamp] = new timelineRecordStyle_1.default('Timestamp', scripting);
        eventStyles[type.ConsoleTime] = new timelineRecordStyle_1.default('Console Time', scripting);
        eventStyles[type.UserTiming] = new timelineRecordStyle_1.default('User Timing', scripting);
        eventStyles[type.ResourceSendRequest] = new timelineRecordStyle_1.default('Send Request', loading);
        eventStyles[type.ResourceReceiveResponse] = new timelineRecordStyle_1.default('Receive Response', loading);
        eventStyles[type.ResourceFinish] = new timelineRecordStyle_1.default('Finish Loading', loading);
        eventStyles[type.ResourceReceivedData] = new timelineRecordStyle_1.default('Receive Data', loading);
        eventStyles[type.RunMicrotasks] = new timelineRecordStyle_1.default('Run Microtasks', scripting);
        eventStyles[type.FunctionCall] = new timelineRecordStyle_1.default('Function Call', scripting);
        eventStyles[type.GCEvent] = new timelineRecordStyle_1.default('GC Event', scripting);
        eventStyles[type.MajorGC] = new timelineRecordStyle_1.default('Major GC', scripting);
        eventStyles[type.MinorGC] = new timelineRecordStyle_1.default('Minor GC', scripting);
        eventStyles[type.JSFrame] = new timelineRecordStyle_1.default('JS Frame', scripting);
        eventStyles[type.RequestAnimationFrame] = new timelineRecordStyle_1.default('Request Animation Frame', scripting);
        eventStyles[type.CancelAnimationFrame] = new timelineRecordStyle_1.default('Cancel Animation Frame', scripting);
        eventStyles[type.FireAnimationFrame] = new timelineRecordStyle_1.default('Animation Frame Fired', scripting);
        eventStyles[type.RequestIdleCallback] = new timelineRecordStyle_1.default('Request Idle Callback', scripting);
        eventStyles[type.CancelIdleCallback] = new timelineRecordStyle_1.default('Cancel Idle Callback', scripting);
        eventStyles[type.FireIdleCallback] = new timelineRecordStyle_1.default('Fire Idle Callback', scripting);
        eventStyles[type.WebSocketCreate] = new timelineRecordStyle_1.default('Create WebSocket', scripting);
        eventStyles[type.WebSocketSendHandshakeRequest] = new timelineRecordStyle_1.default('Send WebSocket Handshake', scripting);
        eventStyles[type.WebSocketReceiveHandshakeResponse] = new timelineRecordStyle_1.default('Receive WebSocket Handshake', scripting);
        eventStyles[type.WebSocketDestroy] = new timelineRecordStyle_1.default('Destroy WebSocket', scripting);
        eventStyles[type.EmbedderCallback] = new timelineRecordStyle_1.default('Embedder Callback', scripting);
        eventStyles[type.DecodeImage] = new timelineRecordStyle_1.default('Image Decode', painting);
        eventStyles[type.ResizeImage] = new timelineRecordStyle_1.default('Image Resize', painting);
        eventStyles[type.GPUTask] = new timelineRecordStyle_1.default('GPU', categories['gpu']);
        eventStyles[type.LatencyInfo] = new timelineRecordStyle_1.default('Input Latency', scripting);
        eventStyles[type.GCCollectGarbage] = new timelineRecordStyle_1.default('DOM GC', scripting);
        eventStyles[type.CryptoDoEncrypt] = new timelineRecordStyle_1.default('Encrypt', scripting);
        eventStyles[type.CryptoDoEncryptReply] = new timelineRecordStyle_1.default('Encrypt Reply', scripting);
        eventStyles[type.CryptoDoDecrypt] = new timelineRecordStyle_1.default('Decrypt', scripting);
        eventStyles[type.CryptoDoDecryptReply] = new timelineRecordStyle_1.default('Decrypt Reply', scripting);
        eventStyles[type.CryptoDoDigest] = new timelineRecordStyle_1.default('Digest', scripting);
        eventStyles[type.CryptoDoDigestReply] = new timelineRecordStyle_1.default('Digest Reply', scripting);
        eventStyles[type.CryptoDoSign] = new timelineRecordStyle_1.default('Sign', scripting);
        eventStyles[type.CryptoDoSignReply] = new timelineRecordStyle_1.default('Sign Reply', scripting);
        eventStyles[type.CryptoDoVerify] = new timelineRecordStyle_1.default('Verify', scripting);
        eventStyles[type.CryptoDoVerifyReply] = new timelineRecordStyle_1.default('Verify Reply', scripting);
        eventStyles[type.AsyncTask] = new timelineRecordStyle_1.default('Async Task', categories['async']);
        this._eventStylesMap = eventStyles;
        return eventStyles;
    }
    /**
     * @param {!TimelineModel.TimelineIRModel.InputEvents} inputEventType
     * @return {?string}
     */
    static inputEventDisplayName(inputEventType) {
        return null;
    }
    /**
     * @param {!Protocol.Runtime.CallFrame} frame
     * @return {string}
     */
    static frameDisplayName(frame) {
        if (!timelineJSProfileProcessor_1.default.isNativeRuntimeFrame(frame)) {
            return frame.functionName;
        }
        const nativeGroup = timelineJSProfileProcessor_1.default.nativeGroup(frame.functionName);
        const groups = timelineJSProfileProcessor_1.NativeGroups;
        switch (nativeGroup) {
            case groups.Compile:
                return 'Compile';
            case groups.Parse:
                return 'Parse';
        }
        return frame.functionName;
    }
    /**
     * @param {!SDK.TracingModel.Event} traceEvent
     * @param {!RegExp} regExp
     * @return {boolean}
     */
    testContentMatching(traceEvent, regExp) {
        const title = this.eventStyle(traceEvent).title;
        const tokens = [title];
        const url = timelineData_1.default.forEvent(traceEvent).url;
        if (url) {
            tokens.push(url);
        }
        appendObjectProperties(traceEvent.args, 2);
        return regExp.test(tokens.join('|'));
        /**
         * @param {!Object} object
         * @param {number} depth
         */
        function appendObjectProperties(object, depth) {
            if (!depth) {
                return;
            }
            for (const key in object) {
                const value = object[key];
                const type = typeof value;
                if (type === 'string') {
                    tokens.push(value);
                }
                else if (type === 'number') {
                    tokens.push(String(value));
                }
                else if (type === 'object') {
                    appendObjectProperties(value, depth - 1);
                }
            }
        }
    }
    /**
     * @param {!SDK.TracingModel.Event} event
     * @return {?string}
     */
    static eventURL(event) {
        const data = event.args['data'] || event.args['beginData'];
        const url = data && data.url;
        if (url) {
            return url;
        }
        const stackTrace = data && data['stackTrace'];
        const frame = (stackTrace && stackTrace.length && stackTrace[0]) || timelineData_1.default.forEvent(event).topFrame();
        return (frame && frame.url) || null;
    }
    /**
     * @param {!SDK.TracingModel.Event} event
     * @return {!{title: string, category: !Timeline.TimelineCategory}}
     */
    eventStyle(event) {
        const eventStyles = this._initEventStyles();
        if (event.hasCategory(types_1.Category.Console) || event.hasCategory(types_1.Category.UserTiming)) {
            return {
                title: event.name,
                category: this.categories()['scripting'],
            };
        }
        if (event.hasCategory(types_1.Category.LatencyInfo)) {
            /** @const */
            const prefix = 'InputLatency::';
            const inputEventType = event.name.startsWith(prefix) ? event.name.substr(prefix.length) : event.name;
            const displayName = TimelineUIUtils.inputEventDisplayName(
            /** @type {!TimelineModel.TimelineIRModel.InputEvents} */ inputEventType);
            return { title: displayName || inputEventType, category: this.categories()['scripting'] };
        }
        let result = eventStyles[event.name];
        if (!result) {
            result = new timelineRecordStyle_1.default(event.name, this.categories()['other'], true);
            eventStyles[event.name] = result;
        }
        return result;
    }
    /**
     * @param {!SDK.TracingModel.Event} event
     * @return {string}
     */
    eventTitle(event) {
        const recordType = types_1.RecordType;
        const eventData = event.args['data'];
        if (event.name === recordType.JSFrame) {
            return TimelineUIUtils.frameDisplayName(eventData);
        }
        const title = this.eventStyle(event).title;
        if (event.hasCategory(types_1.Category.Console)) {
            return title;
        }
        if (event.name === recordType.TimeStamp) {
            return `${title}: ${eventData['message']}`;
        }
        if (event.name === recordType.Animation && eventData && eventData['name']) {
            return `${title}: ${eventData['name']}`;
        }
        if (event.name === recordType.EventDispatch && eventData && eventData['type']) {
            return `${title}: ${eventData['type']}`;
        }
        return title;
    }
    /**
     * @param {!Protocol.Runtime.CallFrame} frame
     * @return {boolean}
     */
    static isUserFrame(frame) {
        return frame.scriptId !== '0' && !(frame.url && frame.url.startsWith('native '));
    }
    /**
     * @param {!TimelineModel.TimelineModel.NetworkRequest} request
     * @return {!TimelineUIUtils.NetworkCategory}
     */
    static networkRequestCategory(request) {
        const categories = types_1.NetworkCategory;
        switch (request.mimeType) {
            case 'text/html':
                return categories.HTML;
            case 'application/javascript':
            case 'application/x-javascript':
            case 'text/javascript':
                return categories.Script;
            case 'text/css':
                return categories.Style;
            case 'audio/ogg':
            case 'image/gif':
            case 'image/jpeg':
            case 'image/png':
            case 'image/svg+xml':
            case 'image/webp':
            case 'image/x-icon':
            case 'font/opentype':
            case 'font/woff2':
            case 'application/font-woff':
                return categories.Media;
            default:
                return categories.Other;
        }
    }
    /**
     * @param {!TimelineUIUtils.NetworkCategory} category
     * @return {string}
     */
    static networkCategoryColor(category) {
        const categories = types_1.NetworkCategory;
        switch (category) {
            case categories.HTML:
                return 'hsl(214, 67%, 66%)';
            case categories.Script:
                return 'hsl(43, 83%, 64%)';
            case categories.Style:
                return 'hsl(256, 67%, 70%)';
            case categories.Media:
                return 'hsl(109, 33%, 55%)';
            default:
                return 'hsl(0, 0%, 70%)';
        }
    }
    /**
     * @param {!SDK.TracingModel.Event} event
     * @param {?SDK.Target} target
     * @return {?string}
     */
    static buildDetailsTextForTraceEvent(event, target) {
        const recordType = types_1.RecordType;
        let detailsText;
        const eventArgs = event.args;
        const eventData = eventArgs['data'];
        switch (event.name) {
            case recordType.GCEvent:
            case recordType.MajorGC:
            case recordType.MinorGC: {
                const delta = eventArgs['usedHeapSizeBefore'] - eventArgs['usedHeapSizeAfter'];
                detailsText = `${delta} collected`;
                break;
            }
            case recordType.FunctionCall:
                if (eventData) {
                    detailsText = linkifyLocationAsText(eventData['scriptId'], eventData['lineNumber'], eventData['columnNumber']);
                }
                break;
            case recordType.JSFrame:
                detailsText = TimelineUIUtils.frameDisplayName(eventData);
                break;
            case recordType.EventDispatch:
                detailsText = eventData ? eventData['type'] : null;
                break;
            case recordType.Paint: {
                const width = TimelineUIUtils.quadWidth(eventData.clip);
                const height = TimelineUIUtils.quadHeight(eventData.clip);
                if (width && height) {
                    detailsText = `${width}\xa0\u00d7\xa0${height}`;
                }
                break;
            }
            case recordType.ParseHTML: {
                const startLine = eventArgs['beginData']['startLine'];
                const endLine = eventArgs['endData'] && eventArgs['endData']['endLine'];
                const url = eventArgs['beginData']['url'];
                if (endLine >= 0) {
                    detailsText = `${url}, ${startLine + 1}, ${endLine + 1}`;
                }
                else {
                    detailsText = `${url} [${startLine + 1}\u2026]`;
                }
                break;
            }
            case recordType.CompileModule:
                detailsText = eventArgs['fileName'];
                break;
            case recordType.CompileScript:
            case recordType.EvaluateScript: {
                const url = eventData && eventData['url'];
                if (url) {
                    detailsText = url + ':' + (eventData['lineNumber'] + 1);
                }
                break;
            }
            case recordType.WasmCompiledModule:
            case recordType.WasmModuleCacheHit: {
                const url = eventArgs['url'];
                if (url) {
                    detailsText = url;
                }
                break;
            }
            case recordType.ParseScriptOnBackground:
            case recordType.XHRReadyStateChange:
            case recordType.XHRLoad: {
                const url = eventData['url'];
                if (url) {
                    detailsText = url;
                }
                break;
            }
            case recordType.TimeStamp:
                detailsText = eventData['message'];
                break;
            case recordType.WebSocketCreate:
            case recordType.WebSocketSendHandshakeRequest:
            case recordType.WebSocketReceiveHandshakeResponse:
            case recordType.WebSocketDestroy:
            case recordType.ResourceSendRequest:
            case recordType.ResourceReceivedData:
            case recordType.ResourceReceiveResponse:
            case recordType.ResourceFinish:
            case recordType.PaintImage:
            case recordType.DecodeImage:
            case recordType.ResizeImage:
            case recordType.DecodeLazyPixelRef: {
                const url = timelineData_1.default.forEvent(event).url;
                if (url) {
                    detailsText = url;
                }
                break;
            }
            case recordType.EmbedderCallback:
                detailsText = eventData['callbackName'];
                break;
            case recordType.Animation:
                detailsText = eventData && eventData['name'];
                break;
            case recordType.AsyncTask:
                detailsText = eventData ? eventData['name'] : null;
                break;
            default:
                if (event.hasCategory(types_1.Category.Console)) {
                    detailsText = null;
                }
                else {
                    detailsText = linkifyTopCallFrameAsText();
                }
                break;
        }
        return detailsText;
        /**
         * @param {string} scriptId
         * @param {number} lineNumber
         * @param {number} columnNumber
         * @return {?string}
         */
        function linkifyLocationAsText(scriptId, lineNumber, columnNumber) {
            return null;
        }
        /**
         * @return {?string}
         */
        function linkifyTopCallFrameAsText() {
            const frame = timelineData_1.default.forEvent(event).topFrame();
            if (!frame) {
                return null;
            }
            let text = linkifyLocationAsText(frame.scriptId, frame.lineNumber, frame.columnNumber);
            if (!text) {
                text = frame.url;
                if (typeof frame.lineNumber === 'number') {
                    text += ':' + (frame.lineNumber + 1);
                }
            }
            return text;
        }
    }
    /**
     * @param {!Array<!SDK.TracingModel.Event>} events
     * @param {number} startTime
     * @param {number} endTime
     * @return {!Object<string, number>}
     */
    statsForTimeRange(events, startTime, endTime) {
        const eventStyle = this.eventStyle.bind(this);
        const visibleEventsFilterFunc = this.visibleEventsFilter.bind(this);
        if (!events.length) {
            return { idle: endTime - startTime };
        }
        buildRangeStatsCacheIfNeeded(events);
        const aggregatedStats = subtractStats(aggregatedStatsAtTime(endTime), aggregatedStatsAtTime(startTime));
        const aggregatedTotal = Object.values(aggregatedStats).reduce((a, b) => a + b, 0);
        aggregatedStats['idle'] = Math.max(0, endTime - startTime - aggregatedTotal);
        return aggregatedStats;
        /**
         * @param {number} time
         * @return {!Object}
         */
        function aggregatedStatsAtTime(time) {
            const stats = {};
            const cache = events[CategoryBreakdownCacheSymbol.categoryBreakdownCache];
            for (const category in cache) {
                const categoryCache = cache[category];
                let value;
                if (!categoryCache.time) {
                    value = 0;
                }
                else {
                    const index = utils_1.upperBound(categoryCache.time, time);
                    if (index === 0) {
                        value = 0;
                    }
                    else if (index === categoryCache.time.length) {
                        value = categoryCache.value[categoryCache.value.length - 1];
                    }
                    else {
                        const t0 = categoryCache.time[index - 1];
                        const t1 = categoryCache.time[index];
                        const v0 = categoryCache.value[index - 1];
                        const v1 = categoryCache.value[index];
                        value = v0 + ((v1 - v0) * (time - t0)) / (t1 - t0);
                    }
                }
                stats[category] = value;
            }
            return stats;
        }
        /**
         * @param {!Object<string, number>} a
         * @param {!Object<string, number>} b
         * @return {!Object<string, number>}
         */
        function subtractStats(a, b) {
            const result = Object.assign({}, a);
            for (const key in b) {
                result[key] -= b[key];
            }
            return result;
        }
        /**
         * @param {!Array<!SDK.TracingModel.Event>} events
         */
        function buildRangeStatsCacheIfNeeded(events) {
            // if (events[CategoryBreakdownCacheSymbol.categoryBreakdownCache]) return
            // aggeregatedStats is a map by categories. For each category there's an array
            // containing sorted time points which records accumulated value of the category.
            const aggregatedStats = {};
            const categoryStack = [];
            let lastTime = 0;
            _1.default.forEachEvent(events, onStartEvent, onEndEvent, undefined, undefined, undefined, filterForStats());
            /**
             * @return {function(!SDK.TracingModel.Event):boolean}
             */
            function filterForStats() {
                const visibleEventsFilter = visibleEventsFilterFunc();
                return (event) => visibleEventsFilter.accept(event) || tracingModel_1.default.isTopLevelEvent(event);
            }
            /**
             * @param {string} category
             * @param {number} time
             */
            function updateCategory(category, time) {
                let statsArrays = aggregatedStats[category];
                if (!statsArrays) {
                    statsArrays = { time: [], value: [] };
                    aggregatedStats[category] = statsArrays;
                }
                if (statsArrays.time.length && statsArrays.time[statsArrays.time.length - 1] === time) {
                    return;
                }
                const lastValue = statsArrays.value.length ? statsArrays.value[statsArrays.value.length - 1] : 0;
                statsArrays.value.push(lastValue + time - lastTime);
                statsArrays.time.push(time);
            }
            /**
             * @param {?string} from
             * @param {?string} to
             * @param {number} time
             */
            function categoryChange(from, to, time) {
                if (from) {
                    updateCategory(from, time);
                }
                lastTime = time;
                if (to) {
                    updateCategory(to, time);
                }
            }
            /**
             * @param {!SDK.TracingModel.Event} e
             */
            function onStartEvent(e) {
                const category = eventStyle(e).category.name;
                const parentCategory = categoryStack.length ? categoryStack[categoryStack.length - 1] : null;
                if (category !== parentCategory) {
                    categoryChange(parentCategory, category, e.startTime);
                }
                categoryStack.push(category);
            }
            /**
             * @param {!SDK.TracingModel.Event} e
             */
            function onEndEvent(e) {
                const category = categoryStack.pop();
                const parentCategory = categoryStack.length ? categoryStack[categoryStack.length - 1] : null;
                if (category !== parentCategory) {
                    categoryChange(category, parentCategory, e.endTime);
                }
            }
            const obj = events;
            obj[CategoryBreakdownCacheSymbol.categoryBreakdownCache] = aggregatedStats;
        }
    }
    /**
     * @param {!Array<!Protocol.Runtime.CallFrame>} callFrames
     * @return {!Protocol.Runtime.StackTrace}
     */
    static _stackTraceFromCallFrames(callFrames) {
        return /** @type {!Protocol.Runtime.StackTrace} */ { callFrames: callFrames };
    }
    /**
     * @param {!Object} total
     * @param {!TimelineModel.TimelineModel} model
     * @param {!SDK.TracingModel.Event} event
     * @return {boolean}
     */
    _aggregatedStatsForTraceEvent(total, model, event) {
        const events = model.inspectedTargetEvents();
        /**
         * @param {number} startTime
         * @param {!SDK.TracingModel.Event} e
         * @return {number}
         */
        function eventComparator(startTime, e) {
            return startTime - e.startTime;
        }
        const index = utils_1.binaryIndexOf(events, event.startTime, eventComparator);
        // Not a main thread event?
        if (index < 0) {
            return false;
        }
        let hasChildren = false;
        const endTime = event.endTime;
        if (endTime) {
            for (let i = index; i < events.length; i++) {
                const nextEvent = events[i];
                if (nextEvent.startTime >= endTime) {
                    break;
                }
                if (!nextEvent.selfTime) {
                    continue;
                }
                if (nextEvent.thread !== event.thread) {
                    continue;
                }
                if (i > index) {
                    hasChildren = true;
                }
                const categoryName = this.eventStyle(nextEvent).category.name;
                total[categoryName] = (total[categoryName] || 0) + nextEvent.selfTime;
            }
        }
        if (tracingModel_1.default.isAsyncPhase(event.phase)) {
            if (event.endTime) {
                let aggregatedTotal = 0;
                for (const categoryName in total) {
                    aggregatedTotal += total[categoryName];
                }
                total['idle'] = Math.max(0, event.endTime - event.startTime - aggregatedTotal);
            }
            return false;
        }
        return hasChildren;
    }
    /**
     * @return {!Array.<string>}
     */
    _visibleTypes() {
        const eventStyles = this._initEventStyles();
        const result = [];
        for (const name in eventStyles) {
            if (!eventStyles[name].hidden) {
                result.push(name);
            }
        }
        return result;
    }
    /**
     * @return {!TimelineModel.TimelineModelFilter}
     */
    visibleEventsFilter() {
        return new timelineVisibleEventsFilter_1.default(this._visibleTypes());
    }
    /**
     * @return {!Object.<string, !Timeline.TimelineCategory>}
     */
    categories() {
        if (this._categories) {
            return this._categories;
        }
        this._categories = {
            loading: new timelineCategory_1.default('loading', 'Loading', true, 'hsl(214, 67%, 74%)', 'hsl(214, 67%, 66%)'),
            scripting: new timelineCategory_1.default('scripting', 'ScriptingYo3', true, 'hsl(43, 83%, 72%)', 'hsl(43, 83%, 64%) '),
            rendering: new timelineCategory_1.default('rendering', 'Rendering', true, 'hsl(256, 67%, 76%)', 'hsl(256, 67%, 70%)'),
            painting: new timelineCategory_1.default('painting', 'Painting', true, 'hsl(109, 33%, 64%)', 'hsl(109, 33%, 55%)'),
            gpu: new timelineCategory_1.default('gpu', 'GPU', false, 'hsl(109, 33%, 64%)', 'hsl(109, 33%, 55%)'),
            async: new timelineCategory_1.default('async', 'Async', false, 'hsl(0, 100%, 50%)', 'hsl(0, 100%, 40%)'),
            other: new timelineCategory_1.default('other', 'System', false, 'hsl(0, 0%, 87%)', 'hsl(0, 0%, 79%)'),
            idle: new timelineCategory_1.default('idle', 'Idle', false, 'hsl(0, 0%, 98%)', 'hsl(0, 0%, 98%)'),
        };
        return this._categories;
    }
    /**
     * @param {!Array.<number>} quad
     * @return {number}
     */
    static quadWidth(quad) {
        return Math.round(Math.sqrt(Math.pow(quad[0] - quad[2], 2) + Math.pow(quad[1] - quad[3], 2)));
    }
    /**
     * @param {!Array.<number>} quad
     * @return {number}
     */
    static quadHeight(quad) {
        return Math.round(Math.sqrt(Math.pow(quad[0] - quad[6], 2) + Math.pow(quad[1] - quad[7], 2)));
    }
    /**
     * @param {!SDK.TracingModel.Event} event
     * @return {?string}
     */
    static markerShortTitle(event) {
        const recordTypes = types_1.RecordType;
        switch (event.name) {
            case recordTypes.MarkDOMContent:
                return 'DCL';
            case recordTypes.MarkLoad:
                return 'L';
            case recordTypes.MarkFirstPaint:
                return 'FP';
            case recordTypes.MarkFCP:
                return 'FCP';
            case recordTypes.MarkFMP:
                return 'FMP';
        }
        return null;
    }
}
exports.default = TimelineUIUtils;
//# sourceMappingURL=timelineUIUtils.js.map