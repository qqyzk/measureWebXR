"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const timelineUIUtils_1 = __importDefault(require("./../devtools/timelineModel/timelineUIUtils"));
const timelineModel_1 = __importDefault(require("./../devtools/timelineModel"));
const tracingModel_1 = __importDefault(require("./../devtools/tracingModel"));
class CustomUtils extends timelineUIUtils_1.default {
    /**
    * @param {!Array<!SDK.TracingModel.Event>} events
    * @param {number} startTime
    * @param {number} endTime
    * @return {!Object<string, number>}
    */
    detailStatsForTimeRange(events, startTime, endTime) {
        const eventStyle = this.eventStyle.bind(this);
        const visibleEventsFilterFunc = this.visibleEventsFilter.bind(this);
        if (!events.length) {
            return {
                idle: {
                    'times': [endTime - startTime],
                    'values': [endTime - startTime]
                }
            };
        }
        // aggeregatedStats is a map by categories. For each category there's an array
        // containing sorted time points which records accumulated value of the category.
        const aggregatedStats = {};
        const categoryStack = [];
        let lastTime = 0;
        timelineModel_1.default.forEachEvent(events, onStartEvent, onEndEvent, undefined, undefined, undefined, filterForStats());
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
                statsArrays = { times: [], values: [] };
                aggregatedStats[category] = statsArrays;
            }
            if (statsArrays.times.length && statsArrays.times[statsArrays.times.length - 1] === time) {
                return;
            }
            statsArrays.values.push(time - lastTime);
            statsArrays.times.push(time);
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
        return aggregatedStats;
    }
}
exports.default = CustomUtils;
//# sourceMappingURL=utils.js.map