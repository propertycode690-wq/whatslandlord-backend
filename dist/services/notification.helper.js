"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = createNotification;
const database_1 = __importDefault(require("../config/database"));
async function createNotification(params) {
    try {
        return await database_1.default.notification.create({
            data: {
                title: params.title,
                message: params.message,
                role: params.role || 'Property Manager',
                type: params.type || 'info',
                companyId: params.companyId || null,
                userId: params.userId || null,
                targetId: params.targetId || null,
                targetUrl: params.targetUrl || null,
            },
        });
    }
    catch (error) {
        console.error('Failed to create notification:', error);
        return null;
    }
}
