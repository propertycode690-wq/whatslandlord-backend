"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const secondary_controller_1 = require("../controllers/secondary.controller");
const router = (0, express_1.Router)();
// Announcements
router.get('/announcements', (req, res, next) => secondary_controller_1.secondaryController.getAnnouncements(req, res, next));
router.post('/announcements', (req, res, next) => secondary_controller_1.secondaryController.createAnnouncement(req, res, next));
// Insurance
router.get('/insurance', (req, res, next) => secondary_controller_1.secondaryController.getInsurancePolicies(req, res, next));
router.post('/insurance', (req, res, next) => secondary_controller_1.secondaryController.createInsurancePolicy(req, res, next));
// Promotions / Coupons
router.get('/promotions', (req, res, next) => secondary_controller_1.secondaryController.getPromotions(req, res, next));
router.post('/promotions', (req, res, next) => secondary_controller_1.secondaryController.createPromotion(req, res, next));
// Notifications
router.get('/notifications', (req, res, next) => secondary_controller_1.secondaryController.getNotifications(req, res, next));
router.put('/notifications/read-all', (req, res, next) => secondary_controller_1.secondaryController.markAllNotificationsRead(req, res, next));
router.put('/notifications/:id/read', (req, res, next) => secondary_controller_1.secondaryController.markNotificationRead(req, res, next));
router.delete('/notifications/read-all', (req, res, next) => secondary_controller_1.secondaryController.clearNotifications(req, res, next));
router.delete('/notifications/:id', (req, res, next) => secondary_controller_1.secondaryController.deleteNotification(req, res, next));
router.delete('/notifications', (req, res, next) => secondary_controller_1.secondaryController.clearNotifications(req, res, next));
// Documents
router.get('/documents', (req, res, next) => secondary_controller_1.secondaryController.getDocuments(req, res, next));
router.post('/documents', (req, res, next) => secondary_controller_1.secondaryController.createDocument(req, res, next));
// AI Assistant & Conversations
router.get('/ai/conversations', (req, res, next) => secondary_controller_1.secondaryController.getAiConversations(req, res, next));
router.get('/ai/conversations/:chatId/messages', (req, res, next) => secondary_controller_1.secondaryController.getAiConversationMessages(req, res, next));
router.post('/ai/conversations', (req, res, next) => secondary_controller_1.secondaryController.createAiConversation(req, res, next));
router.delete('/ai/conversations/:chatId', (req, res, next) => secondary_controller_1.secondaryController.deleteAiConversation(req, res, next));
router.post('/ai/chat', (req, res, next) => secondary_controller_1.secondaryController.processAiChat(req, res, next));
// 1-to-1 Direct Messaging (All 5 Roles with Zero Leakage)
router.get('/messages', (req, res, next) => secondary_controller_1.secondaryController.getDirectMessages(req, res, next));
router.post('/messages', (req, res, next) => secondary_controller_1.secondaryController.sendDirectMessage(req, res, next));
router.get('/messages/contacts', (req, res, next) => secondary_controller_1.secondaryController.getDirectContacts(req, res, next));
exports.default = router;
