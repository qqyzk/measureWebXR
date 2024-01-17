"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class TimelineCategory {
    /**
     * @param {string} name
     * @param {string} title
     * @param {boolean} visible
     * @param {string} childColor
     * @param {string} color
     */
    constructor(name, title, visible, childColor, color) {
        this.name = name;
        this.title = title;
        this.visible = visible;
        this.childColor = childColor;
        this.color = color;
        this.hidden = false;
    }
    /**
     * @return {boolean}
     */
    get hidden() {
        return this._hidden;
    }
    /**
     * @param {boolean} hidden
     */
    set hidden(hidden) {
        this._hidden = hidden;
    }
}
exports.default = TimelineCategory;
//# sourceMappingURL=timelineCategory.js.map