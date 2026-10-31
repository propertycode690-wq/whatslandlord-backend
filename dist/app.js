"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const env_1 = require("./config/env");
const requestId_middleware_1 = require("./middlewares/requestId.middleware");
const rateLimiter_middleware_1 = require("./middlewares/rateLimiter.middleware");
const error_middleware_1 = require("./middlewares/error.middleware");
const index_1 = __importDefault(require("./routes/index"));
const app = (0, express_1.default)();
// --- Core Hardening & Request Middlewares ---
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Echo back the requesting origin dynamically to support credentials across all IPs and Wi-Fis
        callback(null, origin || 'http://localhost:5173');
    },
    credentials: true,
}));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
app.use(requestId_middleware_1.requestIdMiddleware);
app.use(rateLimiter_middleware_1.globalRateLimiter);
if (env_1.env.NODE_ENV === 'development') {
    app.use((0, morgan_1.default)('dev'));
}
// --- API Router Mount ---
app.use(env_1.env.API_PREFIX, index_1.default);
// --- Global Error Handling Middleware ---
app.use(error_middleware_1.errorHandler);
exports.default = app;
