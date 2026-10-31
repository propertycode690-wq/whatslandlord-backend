import { Response, NextFunction } from 'express';
import { inspectionService } from '../services/inspection.service';
import { sendSuccess } from '../utils/apiResponse';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import prisma from '../config/database';

export class InspectionController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const inspections = await prisma.inspection.findMany({
        where: companyId ? { companyId } : {},
        orderBy: { startedAt: 'asc' },
      });
      return sendSuccess({ res, data: inspections });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const { status, date, templateName } = req.body;
      const count = await prisma.inspection.count({
        where: companyId ? { companyId } : {},
      });
      const formattedCount = String(count + 1).padStart(6, '0');
      const inspection = await prisma.inspection.create({
        data: {
          inspectionNumber: `MI-${formattedCount}`,
          status: (status as any) || 'DRAFT',
          startedAt: date ? new Date(date) : new Date(),
          templateName: templateName || 'Standard Template',
          templateVersion: 1,
          companyId,
        },
      });
      return sendSuccess({ res, statusCode: 201, data: inspection });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      await prisma.inspection.delete({
        where: {
          id: req.params.id as string,
          ...(companyId ? { companyId } : {}),
        },
      });
      return sendSuccess({ res, data: { success: true } });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const inspection = await inspectionService.getInspectionById(req.params.id as string, companyId);
      if (!inspection) return res.status(404).json({ error: 'Inspection not found' });
      return sendSuccess({ res, data: inspection });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const inspection = await inspectionService.updateInspectionDraft(
        req.params.id as string,
        {
          ...req.body,
          userId: req.user?.userId,
        },
        companyId
      );
      return sendSuccess({ res, data: inspection });
    } catch (error) {
      next(error);
    }
  }

  async complete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const inspection = await inspectionService.completeInspection(req.params.id as string, req.user?.userId, companyId);
      return sendSuccess({ res, data: inspection });
    } catch (error) {
      next(error);
    }
  }

  async reopen(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const inspection = await inspectionService.reopenInspection(req.params.id as string, req.user?.userId, companyId);
      return sendSuccess({ res, data: inspection });
    } catch (error) {
      next(error);
    }
  }

  async getInspectors(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const inspectors = await inspectionService.getInspectors(companyId);
      return sendSuccess({ res, data: inspectors });
    } catch (error) {
      next(error);
    }
  }

  async uploadPhoto(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No photo file uploaded' });
      }
      const photo = await inspectionService.uploadItemPhoto(
        req.params.itemId as string,
        req.file,
        req.user?.userId
      );
      return sendSuccess({ res, statusCode: 201, data: photo });
    } catch (error) {
      next(error);
    }
  }
}

export const inspectionController = new InspectionController();
