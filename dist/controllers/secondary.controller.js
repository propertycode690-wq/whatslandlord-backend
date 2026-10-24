"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.secondaryController = exports.SecondaryController = void 0;
const secondary_service_1 = require("../services/secondary.service");
const apiResponse_1 = require("../utils/apiResponse");
class SecondaryController {
    // Announcements
    async getAnnouncements(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const list = await secondary_service_1.secondaryService.getAnnouncements(companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: list });
        }
        catch (error) {
            next(error);
        }
    }
    async createAnnouncement(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const item = await secondary_service_1.secondaryService.createAnnouncement(req.body, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: item });
        }
        catch (error) {
            next(error);
        }
    }
    // Insurance
    async getInsurancePolicies(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const list = await secondary_service_1.secondaryService.getInsurancePolicies(companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: list });
        }
        catch (error) {
            next(error);
        }
    }
    async createInsurancePolicy(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const item = await secondary_service_1.secondaryService.createInsurancePolicy(req.body, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: item });
        }
        catch (error) {
            next(error);
        }
    }
    // Promotions
    async getPromotions(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const list = await secondary_service_1.secondaryService.getPromotions(companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: list });
        }
        catch (error) {
            next(error);
        }
    }
    async createPromotion(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const item = await secondary_service_1.secondaryService.createPromotion(req.body, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: item });
        }
        catch (error) {
            next(error);
        }
    }
    // Notifications
    async getNotifications(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const role = req.query.role || req.user?.roleName || req.user?.role;
            const userContext = { id: req.user?.userId || req.user?.id, email: req.user?.email, tenantId: req.user?.tenantId, ownerId: req.user?.ownerId };
            const list = await secondary_service_1.secondaryService.getNotifications(companyId, role, userContext);
            return (0, apiResponse_1.sendSuccess)({ res, data: list });
        }
        catch (error) {
            next(error);
        }
    }
    async markNotificationRead(req, res, next) {
        try {
            const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const item = await secondary_service_1.secondaryService.markNotificationRead(id);
            return (0, apiResponse_1.sendSuccess)({ res, data: item });
        }
        catch (error) {
            next(error);
        }
    }
    async markAllNotificationsRead(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const role = req.query.role || req.user?.roleName || req.user?.role;
            const userContext = { id: req.user?.userId || req.user?.id, email: req.user?.email, tenantId: req.user?.tenantId, ownerId: req.user?.ownerId };
            const result = await secondary_service_1.secondaryService.markAllNotificationsRead(companyId, role, userContext);
            return (0, apiResponse_1.sendSuccess)({ res, data: result });
        }
        catch (error) {
            next(error);
        }
    }
    async clearNotifications(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const role = req.query.role || req.user?.roleName || req.user?.role;
            const userContext = { id: req.user?.userId || req.user?.id, email: req.user?.email, tenantId: req.user?.tenantId, ownerId: req.user?.ownerId };
            const result = await secondary_service_1.secondaryService.clearNotifications(companyId, role, userContext);
            return (0, apiResponse_1.sendSuccess)({ res, data: result });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteNotification(req, res, next) {
        try {
            const id = req.params.id;
            const result = await secondary_service_1.secondaryService.deleteNotification(id);
            return (0, apiResponse_1.sendSuccess)({ res, data: result, message: 'Notification deleted successfully' });
        }
        catch (error) {
            next(error);
        }
    }
    // Documents
    async getDocuments(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const list = await secondary_service_1.secondaryService.getDocuments(companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: list });
        }
        catch (error) {
            next(error);
        }
    }
    async createDocument(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const item = await secondary_service_1.secondaryService.createDocument(req.body, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: item });
        }
        catch (error) {
            next(error);
        }
    }
    // AI Chat
    async processAiChat(req, res, next) {
        try {
            const { prompt } = req.body;
            const result = await secondary_service_1.secondaryService.processAiChat(prompt || 'Show summary', req.user);
            return (0, apiResponse_1.sendSuccess)({ res, data: result });
        }
        catch (error) {
            next(error);
        }
    }
    // 1-to-1 Direct Messaging (Zero Leakage)
    async getDirectMessages(req, res, next) {
        try {
            const messages = await secondary_service_1.secondaryService.getDirectMessages(req.user);
            return (0, apiResponse_1.sendSuccess)({ res, data: messages });
        }
        catch (error) {
            next(error);
        }
    }
    async sendDirectMessage(req, res, next) {
        try {
            const newMsg = await secondary_service_1.secondaryService.sendDirectMessage(req.user, req.body);
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: newMsg });
        }
        catch (error) {
            next(error);
        }
    }
    async getDirectContacts(req, res, next) {
        try {
            const contacts = await secondary_service_1.secondaryService.getDirectContacts(req.user);
            return (0, apiResponse_1.sendSuccess)({ res, data: contacts });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.SecondaryController = SecondaryController;
exports.secondaryController = new SecondaryController();
