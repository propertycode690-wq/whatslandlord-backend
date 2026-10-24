import { Response, NextFunction } from 'express';
import { secondaryService } from '../services/secondary.service';
import { sendSuccess } from '../utils/apiResponse';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class SecondaryController {
  // Announcements
  async getAnnouncements(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const list = await secondaryService.getAnnouncements(companyId);
      return sendSuccess({ res, data: list });
    } catch (error) {
      next(error);
    }
  }

  async createAnnouncement(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const item = await secondaryService.createAnnouncement(req.body, companyId);
      return sendSuccess({ res, statusCode: 201, data: item });
    } catch (error) {
      next(error);
    }
  }

  // Insurance
  async getInsurancePolicies(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const list = await secondaryService.getInsurancePolicies(companyId);
      return sendSuccess({ res, data: list });
    } catch (error) {
      next(error);
    }
  }

  async createInsurancePolicy(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const item = await secondaryService.createInsurancePolicy(req.body, companyId);
      return sendSuccess({ res, statusCode: 201, data: item });
    } catch (error) {
      next(error);
    }
  }

  // Promotions
  async getPromotions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const list = await secondaryService.getPromotions(companyId);
      return sendSuccess({ res, data: list });
    } catch (error) {
      next(error);
    }
  }

  async createPromotion(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const item = await secondaryService.createPromotion(req.body, companyId);
      return sendSuccess({ res, statusCode: 201, data: item });
    } catch (error) {
      next(error);
    }
  }

  // Notifications
  async getNotifications(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const role = (req.query.role as string) || req.user?.roleName || (req.user as any)?.role;
      const userContext = { id: req.user?.userId || (req.user as any)?.id, email: req.user?.email, tenantId: (req.user as any)?.tenantId, ownerId: (req.user as any)?.ownerId };
      const list = await secondaryService.getNotifications(companyId, role, userContext);
      return sendSuccess({ res, data: list });
    } catch (error) {
      next(error);
    }
  }

  async markNotificationRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const item = await secondaryService.markNotificationRead(id);
      return sendSuccess({ res, data: item });
    } catch (error) {
      next(error);
    }
  }

  async markAllNotificationsRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const role = (req.query.role as string) || req.user?.roleName || (req.user as any)?.role;
      const userContext = { id: req.user?.userId || (req.user as any)?.id, email: req.user?.email, tenantId: (req.user as any)?.tenantId, ownerId: (req.user as any)?.ownerId };
      const result = await secondaryService.markAllNotificationsRead(companyId, role, userContext);
      return sendSuccess({ res, data: result });
    } catch (error) {
      next(error);
    }
  }

  async clearNotifications(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const role = (req.query.role as string) || req.user?.roleName || (req.user as any)?.role;
      const userContext = { id: req.user?.userId || (req.user as any)?.id, email: req.user?.email, tenantId: (req.user as any)?.tenantId, ownerId: (req.user as any)?.ownerId };
      const result = await secondaryService.clearNotifications(companyId, role, userContext);
      return sendSuccess({ res, data: result });
    } catch (error) {
      next(error);
    }
  }

  async deleteNotification(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const result = await secondaryService.deleteNotification(id);
      return sendSuccess({ res, data: result, message: 'Notification deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  // Documents
  async getDocuments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const list = await secondaryService.getDocuments(companyId);
      return sendSuccess({ res, data: list });
    } catch (error) {
      next(error);
    }
  }

  async createDocument(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const item = await secondaryService.createDocument(req.body, companyId);
      return sendSuccess({ res, statusCode: 201, data: item });
    } catch (error) {
      next(error);
    }
  }

  // AI Chat
  async processAiChat(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { prompt } = req.body;
      const result = await secondaryService.processAiChat(prompt || 'Show summary', req.user);
      return sendSuccess({ res, data: result });
    } catch (error) {
      next(error);
    }
  }

  // 1-to-1 Direct Messaging (Zero Leakage)
  async getDirectMessages(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const messages = await secondaryService.getDirectMessages(req.user!);
      return sendSuccess({ res, data: messages });
    } catch (error) {
      next(error);
    }
  }

  async sendDirectMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const newMsg = await secondaryService.sendDirectMessage(req.user!, req.body);
      return sendSuccess({ res, statusCode: 201, data: newMsg });
    } catch (error) {
      next(error);
    }
  }

  async getDirectContacts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const contacts = await secondaryService.getDirectContacts(req.user!);
      return sendSuccess({ res, data: contacts });
    } catch (error) {
      next(error);
    }
  }
}

export const secondaryController = new SecondaryController();
