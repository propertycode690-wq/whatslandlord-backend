import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { chatService } from '../services/chat.service.js';
import { AppError } from '../utils/appError.js';

export class ChatController {
  async getConversations(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      const data = await chatService.getConversations(req.user);
      return sendSuccess({ res, data });
    } catch (err) {
      next(err);
    }
  }

  async getOrCreateConversation(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.companyId) throw new AppError('Unauthorized', 401);
      const { participantType, participantId } = req.body;
      if (!participantType || !participantId) {
        throw new AppError('participantType and participantId are required.', 400);
      }
      const data = await chatService.getOrCreateConversation(
        req.user.companyId,
        participantType,
        participantId
      );
      return sendSuccess({ res, data });
    } catch (err) {
      next(err);
    }
  }

  async getMessages(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      const conversationId = req.params.conversationId as string;
      const data = await chatService.getMessages(conversationId, req.user);
      return sendSuccess({ res, data });
    } catch (err) {
      next(err);
    }
  }

  async sendMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      const conversationId = req.params.conversationId as string;
      const { body } = req.body;
      const data = await chatService.sendMessage(conversationId, body, req.user);

      // Real-time broadcast to conversation and company rooms
      const io: any = req.app.get('io');
      if (io) {
        io.to(`conversation:${conversationId}`).emit('message:new', data);
        if (data.recipientId && data.recipientId !== 'OFFICE') {
          io.to(`user:${data.recipientId}`).emit('message:new', data);
        }
        if (req.user.companyId) {
          io.to(`company:${req.user.companyId}`).emit('conversation:updated', {
            conversationId,
            lastMessage: data.body,
            lastMessageAt: data.createdAt,
            senderId: data.senderId,
          });
        }
      }

      return sendSuccess({ res, statusCode: 201, data });
    } catch (err) {
      next(err);
    }
  }

  async markAsRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      const conversationId = req.params.conversationId as string;
      const data = await chatService.markAsRead(conversationId, req.user);

      const io: any = req.app.get('io');
      if (io) {
        io.to(`conversation:${conversationId}`).emit('message:read_receipt', {
          conversationId,
        });
      }

      return sendSuccess({ res, data });
    } catch (err) {
      next(err);
    }
  }

  async getContacts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      const data = await chatService.getContactsDirectory(req.user);
      return sendSuccess({ res, data });
    } catch (err) {
      next(err);
    }
  }
}

export const chatController = new ChatController();

