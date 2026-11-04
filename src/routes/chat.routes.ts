import { Router } from 'express';
import { chatController } from '../controllers/chat.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// All chat routes require authentication
router.use(authMiddleware as any);

router.get('/conversations', (req, res, next) => chatController.getConversations(req, res, next));
router.post('/conversations/init', (req, res, next) => chatController.getOrCreateConversation(req, res, next));
router.get('/conversations/:conversationId/messages', (req, res, next) => chatController.getMessages(req, res, next));
router.post('/conversations/:conversationId/messages', (req, res, next) => chatController.sendMessage(req, res, next));
router.post('/conversations/:conversationId/read', (req, res, next) => chatController.markAsRead(req, res, next));
router.get('/contacts', (req, res, next) => chatController.getContacts(req, res, next));

export default router;

