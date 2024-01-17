"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class NamedObject {
    /**
     * @param {!TracingModel} model
     * @param {number} id
     */
    constructor(model, id) {
        this._model = model;
        this._id = id;
        this._name = '';
        this._sortIndex = 0;
    }
    get model() {
        return this._model;
    }
    /**
     * @param {!Array.<!TracingModel.NamedObject>} array
     */
    static sort(array) {
        /**
         * @param {!TracingModel.NamedObject} a
         * @param {!TracingModel.NamedObject} b
         */
        function comparator(a, b) {
            return a._sortIndex !== b._sortIndex ? a._sortIndex - b._sortIndex : a.name().localeCompare(b.name());
        }
        return array.sort(comparator);
    }
    /**
     * @param {string} name
     */
    _setName(name) {
        this._name = name;
    }
    /**
     * @return {string}
     */
    name() {
        return this._name;
    }
    /**
     * @param {number} sortIndex
     */
    setSortIndex(sortIndex) {
        this._sortIndex = sortIndex;
    }
}
exports.default = NamedObject;
//# sourceMappingURL=namedObject.js.map