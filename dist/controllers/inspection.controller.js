"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inspectionController = exports.InspectionController = void 0;
const inspection_service_1 = require("../services/inspection.service");
const apiResponse_1 = require("../utils/apiResponse");
const database_1 = __importDefault(require("../config/database"));
class InspectionController {
    async getAll(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const inspections = await database_1.default.inspection.findMany({
                where: companyId ? { companyId } : {},
                orderBy: { startedAt: 'asc' },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: inspections });
        }
        catch (error) {
            next(error);
        }
    }
    async create(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const { status, date, templateName } = req.body;
            const count = await database_1.default.inspection.count({
                where: companyId ? { companyId } : {},
            });
            const formattedCount = String(count + 1).padStart(6, '0');
            const inspection = await database_1.default.inspection.create({
                data: {
                    inspectionNumber: `MI-${formattedCount}`,
                    status: status || 'DRAFT',
                    startedAt: date ? new Date(date) : new Date(),
                    templateName: templateName || 'Standard Template',
                    templateVersion: 1,
                    companyId,
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: inspection });
        }
        catch (error) {
            next(error);
        }
    }
    async remove(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            await database_1.default.inspection.delete({
                where: {
                    id: req.params.id,
                    ...(companyId ? { companyId } : {}),
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: { success: true } });
        }
        catch (error) {
            next(error);
        }
    }
    async getById(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const inspection = await inspection_service_1.inspectionService.getInspectionById(req.params.id, companyId);
            if (!inspection)
                return res.status(404).json({ error: 'Inspection not found' });
            return (0, apiResponse_1.sendSuccess)({ res, data: inspection });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const inspection = await inspection_service_1.inspectionService.updateInspectionDraft(req.params.id, {
                ...req.body,
                userId: req.user?.userId,
            }, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: inspection });
        }
        catch (error) {
            next(error);
        }
    }
    async complete(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const inspection = await inspection_service_1.inspectionService.completeInspection(req.params.id, req.user?.userId, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: inspection });
        }
        catch (error) {
            next(error);
        }
    }
    async reopen(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const inspection = await inspection_service_1.inspectionService.reopenInspection(req.params.id, req.user?.userId, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: inspection });
        }
        catch (error) {
            next(error);
        }
    }
    async getInspectors(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const inspectors = await inspection_service_1.inspectionService.getInspectors(companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: inspectors });
        }
        catch (error) {
            next(error);
        }
    }
    async uploadPhoto(req, res, next) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No photo file uploaded' });
            }
            const photo = await inspection_service_1.inspectionService.uploadItemPhoto(req.params.itemId, req.file, req.user?.userId);
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: photo });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.InspectionController = InspectionController;
exports.inspectionController = new InspectionController();
