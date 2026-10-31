"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const jwt_js_1 = require("../utils/jwt.js");
const appError_js_1 = require("../utils/appError.js");
const tenantContext_js_1 = require("../utils/tenantContext.js");
const database_js_1 = __importDefault(require("../config/database.js"));
async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    let payload;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(new appError_js_1.AppError('Authentication credentials (Bearer token) are missing or invalid.', 401, 'UNAUTHORIZED'));
    }
    const token = authHeader.split(' ')[1];
    try {
        payload = (0, jwt_js_1.verifyAccessToken)(token);
        req.user = payload;
    }
    catch (error) {
        return next(new appError_js_1.AppError(error.message || 'Authentication token is invalid or expired.', 401, 'UNAUTHORIZED'));
    }
    try {
        const userRole = payload.roleName;
        let tenantId;
        let ownerId;
        let staffId;
        if (userRole === 'Tenant') {
            const tenant = await database_js_1.default.tenant.findFirst({ where: { email: payload.email } });
            tenantId = tenant?.id;
        }
        else if (userRole === 'Owner') {
            const owner = await database_js_1.default.owner.findFirst({ where: { email: payload.email } });
            ownerId = owner?.id;
        }
        else if (userRole === 'Maintenance Staff') {
            const staff = await database_js_1.default.staffProfile.findFirst({ where: { email: payload.email } });
            const vendor = staff ? null : await database_js_1.default.vendor.findFirst({ where: { email: payload.email } });
            staffId = staff?.id || vendor?.id;
        }
        tenantContext_js_1.tenantContext.run({
            userId: payload.userId,
            userName: payload.email,
            companyId: payload.companyId || '',
            role: payload.roleName || '',
            tenantId,
            ownerId,
            staffId
        }, () => {
            next();
        });
    }
    catch (error) {
        return next(error);
    }
}
