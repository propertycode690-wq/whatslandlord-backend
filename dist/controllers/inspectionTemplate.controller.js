"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inspectionTemplateController = exports.InspectionTemplateController = void 0;
const inspectionTemplate_service_1 = require("../services/inspectionTemplate.service");
const apiResponse_1 = require("../utils/apiResponse");
class InspectionTemplateController {
    async getAll(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const templates = await inspectionTemplate_service_1.inspectionTemplateService.getAllTemplates(companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: templates });
        }
        catch (error) {
            next(error);
        }
    }
    async getById(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const template = await inspectionTemplate_service_1.inspectionTemplateService.getTemplateById(req.params.id, companyId);
            if (!template)
                return res.status(404).json({ error: 'Inspection Template not found' });
            return (0, apiResponse_1.sendSuccess)({ res, data: template });
        }
        catch (error) {
            next(error);
        }
    }
    async create(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const template = await inspectionTemplate_service_1.inspectionTemplateService.createTemplate({
                ...req.body,
                companyId,
                createdBy: req.user?.email || 'System',
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: template });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const template = await inspectionTemplate_service_1.inspectionTemplateService.updateTemplate(req.params.id, req.body, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: template });
        }
        catch (error) {
            next(error);
        }
    }
    async toggleActive(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const template = await inspectionTemplate_service_1.inspectionTemplateService.updateTemplate(req.params.id, { active: req.body.active }, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: template });
        }
        catch (error) {
            next(error);
        }
    }
    async duplicate(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const duplicated = await inspectionTemplate_service_1.inspectionTemplateService.duplicateTemplate(req.params.id, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: duplicated });
        }
        catch (error) {
            next(error);
        }
    }
    async duplicateRoom(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const duplicatedRoom = await inspectionTemplate_service_1.inspectionTemplateService.duplicateRoom(req.params.id, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: duplicatedRoom });
        }
        catch (error) {
            next(error);
        }
    }
    async delete(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const result = await inspectionTemplate_service_1.inspectionTemplateService.deleteTemplate(req.params.id, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: result, message: 'Template deleted successfully' });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.InspectionTemplateController = InspectionTemplateController;
exports.inspectionTemplateController = new InspectionTemplateController();
