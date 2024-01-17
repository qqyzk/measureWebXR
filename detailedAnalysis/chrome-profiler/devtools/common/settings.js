"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Settings {
    /**
     * @param {string} settingName
     * @return {!Common.Setting}
     */
    static moduleSetting(settingName) {
        const setting = this._moduleSettings.get(settingName);
        if (!setting) {
            return {
                get: () => null
            };
        }
        return setting;
    }
    get() {
        return true;
    }
}
exports.default = Settings;
Settings._moduleSettings = new Map();
//# sourceMappingURL=settings.js.map