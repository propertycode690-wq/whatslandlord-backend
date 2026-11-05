"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chat_controller_js_1 = require("../controllers/chat.controller.js");
const auth_middleware_js_1 = require("../middlewares/auth.middleware.js");
const router = (0, express_1.Router)();
// All chat routes require authentication
router.use(auth_middleware_js_1.authMiddleware);
router.get('/conversations', (req, res, next) => chat_controller_js_1.chatController.getConversations(req, res, next));
router.post('/conversations/init', (req, res, next) => chat_controller_js_1.chatController.getOrCreateConversation(req, res, next));
router.get('/conversations/:conversationId/messages', (req, res, next) => chat_controller_js_1.chatController.getMessages(req, res, next));
router.post('/conversations/:conversationId/messages', (req, res, next) => chat_controller_js_1.chatController.sendMessage(req, res, next));
router.post('/conversations/:conversationId/read', (req, res, next) => chat_controller_js_1.chatController.markAsRead(req, res, next));
router.get('/contacts', (req, res, next) => chat_controller_js_1.chatController.getContacts(req, res, next));
exports.default = router;
