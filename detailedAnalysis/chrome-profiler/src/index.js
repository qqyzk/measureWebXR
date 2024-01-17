"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const loader_1 = __importDefault(require("../devtools/loader"));
const utils_1 = require("../devtools/utils");
const track_1 = require("../devtools/timelineModel/track");
const timelineUIUtils_1 = __importDefault(require("../devtools/timelineModel/timelineUIUtils"));
const timelineData_1 = __importDefault(require("../devtools/timelineModel/timelineData"));
const counterGraph_1 = __importDefault(require("../devtools/timelineModel/counterGraph"));
const utils_2 = __importDefault(require("./utils"));

class Tracelib {
    constructor(tracelog, range) {
        this.tracelog = tracelog;
        this._timelineLoader = new loader_1.default(this.tracelog);
        this._timelineLoader.init();
        this._performanceModel = this._timelineLoader.performanceModel;
    }

    _findMainTrack() {
        const threads = this._performanceModel
            .timelineModel()
            .tracks();
        const mainTrack = threads.find((track) => Boolean(track.type === track_1.TrackType.MainThread && track.forMainFrame && track.events.length));
        /**
         * If no main thread could be found, pick the thread with most events
         * captured in it and assume this is the main track.
         */
        if (!mainTrack) {
            return threads.slice(1).reduce((curr, com) => curr.events.length > com.events.length ? curr : com, threads[0]);
        }
        return mainTrack;
    }

    _findGPUTrack() {
        const threads = this._performanceModel
        .timelineModel()
        .tracks();
        const GPUTracks = threads.filter((track) => Boolean(track.type === track_1.TrackType.GPU));
        if(!GPUTracks || GPUTracks.length!=1)
            console.log('GPU track found error!')
        return GPUTracks[0];

    }
    getGPUUsage(from,to){
        const timelineUtils = new timelineUIUtils_1.default();
        const startTime = from || this._performanceModel.timelineModel().minimumRecordTime();
        const endTime = to || this._performanceModel.timelineModel().maximumRecordTime();
        const GPUTrack = this._findGPUTrack();
        // We are facing data mutaion issue in devtools, to avoid it cloning syncEvents
        const syncEvents = GPUTrack.syncEvents().slice();
        return Object.assign(Object.assign({}, timelineUtils.statsForTimeRange(syncEvents, startTime, endTime)), { startTime,
            endTime });
    }

    getUsageArray(from,to){
        const fs = require('fs');
        let delta=10;
        let cpuusages=[];
        let gpuusages=[];
        let times=[]
        for(let i=from;i<to;i+=delta){
            let summary = tasks.getSummary(i,i+delta);
            let cpuusage = summary.scripting/(summary.endTime-summary.startTime);
            let gpu_summary = tasks.getGPUUsage(i,i+delta);
            let gpuusage = gpu_summary.gpu/(gpu_summary.endTime-gpu_summary.startTime);
            cpuusages.push(cpuusage);
            gpuusages.push(gpuusage);
            times.push(i);
        }
        console.log(cpuusages)
        console.log(gpuusages)
        console.log(times)
        try {
            fs.writeFileSync('../file.txt', cpuusages.toString());
            // fs.writeFileSync('../file.txt', gpuusages.toString());
            // fs.writeFileSync('../file.txt', times.toString());
            console.log("File has been saved.");
        } catch (error) {
            console.error(err);
        }
    }

    _findThreadPoolForegroundWorker(){
        const threads = this._performanceModel
        .timelineModel()
        .tracks();
        const PoolTracks = threads.filter((track) => Boolean(track.name === 'ThreadPoolForegroundWorker'));
        return PoolTracks; 
    }

    getImageDecodeTimes(){
        const PoolTracks = this._findThreadPoolForegroundWorker();
        // console.log(PoolTracks)
        let startTimes = [];
        let endTimes = [];
        for(let i=0;i<PoolTracks.length;i+=1){
            const PoolTrackEvents = PoolTracks[i]['events'];
            const imageDecodeEvents = PoolTrackEvents.filter((event)=>Boolean(event.name == 'Decode Image'))
            for(let j=0;j<imageDecodeEvents.length;j+=1){
                startTimes.push(imageDecodeEvents[j]['startTime']);
                endTimes.push(imageDecodeEvents[j]['endTime']);
            }
        }
        let totalstart = Math.min.apply(null,startTimes);
        let totalend = Math.max.apply(null,endTimes);
        let duration = totalend - totalstart;
        return (
            {
                'start':totalstart,
                'end':totalend
            }
        )
    }

  
    getNetworkTimes(){
        let networkRequests = this._performanceModel
        .timelineModel()
        .networkRequests();
        let startTimes = [];
        let endTimes = [];
        for(let i=0;i<networkRequests.length;i+=1){
            startTimes.push(networkRequests[i]['startTime']);
            endTimes.push(networkRequests[i]['endTime']);
        }
        let totalstart = Math.min.apply(null,startTimes);
        let totalend = Math.max.apply(null,endTimes);
        let duration = totalend - totalstart;
        return (
            {
                'start':totalstart,
                'end':totalend
            }
        )
    }
    

    getMainTrackEvents() {
        const mainTrack = this._findMainTrack();
        return mainTrack.events;
    }

    getFPS() {
        const fpsData = {
            times: [],
            values: []
        };
        this._timelineLoader.performanceModel.frames().forEach(({ duration, startTime }) => {
            fpsData.values.push(utils_1.calcFPS(duration));
            fpsData.times.push(startTime);
        });
        return fpsData;
    }

