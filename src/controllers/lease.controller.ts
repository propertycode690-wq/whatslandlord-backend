import { Response, NextFunction } from 'express';
import { leaseService } from '../services/lease.service';
import { sendSuccess } from '../utils/apiResponse';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { AppError } from '../utils/appError';
import prisma from '../config/database';
import { emailService } from '../services/email.service';

export class LeaseController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const leases = await leaseService.getAllLeases(companyId);
      return sendSuccess({ res, data: leases });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const { propertyId, unitId, tenantId } = req.body;

      if (companyId) {
        // Validate Property
        const prop = await prisma.property.findFirst({
          where: { id: propertyId, companyId },
        });
        if (!prop) throw new AppError('Property not found.', 404, 'NOT_FOUND');

        // Validate Unit
        const unit = await prisma.unit.findFirst({
          where: { id: unitId, property: { companyId } },
        });
        if (!unit) throw new AppError('Unit not found.', 404, 'NOT_FOUND');

        // Validate Tenant
        const tenant = await prisma.tenant.findFirst({
          where: { id: tenantId, companyId },
        });
        if (!tenant) throw new AppError('Tenant not found.', 404, 'NOT_FOUND');
      }

      const lease = await leaseService.createLease({ ...req.body, companyId });

      if (companyId && lease?.id) {
        emailService.sendLeaseCreatedEmail(companyId, lease.id).catch((err) => {
          console.error('[Lease Created Email Trigger] Error:', err);
        });
      }

      return sendSuccess({ res, statusCode: 201, data: lease });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const lease = await leaseService.updateLease(req.params.id as string, req.body, companyId);
      return sendSuccess({ res, data: lease });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      await leaseService.deleteLease(req.params.id as string, companyId);
      return sendSuccess({ res, data: { success: true } });
    } catch (error) {
      next(error);
    }
  }
}

export const leaseController = new LeaseController();
