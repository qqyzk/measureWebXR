"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class TimelineRecordStyle {
    /**
     * @param {string} title
     * @param {!Timeline.TimelineCategory} category
     * @param {boolean=} hidden
     */
    constructor(title, category, hidden) {
        this.title = title;
        this.category = category;
        this.hidden = !!hidden;
    }
}
exports.default = TimelineRecordStyle;
//# sourceMappingURL=timelineRecordStyle.js.map