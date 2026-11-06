"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applicationController = exports.ApplicationController = void 0;
const database_1 = __importDefault(require("../config/database"));
const apiResponse_1 = require("../utils/apiResponse");
class ApplicationController {
    async getAll(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            if (!companyId) {
                return (0, apiResponse_1.sendSuccess)({ res, data: [] });
            }
            const applications = await database_1.default.application.findMany({
                where: { companyId },
                orderBy: { submittedDate: 'desc' },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: applications });
        }
        catch (error) {
            next(error);
        }
    }
    // check
    async create(req, res, next) {
        try {
            const { tenantName, email, propertyName, unitNumber, rentProposed, status, submittedDate, companyId: bodyCompanyId } = req.body;
            let companyId = req.user?.companyId || bodyCompanyId;
            // If applicant applies from outside without login, resolve companyId from selected property
            if (!companyId && propertyName) {
                const prop = await database_1.default.property.findFirst({
                    where: { name: propertyName },
                    select: { companyId: true },
                });
                if (prop?.companyId) {
                    companyId = prop.companyId;
                }
            }
            const application = await database_1.default.application.create({
                data: {
                    tenantName,
                    email,
                    propertyName,
                    unitNumber,
                    rentProposed: parseFloat(rentProposed || '0'),
                    status: status || 'Pending',
                    submittedDate: submittedDate ? new Date(submittedDate) : new Date(),
                    companyId: companyId || null,
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: application });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const { status } = req.body;
            const id = req.params.id;
            const companyId = req.user?.companyId;
            if (companyId) {
                const check = await database_1.default.application.findFirst({
                    where: { id, companyId },
                });
                if (!check)
                    throw new Error('Application not found.');
            }
            const application = await database_1.default.application.update({
                where: { id },
                data: { status },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: application });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.ApplicationController = ApplicationController;
exports.applicationController = new ApplicationController();
