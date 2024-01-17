"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const timelineData_1 = __importDefault(require("../timelineData"));
class LayerPaintEvent {
    /**
    * @param {!SDK.TracingModel.Event} event
    */
    constructor(event) {
        this._event = event;
    }
    /**
    * @return {string}
    */
    layerId() {
        return this._event.args['data']['layerId'];
    }
    /**
    * @return {!SDK.TracingModel.Event}
    */
    event() {
        return this._event;
    }
    /**
    * @return {!Promise<?{rect: !Array<number>, serializedPicture: string}>}
    */
    picturePromise() {
        const picture = timelineData_1.default.forEvent(this._event).picture;
        return picture.objectPromise().then((result) => {
            if (!result) {
                return null;
            }
            const rect = result['params'] && result['params']['layer_rect'];
            const picture = result['skp64'];
            return rect && picture ? { rect: rect, serializedPicture: picture } : null;
        });
    }
    /**
    * @return !Promise<?{rect: !Array<number>, snapshot: !SDK.PaintProfilerSnapshot}>}
    */
    snapshotPromise() {
        return this.picturePromise().then((picture) => {
            if (!picture) {
                return null;
            }
        });
    }
}
exports.default = LayerPaintEvent;
;
//# sourceMappingURL=layerPaintEvent.js.map