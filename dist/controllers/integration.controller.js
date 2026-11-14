"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.integrationController = exports.IntegrationController = void 0;
const integration_service_1 = require("../services/integration.service");
const apiResponse_1 = require("../utils/apiResponse");
const appError_1 = require("../utils/appError");
class IntegrationController {
    async getAll(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            if (!companyId) {
                throw new appError_1.AppError('Unauthorized: Company ID not found.', 401, 'UNAUTHORIZED');
            }
            const integrations = await integration_service_1.integrationService.getCompanyIntegrations(companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: integrations });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            if (!companyId) {
                throw new appError_1.AppError('Unauthorized: Company ID not found.', 401, 'UNAUTHORIZED');
            }
            const { provider, accountSid, senderId, authToken, status } = req.body;
            if (!provider || !['TWILIO', 'WHATSAPP', 'STRIPE', 'AUTHORIZE_NET', 'RAZORPAY', 'SENDGRID'].includes(provider)) {
                throw new appError_1.AppError('Bad Request: Invalid integration provider.', 400, 'BAD_REQUEST');
            }
            const updated = await integration_service_1.integrationService.updateCompanyIntegration(companyId, provider, {
                accountSid,
                senderId,
                authToken,
                status,
            });
            return (0, apiResponse_1.sendSuccess)({
                res,
                message: `${provider} integration saved successfully.`,
                data: {
                    provider: updated.provider,
                    status: updated.status,
                    accountSid: updated.accountSid,
                    senderId: updated.senderId,
                }
            });
        }
        catch (error) {
            next(error);
        }
    }
    async test(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            if (!companyId) {
                throw new appError_1.AppError('Unauthorized: Company ID not found.', 401, 'UNAUTHORIZED');
            }
            const { provider, accountSid, senderId, authToken } = req.body;
            if (!provider || !['TWILIO', 'WHATSAPP', 'STRIPE', 'AUTHORIZE_NET', 'RAZORPAY', 'SENDGRID'].includes(provider)) {
                throw new appError_1.AppError('Bad Request: Invalid integration provider.', 400, 'BAD_REQUEST');
            }
            if (!accountSid || !senderId || !authToken) {
                throw new appError_1.AppError('Bad Request: Missing validation credentials.', 400, 'BAD_REQUEST');
            }
            const testResult = await integration_service_1.integrationService.testCredentials(provider, {
                accountSid,
                senderId,
                authToken,
                companyId,
            });
            return (0, apiResponse_1.sendSuccess)({
                res,
                statusCode: testResult.success ? 200 : 400,
                message: testResult.message,
                data: { success: testResult.success }
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.IntegrationController = IntegrationController;
exports.integrationController = new IntegrationController();
