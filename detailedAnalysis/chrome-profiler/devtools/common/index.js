"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const settings_1 = __importDefault(require("./settings"));
class Common {
    static moduleSetting(settingName) {
        return settings_1.default.moduleSetting(settingName);
    }
}
exports.default = Common;
//# sourceMappingURL=index.js.map