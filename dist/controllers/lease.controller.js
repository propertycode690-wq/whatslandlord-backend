"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.leaseController = exports.LeaseController = void 0;
const lease_service_1 = require("../services/lease.service");
const apiResponse_1 = require("../utils/apiResponse");
const appError_1 = require("../utils/appError");
const database_1 = __importDefault(require("../config/database"));
const email_service_1 = require("../services/email.service");
class LeaseController {
    async getAll(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const leases = await lease_service_1.leaseService.getAllLeases(companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: leases });
        }
        catch (error) {
            next(error);
        }
    }
    async create(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const { propertyId, unitId, tenantId } = req.body;
            if (companyId) {
                // Validate Property
                const prop = await database_1.default.property.findFirst({
                    where: { id: propertyId, companyId },
                });
                if (!prop)
                    throw new appError_1.AppError('Property not found.', 404, 'NOT_FOUND');
                // Validate Unit
                const unit = await database_1.default.unit.findFirst({
                    where: { id: unitId, property: { companyId } },
                });
                if (!unit)
                    throw new appError_1.AppError('Unit not found.', 404, 'NOT_FOUND');
                // Validate Tenant
                const tenant = await database_1.default.tenant.findFirst({
                    where: { id: tenantId, companyId },
                });
                if (!tenant)
                    throw new appError_1.AppError('Tenant not found.', 404, 'NOT_FOUND');
            }
            const lease = await lease_service_1.leaseService.createLease({ ...req.body, companyId });
            if (companyId && lease?.id) {
                email_service_1.emailService.sendLeaseCreatedEmail(companyId, lease.id).catch((err) => {
                    console.error('[Lease Created Email Trigger] Error:', err);
                });
            }
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: lease });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const lease = await lease_service_1.leaseService.updateLease(req.params.id, req.body, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: lease });
        }
        catch (error) {
            next(error);
        }
    }
    async delete(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            await lease_service_1.leaseService.deleteLease(req.params.id, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: { success: true } });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.LeaseController = LeaseController;
exports.leaseController = new LeaseController();
