"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatService = exports.ChatService = void 0;
const database_js_1 = __importDefault(require("../config/database.js"));
const appError_js_1 = require("../utils/appError.js");
const communication_guard_js_1 = require("../middlewares/communication.guard.js");
class ChatService {
    /**
     * Helper to resolve the entity ID (Tenant ID, Owner ID, Staff ID) for non-manager roles
     */
    async resolveUserEntity(payload) {
        const roleStr = (payload.roleName || '').toLowerCase();
        if (roleStr === 'tenant') {
            const tenant = await database_js_1.default.tenant.findFirst({
                where: { email: payload.email, companyId: payload.companyId },
            });
            if (!tenant)
                throw new appError_js_1.AppError('Tenant profile not found for this account.', 404, 'NOT_FOUND');
            return { role: 'TENANT', entityId: tenant.id, displayName: `${tenant.firstName} ${tenant.lastName}`.trim() };
        }
        if (roleStr === 'owner') {
            let owner = await database_js_1.default.owner.findFirst({
                where: payload.companyId ? { email: payload.email, companyId: payload.companyId } : { email: payload.email },
            });
            if (!owner) {
                owner = await database_js_1.default.owner.findFirst({
                    where: { email: payload.email },
                });
            }
            if (!owner && payload.companyId) {
                owner = await database_js_1.default.owner.findFirst({
                    where: { companyId: payload.companyId },
                });
            }
            if (!owner)
                throw new appError_js_1.AppError('Owner profile not found for this account.', 404, 'NOT_FOUND');
            return { role: 'OWNER', entityId: owner.id, displayName: owner.name || 'Owner' };
        }
        if (roleStr.includes('staff') || roleStr.includes('maintenance')) {
            const staff = await database_js_1.default.staffProfile.findFirst({
                where: { email: payload.email, companyId: payload.companyId },
            });
            if (staff) {
                return { role: 'STAFF', entityId: staff.id, displayName: staff.name };
            }
            return { role: 'STAFF', entityId: payload.userId, displayName: 'Maintenance Staff' };
        }
        return { role: 'MANAGER', entityId: payload.userId, displayName: 'Property Management' };
    }
    /**
     * Get or Create 1-to-1 conversation thread between Management and a Stakeholder
     */
    async getOrCreateConversation(companyId, participantType, participantId) {
        const whereClause = { companyId, participantType };
        if (participantType === 'TENANT')
            whereClause.tenantId = participantId;
        if (participantType === 'OWNER')
            whereClause.ownerId = participantId;
        if (participantType === 'STAFF')
            whereClause.staffId = participantId;
        let conv = await database_js_1.default.conversation.findFirst({
            where: whereClause,
            include: {
                tenant: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, unit: { select: { unitNumber: true } } } },
                owner: { select: { id: true, name: true, email: true, phone: true } },
                staff: { select: { id: true, name: true, email: true, phone: true, role: true } },
            },
        });
        if (!conv) {
            conv = await database_js_1.default.conversation.create({
                data: {
                    companyId,
                    participantType,
                    tenantId: participantType === 'TENANT' ? participantId : null,
                    ownerId: participantType === 'OWNER' ? participantId : null,
                    staffId: participantType === 'STAFF' ? participantId : null,
                },
                include: {
                    tenant: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, unit: { select: { unitNumber: true } } } },
                    owner: { select: { id: true, name: true, email: true, phone: true } },
                    staff: { select: { id: true, name: true, email: true, phone: true, role: true } },
                },
            });
        }
        return conv;
    }
    /**
     * Get all active conversations for the user's role and company
     */
    async getConversations(payload) {
        const userEntity = await this.resolveUserEntity(payload);
        if (!payload.companyId && userEntity.role === 'OWNER') {
            const ownerRecord = await database_js_1.default.owner.findUnique({ where: { id: userEntity.entityId } });
            if (ownerRecord?.companyId) {
                payload.companyId = ownerRecord.companyId;
            }
        }
        if (!payload.companyId)
            throw new appError_js_1.AppError('Company ID missing from user token.', 400);
        if (userEntity.role === 'TENANT') {
            const conv = await this.getOrCreateConversation(payload.companyId, 'TENANT', userEntity.entityId);
            return [await this.formatConversation(conv, payload.userId, userEntity.role)];
        }
        if (userEntity.role === 'OWNER') {
            const conv = await this.getOrCreateConversation(payload.companyId, 'OWNER', userEntity.entityId);
            return [await this.formatConversation(conv, payload.userId, userEntity.role)];
        }
        if (userEntity.role === 'STAFF') {
            const conv = await this.getOrCreateConversation(payload.companyId, 'STAFF', userEntity.entityId);
            return [await this.formatConversation(conv, payload.userId, userEntity.role)];
        }
        // Manager: List all conversations across the company
        const convs = await database_js_1.default.conversation.findMany({
            where: { companyId: payload.companyId },
            include: {
                tenant: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, unit: { select: { unitNumber: true } } } },
                owner: { select: { id: true, name: true, email: true, phone: true } },
                staff: { select: { id: true, name: true, email: true, phone: true, role: true } },
            },
            orderBy: { lastMessageAt: 'desc' },
        });
        return Promise.all(convs.map((c) => this.formatConversation(c, payload.userId, 'MANAGER')));
    }
    /**
     * Format conversation item with latest message and unread count
     */
    async formatConversation(conv, currentUserId, currentRole) {
        const lastMsg = await database_js_1.default.chatMessage.findFirst({
            where: { conversationId: conv.id },
            orderBy: { createdAt: 'desc' },
        });
        const unreadCount = await database_js_1.default.chatMessage.count({
            where: {
                conversationId: conv.id,
                status: { in: ['SENT', 'DELIVERED'] },
                recipientRole: currentRole,
            },
        });
        let participantName = 'Unknown';
        let participantRole = conv.participantType;
        let subtitle = '';
        if (conv.participantType === 'TENANT' && conv.tenant) {
            participantName = `${conv.tenant.firstName} ${conv.tenant.lastName}`.trim();
            subtitle = conv.tenant.unit?.unitNumber ? `Unit ${conv.tenant.unit.unitNumber}` : 'Tenant';
        }
        else if (conv.participantType === 'OWNER' && conv.owner) {
            participantName = conv.owner.name || 'Property Owner';
            subtitle = 'Property Owner';
        }
        else if (conv.participantType === 'STAFF' && conv.staff) {
            participantName = conv.staff.name;
            subtitle = conv.staff.role || 'Staff Member';
        }
        return {
            id: conv.id,
            companyId: conv.companyId,
            participantType: conv.participantType,
            participantId: conv.tenantId || conv.ownerId || conv.staffId,
            participantName,
            participantRole,
            subtitle,
            lastMessage: lastMsg?.body || '',
            lastMessageAt: lastMsg?.createdAt || conv.lastMessageAt,
            lastMessageStatus: lastMsg?.status || 'SENT',
            isLastMessageMine: lastMsg?.senderId === currentUserId,
            unreadCount,
        };
    }
    /**
     * Get all messages in a conversation
     */
    async getMessages(conversationId, payload) {
        const conv = await database_js_1.default.conversation.findUnique({
            where: { id: conversationId },
        });
        if (!conv || conv.companyId !== payload.companyId) {
            throw new appError_js_1.AppError('Conversation not found or unauthorized.', 404, 'NOT_FOUND');
        }
        // Verify participant authorization
        const userEntity = await this.resolveUserEntity(payload);
        if (userEntity.role === 'TENANT' && conv.tenantId !== userEntity.entityId) {
            throw new appError_js_1.AppError('Forbidden: Access denied to this conversation.', 403, 'FORBIDDEN');
        }
        if (userEntity.role === 'OWNER' && conv.ownerId !== userEntity.entityId) {
            throw new appError_js_1.AppError('Forbidden: Access denied to this conversation.', 403, 'FORBIDDEN');
        }
        if (userEntity.role === 'STAFF' && conv.staffId !== userEntity.entityId) {
            throw new appError_js_1.AppError('Forbidden: Access denied to this conversation.', 403, 'FORBIDDEN');
        }
        const messages = await database_js_1.default.chatMessage.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
        });
        return messages.map((m) => ({
            id: m.id,
            conversationId: m.conversationId,
            senderRole: m.senderRole,
            senderId: m.senderId,
            recipientRole: m.recipientRole,
            recipientId: m.recipientId,
            body: m.body,
            status: m.status,
            createdAt: m.createdAt,
            readAt: m.readAt,
            isMine: m.senderId === payload.userId,
        }));
    }
    /**
     * Send a new text message
     */
    async sendMessage(conversationId, body, payload) {
        if (!body || !body.trim()) {
            throw new appError_js_1.AppError('Message body cannot be empty.', 400);
        }
        const conv = await database_js_1.default.conversation.findUnique({
            where: { id: conversationId },
        });
        if (!conv) {
            throw new appError_js_1.AppError('Conversation not found.', 404);
        }
        if (!payload.companyId && conv.companyId) {
            payload.companyId = conv.companyId;
        }
        if (conv.companyId !== payload.companyId) {
            throw new appError_js_1.AppError('Conversation not found.', 404);
        }
        const userEntity = await this.resolveUserEntity(payload);
        let recipientRole = 'MANAGER';
        let recipientId = 'OFFICE';
        if (userEntity.role === 'MANAGER') {
            recipientRole = conv.participantType;
            recipientId = conv.tenantId || conv.ownerId || conv.staffId || 'UNKNOWN';
        }
        // Security Guard Check
        (0, communication_guard_js_1.assertChatAllowed)({ roleName: userEntity.role, companyId: payload.companyId }, { roleName: recipientRole, companyId: conv.companyId });
        const newMsg = await database_js_1.default.chatMessage.create({
            data: {
                companyId: payload.companyId,
                conversationId: conv.id,
                senderRole: userEntity.role,
                senderId: payload.userId,
                recipientRole,
                recipientId,
                body: body.trim(),
                status: 'SENT',
            },
        });
        await database_js_1.default.conversation.update({
            where: { id: conv.id },
            data: { lastMessageAt: new Date() },
        });
        return {
            id: newMsg.id,
            conversationId: newMsg.conversationId,
            senderRole: newMsg.senderRole,
            senderId: newMsg.senderId,
            recipientRole: newMsg.recipientRole,
            recipientId: newMsg.recipientId,
            body: newMsg.body,
            status: newMsg.status,
            createdAt: newMsg.createdAt,
            isMine: true,
        };
    }
    /**
     * Mark all unread messages in thread as READ
     */
    async markAsRead(conversationId, payload) {
        const userEntity = await this.resolveUserEntity(payload);
        await database_js_1.default.chatMessage.updateMany({
            where: {
                conversationId,
                recipientRole: userEntity.role,
                status: { in: ['SENT', 'DELIVERED'] },
            },
            data: {
                status: 'READ',
                readAt: new Date(),
            },
        });
        return { success: true };
    }
    /**
     * Get all directory contacts for the company (for Manager view)
     */
    async getContactsDirectory(payload) {
        if (!payload.companyId)
            return [];
        const [tenants, owners, staff] = await Promise.all([
            database_js_1.default.tenant.findMany({
                where: { companyId: payload.companyId },
                include: { unit: { select: { unitNumber: true } } },
                orderBy: { firstName: 'asc' },
            }),
            database_js_1.default.owner.findMany({
                where: { companyId: payload.companyId },
                orderBy: { name: 'asc' },
            }),
            database_js_1.default.staffProfile.findMany({
                where: { companyId: payload.companyId },
                orderBy: { name: 'asc' },
            }),
        ]);
        const contacts = [];
        tenants.forEach((t) => {
            contacts.push({
                id: t.id,
                participantType: 'TENANT',
                name: `${t.firstName} ${t.lastName}`.trim(),
                email: t.email,
                phone: t.phone,
                role: 'Tenant',
                subtitle: t.unit?.unitNumber ? `Unit ${t.unit.unitNumber}` : 'Tenant',
            });
        });
        owners.forEach((o) => {
            contacts.push({
                id: o.id,
                participantType: 'OWNER',
                name: o.name || 'Property Owner',
                email: o.email,
                phone: o.phone,
                role: 'Owner',
                subtitle: 'Property Owner',
            });
        });
        staff.forEach((s) => {
            contacts.push({
                id: s.id,
                participantType: 'STAFF',
                name: s.name,
                email: s.email,
                phone: s.phone,
                role: 'Staff',
                subtitle: s.role || 'Staff Member',
            });
        });
        return contacts;
    }
}
exports.ChatService = ChatService;
exports.chatService = new ChatService();
