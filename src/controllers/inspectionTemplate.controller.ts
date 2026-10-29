import { Response, NextFunction } from 'express';
import { inspectionTemplateService } from '../services/inspectionTemplate.service';
import { sendSuccess } from '../utils/apiResponse';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class InspectionTemplateController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const templates = await inspectionTemplateService.getAllTemplates(companyId);
      return sendSuccess({ res, data: templates });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const template = await inspectionTemplateService.getTemplateById(req.params.id as string, companyId);
      if (!template) return res.status(404).json({ error: 'Inspection Template not found' });
      return sendSuccess({ res, data: template });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const template = await inspectionTemplateService.createTemplate({
        ...req.body,
        companyId,
        createdBy: req.user?.email || 'System',
      });
      return sendSuccess({ res, statusCode: 201, data: template });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const template = await inspectionTemplateService.updateTemplate(req.params.id as string, req.body, companyId);
      return sendSuccess({ res, data: template });
    } catch (error) {
      next(error);
    }
  }

  async toggleActive(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const template = await inspectionTemplateService.updateTemplate(
        req.params.id as string,
        { active: req.body.active },
        companyId
      );
      return sendSuccess({ res, data: template });
    } catch (error) {
      next(error);
    }
  }

  async duplicate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const duplicated = await inspectionTemplateService.duplicateTemplate(req.params.id as string, companyId);
      return sendSuccess({ res, statusCode: 201, data: duplicated });
    } catch (error) {
      next(error);
    }
  }

  async duplicateRoom(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const duplicatedRoom = await inspectionTemplateService.duplicateRoom(req.params.id as string, companyId);
      return sendSuccess({ res, statusCode: 201, data: duplicatedRoom });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const result = await inspectionTemplateService.deleteTemplate(req.params.id as string, companyId);
      return sendSuccess({ res, data: result, message: 'Template deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export const inspectionTemplateController = new InspectionTemplateController();
