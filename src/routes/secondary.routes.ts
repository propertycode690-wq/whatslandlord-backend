import { Router } from 'express';
import { secondaryController } from '../controllers/secondary.controller';

const router = Router();

// Announcements
router.get('/announcements', (req, res, next) => secondaryController.getAnnouncements(req, res, next));
router.post('/announcements', (req, res, next) => secondaryController.createAnnouncement(req, res, next));

// Insurance
router.get('/insurance', (req, res, next) => secondaryController.getInsurancePolicies(req, res, next));
router.post('/insurance', (req, res, next) => secondaryController.createInsurancePolicy(req, res, next));

// Promotions / Coupons
router.get('/promotions', (req, res, next) => secondaryController.getPromotions(req, res, next));
router.post('/promotions', (req, res, next) => secondaryController.createPromotion(req, res, next));

// Notifications
router.get('/notifications', (req, res, next) => secondaryController.getNotifications(req, res, next));
router.put('/notifications/read-all', (req, res, next) => secondaryController.markAllNotificationsRead(req, res, next));
router.put('/notifications/:id/read', (req, res, next) => secondaryController.markNotificationRead(req, res, next));
router.delete('/notifications/read-all', (req, res, next) => secondaryController.clearNotifications(req, res, next));
router.delete('/notifications/:id', (req, res, next) => secondaryController.deleteNotification(req, res, next));
router.delete('/notifications', (req, res, next) => secondaryController.clearNotifications(req, res, next));

// Documents
router.get('/documents', (req, res, next) => secondaryController.getDocuments(req, res, next));
router.post('/documents', (req, res, next) => secondaryController.createDocument(req, res, next));

// AI Assistant & Conversations
router.get('/ai/conversations', (req, res, next) => secondaryController.getAiConversations(req, res, next));
router.get('/ai/conversations/:chatId/messages', (req, res, next) => secondaryController.getAiConversationMessages(req, res, next));
router.post('/ai/conversations', (req, res, next) => secondaryController.createAiConversation(req, res, next));
router.delete('/ai/conversations/:chatId', (req, res, next) => secondaryController.deleteAiConversation(req, res, next));
router.post('/ai/chat', (req, res, next) => secondaryController.processAiChat(req, res, next));

// 1-to-1 Direct Messaging (All 5 Roles with Zero Leakage)
router.get('/messages', (req, res, next) => secondaryController.getDirectMessages(req, res, next));
router.post('/messages', (req, res, next) => secondaryController.sendDirectMessage(req, res, next));
router.get('/messages/contacts', (req, res, next) => secondaryController.getDirectContacts(req, res, next));

export default router;
