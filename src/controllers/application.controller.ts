import { Response, NextFunction } from 'express';
import prisma from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class ApplicationController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return sendSuccess({ res, data: [] });
      }
      const applications = await prisma.application.findMany({
        where: { companyId },
        orderBy: { submittedDate: 'desc' },
      });
      return sendSuccess({ res, data: applications });
    } catch (error) {
      next(error);
    }
  }


  // check

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { tenantName, email, propertyName, unitNumber, rentProposed, status, submittedDate, companyId: bodyCompanyId } = req.body;
      let companyId = req.user?.companyId || bodyCompanyId;

      // If applicant applies from outside without login, resolve companyId from selected property
      if (!companyId && propertyName) {
        const prop = await prisma.property.findFirst({
          where: { name: propertyName },
          select: { companyId: true },
        });
        if (prop?.companyId) {
          companyId = prop.companyId;
        }
      }

      const application = await prisma.application.create({
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
      return sendSuccess({ res, statusCode: 201, data: application });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { status } = req.body;
      const id = req.params.id as string;
      const companyId = req.user?.companyId;

      if (companyId) {
        const check = await prisma.application.findFirst({
          where: { id, companyId },
        });
        if (!check) throw new Error('Application not found.');
      }

      const application = await prisma.application.update({
        where: { id },
        data: { status },
      });
      return sendSuccess({ res, data: application });
    } catch (error) {
      next(error);
    }
  }
}

export const applicationController = new ApplicationController();