    getSummary(from, to) {
        const timelineUtils = new timelineUIUtils_1.default();
        const startTime = from || this._performanceModel.timelineModel().minimumRecordTime();
        const endTime = to || this._performanceModel.timelineModel().maximumRecordTime();
        const mainTrack = this._findMainTrack();
        // We are facing data mutaion issue in devtools, to avoid it cloning syncEvents
        const syncEvents = mainTrack.syncEvents().slice();
        return Object.assign(Object.assign({}, timelineUtils.statsForTimeRange(syncEvents, startTime, endTime)), { startTime,
            endTime });
    }
    getWarningCounts() {
        const mainTrack = this._findMainTrack();
        return mainTrack.events.reduce((counter, event) => {
            const timelineData = timelineData_1.default.forEvent(event);
            const warning = timelineData.warning;
            if (warning) {
                counter[warning] = counter[warning] ? counter[warning] + 1 : 1;
            }
            return counter;
        }, {});
    }
    getMemoryCounters() {
        const counterGraph = new counterGraph_1.default();
        const counters = counterGraph.setModel(this._performanceModel, this._findMainTrack());
        return Object.keys(counters).reduce((acc, counter) => (Object.assign(Object.assign({}, acc), { [counter]: {
                times: counters[counter].times,
                values: counters[counter].values,
            } })), {});
    }
    getDetailStats(from, to) {
        const timelineUtils = new utils_2.default();
        const startTime = from || this._performanceModel.timelineModel().minimumRecordTime();
        const endTime = to || this._performanceModel.timelineModel().maximumRecordTime();
        const mainTrack = this._findMainTrack();
        // We are facing data mutaion issue in devtools, to avoid it cloning syncEvents
        const syncEvents = mainTrack.syncEvents().slice();
        return Object.assign(Object.assign({}, timelineUtils.detailStatsForTimeRange(syncEvents, startTime, endTime)), { range: {
                times: [startTime, endTime],
                values: [startTime, endTime]
            } });
    }
}

let JANK_TRACE_LOG = require('./ar-threear-gltf-Box-512.json');
const tasks = new Tracelib(JANK_TRACE_LOG);
// let gpu_summary = tasks.getGPUUsage(t5,t6);
// console.log(gpu_summary.gpu/(gpu_summary.endTime-gpu_summary.startTime));
let clickTime=4005.1;
let sceneLoadTime=5265;
let firstRenderTime=5533.5;
let networkTimes = tasks.getNetworkTimes();
let imageDecodeTimes = tasks.getImageDecodeTimes();
let t1=networkTimes.start;
let t2 = networkTimes.end;
let t3=imageDecodeTimes.end;
let t4=sceneLoadTime-clickTime+t1;
let t5=firstRenderTime-clickTime+t1;
let t6=t5+60000;

let example_summary = tasks.getSummary();
console.log(example_summary)
console.log(networkTimes)
console.log(imageDecodeTimes)
tasks.getUsageArray(11917955.315,t5+1000)


// let summary = tasks.getSummary(t1,t2);
// let cpuusage1 = summary.scripting/(summary.endTime-summary.startTime);
// let gpu_summary = tasks.getGPUUsage(t1,t2);
// let gpuusage1=gpu_summary.gpu/(gpu_summary.endTime-gpu_summary.startTime);
// summary = tasks.getSummary(t2,t3);
// let cpuusage2 = summary.scripting/(summary.endTime-summary.startTime);
// gpu_summary = tasks.getGPUUsage(t2,t3);
// let gpuusage2=gpu_summary.gpu/(gpu_summary.endTime-gpu_summary.startTime);
// summary = tasks.getSummary(t3,t4);
// let cpuusage3 = summary.scripting/(summary.endTime-summary.startTime);
// gpu_summary = tasks.getGPUUsage(t3,t4);
// let gpuusage3=gpu_summary.gpu/(gpu_summary.endTime-gpu_summary.startTime);
// summary = tasks.getSummary(t4,t5);
// let cpuusage4 = summary.scripting/(summary.endTime-summary.startTime);
// gpu_summary = tasks.getGPUUsage(t4,t5);
// let gpuusage4=gpu_summary.gpu/(gpu_summary.endTime-gpu_summary.startTime);
// summary = tasks.getSummary(t5,t6);
// let cpuusage5 = summary.scripting/(summary.endTime-summary.startTime);
// gpu_summary = tasks.getGPUUsage(t5,t6);
// let gpuusage5=gpu_summary.gpu/(gpu_summary.endTime-gpu_summary.startTime);

// console.log(networkTimes.start,networkTimes.end,imageDecodeTimes.start,imageDecodeTimes.end)
// console.log(cpuusage1,gpuusage1,cpuusage2,gpuusage2,cpuusage3,gpuusage3,cpuusage4,gpuusage4,cpuusage5,gpuusage5);

// let loading_summary = tasks.getSummary(t1,t5);
// let loading_cpuusage = loading_summary.scripting/(loading_summary.endTime-loading_summary.startTime);
// let loading_gpu_summary = tasks.getGPUUsage(t1,t5);
// let loading_gpuusage = loading_gpu_summary.gpu/(loading_gpu_summary.endTime-loading_gpu_summary.startTime);
// console.log((100*loading_cpuusage).toFixed(1),(100*loading_gpuusage).toFixed(1),(t5-t1).toFixed(1));


exports.default = Tracelib;
//# sourceMappingURL=index.js.map
