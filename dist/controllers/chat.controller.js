"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatController = exports.ChatController = void 0;
const apiResponse_js_1 = require("../utils/apiResponse.js");
const chat_service_js_1 = require("../services/chat.service.js");
const appError_js_1 = require("../utils/appError.js");
class ChatController {
    async getConversations(req, res, next) {
        try {
            if (!req.user)
                throw new appError_js_1.AppError('Unauthorized', 401);
            const data = await chat_service_js_1.chatService.getConversations(req.user);
            return (0, apiResponse_js_1.sendSuccess)({ res, data });
        }
        catch (err) {
            next(err);
        }
    }
    async getOrCreateConversation(req, res, next) {
        try {
            if (!req.user || !req.user.companyId)
                throw new appError_js_1.AppError('Unauthorized', 401);
            const { participantType, participantId } = req.body;
            if (!participantType || !participantId) {
                throw new appError_js_1.AppError('participantType and participantId are required.', 400);
            }
            const data = await chat_service_js_1.chatService.getOrCreateConversation(req.user.companyId, participantType, participantId);
            return (0, apiResponse_js_1.sendSuccess)({ res, data });
        }
        catch (err) {
            next(err);
        }
    }
    async getMessages(req, res, next) {
        try {
            if (!req.user)
                throw new appError_js_1.AppError('Unauthorized', 401);
            const conversationId = req.params.conversationId;
            const data = await chat_service_js_1.chatService.getMessages(conversationId, req.user);
            return (0, apiResponse_js_1.sendSuccess)({ res, data });
        }
        catch (err) {
            next(err);
        }
    }
    async sendMessage(req, res, next) {
        try {
            if (!req.user)
                throw new appError_js_1.AppError('Unauthorized', 401);
            const conversationId = req.params.conversationId;
            const { body } = req.body;
            const data = await chat_service_js_1.chatService.sendMessage(conversationId, body, req.user);
            // Real-time broadcast to conversation and company rooms
            const io = req.app.get('io');
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
            return (0, apiResponse_js_1.sendSuccess)({ res, statusCode: 201, data });
        }
        catch (err) {
            next(err);
        }
    }
    async markAsRead(req, res, next) {
        try {
            if (!req.user)
                throw new appError_js_1.AppError('Unauthorized', 401);
            const conversationId = req.params.conversationId;
            const data = await chat_service_js_1.chatService.markAsRead(conversationId, req.user);
            const io = req.app.get('io');
            if (io) {
                io.to(`conversation:${conversationId}`).emit('message:read_receipt', {
                    conversationId,
                });
            }
            return (0, apiResponse_js_1.sendSuccess)({ res, data });
        }
        catch (err) {
            next(err);
        }
    }
    async getContacts(req, res, next) {
        try {
            if (!req.user)
                throw new appError_js_1.AppError('Unauthorized', 401);
            const data = await chat_service_js_1.chatService.getContactsDirectory(req.user);
            return (0, apiResponse_js_1.sendSuccess)({ res, data });
        }
        catch (err) {
            next(err);
        }
    }
}
exports.ChatController = ChatController;
exports.chatController = new ChatController();
