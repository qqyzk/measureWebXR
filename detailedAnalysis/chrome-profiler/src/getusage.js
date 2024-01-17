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

    getUsageArray(from,to,name){
        const fs = require('fs');
        let delta=50;
        let cpuusages=[];
        let gpuusages=[];
        let times=[]
        for(let i=from;i<to;i+=delta){
            let summary = this.getSummary(i,i+delta);
            let cpuusage = summary.scripting/(summary.endTime-summary.startTime);
            let gpu_summary = this.getGPUUsage(i,i+delta);
            let gpuusage = gpu_summary.gpu/(gpu_summary.endTime-gpu_summary.startTime);
            cpuusages.push(cpuusage);
            gpuusages.push(gpuusage);
            times.push(i);
        }
        console.log(cpuusages)
        console.log(gpuusages)
        console.log(times)
        try {
            let cpufile = name+'-cpu.txt';
            let gpufile = name+'-gpu.txt';
            let timefile = name+'-time.txt';
            fs.writeFileSync(cpufile, cpuusages.toString());
            fs.writeFileSync(gpufile, gpuusages.toString());
            fs.writeFileSync(timefile, times.toString());
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

    getImageDecodeTimesThreadPool(){
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
        let value=false;
        if(startTimes.length>=1)
            value=true;
            
        return (
            {
                'value': value,
                'start':totalstart,
                'end':totalend
            }
        )
    }
    getImageDecodeTimesMain(){
        
        let events=this.getMainTrackEvents();
        let imageStartTime = -1;
        let imageEndTime = -1;
        for(let i=0;i<events.length;++i){
            if(events[i].name==='Decode Image'){
                let startTime = events[i].startTime;
                let endTime = events[i].endTime;
                if(imageStartTime===-1 || startTime<imageStartTime)
                    imageStartTime = startTime;
                if(imageEndTime===-1 || endTime>imageEndTime)
                    imageEndTime = endTime;
            }
        }
        let value=false;
        if(imageEndTime!==-1)
            value=true;
        return (
            {
                'value':value,
                'start':imageStartTime,
                'end':imageEndTime
            }
        )
    }

    getImageDecodeTimes(){
        let res1 = this.getImageDecodeTimesMain();
        let res2 = this.getImageDecodeTimesThreadPool()
        if(res1.value && res2.value){
            console.log('Get Image Decode Times Error');
        } else if(res1.value){
            return res1;
        } else if(res2.value){
            return res2;
        } else{
            console.log('Get Image Decode Times Empty');
            return(
                {
                    'start':0,
                    'end':0
                }
            )
        }
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

    getClickTime(){
        let events=this.getMainTrackEvents();
        let  totalend = -1,totalstart=-1;
        for(let i=0;i<events.length;++i){
            if(events[i].args.data){
                if(events[i].args.data.hasOwnProperty('type') && events[i].args.data['type']=='click'){
                    if(totalend===-1 || events[i].endTime > totalend)
                        totalend = events[i].endTime;
                    if(totalstart===-1 || events[i].startTime<totalstart)
                        totalstart = events[i].startTime;
                }
                if(events[i].args.data.hasOwnProperty('interactionType') && events[i].args.data['interactionType']=='tapOrClick'){
                    if(totalend===-1 || events[i].endTime > totalend)
                        totalend = events[i].endTime;
                    if(totalstart===-1 || events[i].startTime<totalstart)
                        totalstart = events[i].startTime;
                }
            }
        }
        return ({
            'start':totalstart,
            'end':totalend
        });
    }

   
  
}


let filename = '../data/profiled-data.json'
let JANK_TRACE_LOG = require(filename);
const tasks = new Tracelib(JANK_TRACE_LOG);

let start = tasks.getClickTime().start;
let end = start+10000;
let writefile = '../data/usage';
tasks.getUsageArray(start,end,writefile)
        // let summary = tasks.getSummary();


exports.default = Tracelib;

