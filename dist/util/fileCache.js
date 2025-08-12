"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveJSON = saveJSON;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function saveJSON(dir, name, obj) {
    node_fs_1.default.mkdirSync(dir, { recursive: true });
    node_fs_1.default.writeFileSync(node_path_1.default.join(dir, `${name}.json`), JSON.stringify(obj, null, 2), 'utf-8');
}
