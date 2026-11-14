import { Response, NextFunction } from 'express';
import { integrationService } from '../services/integration.service';
import { sendSuccess } from '../utils/apiResponse';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { AppError } from '../utils/appError';

export class IntegrationController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        throw new AppError('Unauthorized: Company ID not found.', 401, 'UNAUTHORIZED');
      }

      const integrations = await integrationService.getCompanyIntegrations(companyId);
      return sendSuccess({ res, data: integrations });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        throw new AppError('Unauthorized: Company ID not found.', 401, 'UNAUTHORIZED');
      }

      const { provider, accountSid, senderId, authToken, status } = req.body;
      if (!provider || !['TWILIO', 'WHATSAPP', 'STRIPE', 'AUTHORIZE_NET', 'RAZORPAY', 'SENDGRID'].includes(provider)) {
        throw new AppError('Bad Request: Invalid integration provider.', 400, 'BAD_REQUEST');
      }

      const updated = await integrationService.updateCompanyIntegration(companyId, provider, {
        accountSid,
        senderId,
        authToken,
        status,
      });

      return sendSuccess({
        res,
        message: `${provider} integration saved successfully.`,
        data: {
          provider: updated.provider,
          status: updated.status,
          accountSid: updated.accountSid,
          senderId: updated.senderId,
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async test(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        throw new AppError('Unauthorized: Company ID not found.', 401, 'UNAUTHORIZED');
      }

      const { provider, accountSid, senderId, authToken } = req.body;
      if (!provider || !['TWILIO', 'WHATSAPP', 'STRIPE', 'AUTHORIZE_NET', 'RAZORPAY', 'SENDGRID'].includes(provider)) {
        throw new AppError('Bad Request: Invalid integration provider.', 400, 'BAD_REQUEST');
      }

      if (!accountSid || !senderId || !authToken) {
        throw new AppError('Bad Request: Missing validation credentials.', 400, 'BAD_REQUEST');
      }

      const testResult = await integrationService.testCredentials(provider, {
        accountSid,
        senderId,
        authToken,
        companyId,
      });

      return sendSuccess({
        res,
        statusCode: testResult.success ? 200 : 400,
        message: testResult.message,
        data: { success: testResult.success }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const integrationController = new IntegrationController();
