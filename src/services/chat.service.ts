import prisma from '../config/database.js';
import { TokenPayload } from '../utils/jwt.js';
import { AppError } from '../utils/appError.js';
import { assertChatAllowed } from '../middlewares/communication.guard.js';

export class ChatService {
  /**
   * Helper to resolve the entity ID (Tenant ID, Owner ID, Staff ID) for non-manager roles
   */
  async resolveUserEntity(payload: TokenPayload): Promise<{
    role: 'MANAGER' | 'TENANT' | 'OWNER' | 'STAFF';
    entityId: string;
    displayName: string;
  }> {
    const roleStr = (payload.roleName || '').toLowerCase();

    if (roleStr === 'tenant') {
      const tenant = await prisma.tenant.findFirst({
        where: { email: payload.email, companyId: payload.companyId },
      });
      if (!tenant) throw new AppError('Tenant profile not found for this account.', 404, 'NOT_FOUND');
      return { role: 'TENANT', entityId: tenant.id, displayName: `${tenant.firstName} ${tenant.lastName}`.trim() };
    }

    if (roleStr === 'owner') {
      const owner = await prisma.owner.findFirst({
        where: { email: payload.email, companyId: payload.companyId },
      });
      if (!owner) throw new AppError('Owner profile not found for this account.', 404, 'NOT_FOUND');
      return { role: 'OWNER', entityId: owner.id, displayName: owner.name || 'Owner' };
    }

    if (roleStr.includes('staff') || roleStr.includes('maintenance')) {
      const staff = await prisma.staffProfile.findFirst({
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
  async getOrCreateConversation(
    companyId: string,
    participantType: 'TENANT' | 'OWNER' | 'STAFF',
    participantId: string
  ) {
    const whereClause: any = { companyId, participantType };
    if (participantType === 'TENANT') whereClause.tenantId = participantId;
    if (participantType === 'OWNER') whereClause.ownerId = participantId;
    if (participantType === 'STAFF') whereClause.staffId = participantId;

    let conv = await prisma.conversation.findFirst({
      where: whereClause,
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, unit: { select: { unitNumber: true } } } },
        owner: { select: { id: true, name: true, email: true, phone: true } },
        staff: { select: { id: true, name: true, email: true, phone: true, role: true } },
      },
    });

    if (!conv) {
      conv = await prisma.conversation.create({
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
  async getConversations(payload: TokenPayload) {
    if (!payload.companyId) throw new AppError('Company ID missing from user token.', 400);

    const userEntity = await this.resolveUserEntity(payload);

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
    const convs = await prisma.conversation.findMany({
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
  private async formatConversation(conv: any, currentUserId: string, currentRole: string) {
    const lastMsg = await prisma.chatMessage.findFirst({
      where: { conversationId: conv.id },
      orderBy: { createdAt: 'desc' },
    });

    const unreadCount = await prisma.chatMessage.count({
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
    } else if (conv.participantType === 'OWNER' && conv.owner) {
      participantName = conv.owner.name || 'Property Owner';
      subtitle = 'Property Owner';
    } else if (conv.participantType === 'STAFF' && conv.staff) {
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
  async getMessages(conversationId: string, payload: TokenPayload) {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conv || conv.companyId !== payload.companyId) {
      throw new AppError('Conversation not found or unauthorized.', 404, 'NOT_FOUND');
    }

    // Verify participant authorization
    const userEntity = await this.resolveUserEntity(payload);
    if (userEntity.role === 'TENANT' && conv.tenantId !== userEntity.entityId) {
      throw new AppError('Forbidden: Access denied to this conversation.', 403, 'FORBIDDEN');
    }
    if (userEntity.role === 'OWNER' && conv.ownerId !== userEntity.entityId) {
      throw new AppError('Forbidden: Access denied to this conversation.', 403, 'FORBIDDEN');
    }
    if (userEntity.role === 'STAFF' && conv.staffId !== userEntity.entityId) {
      throw new AppError('Forbidden: Access denied to this conversation.', 403, 'FORBIDDEN');
    }

    const messages = await prisma.chatMessage.findMany({
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
  async sendMessage(conversationId: string, body: string, payload: TokenPayload) {
    if (!body || !body.trim()) {
      throw new AppError('Message body cannot be empty.', 400);
    }

    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conv || conv.companyId !== payload.companyId) {
      throw new AppError('Conversation not found.', 404);
    }

    const userEntity = await this.resolveUserEntity(payload);

    let recipientRole = 'MANAGER';
    let recipientId = 'OFFICE';

    if (userEntity.role === 'MANAGER') {
      recipientRole = conv.participantType;
      recipientId = conv.tenantId || conv.ownerId || conv.staffId || 'UNKNOWN';
    }

    // Security Guard Check
    assertChatAllowed(
      { roleName: userEntity.role, companyId: payload.companyId },
      { roleName: recipientRole, companyId: conv.companyId }
    );

    const newMsg = await prisma.chatMessage.create({
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

    await prisma.conversation.update({
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
  async markAsRead(conversationId: string, payload: TokenPayload) {
    const userEntity = await this.resolveUserEntity(payload);

    await prisma.chatMessage.updateMany({
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
  async getContactsDirectory(payload: TokenPayload) {
    if (!payload.companyId) return [];

    const [tenants, owners, staff] = await Promise.all([
      prisma.tenant.findMany({
        where: { companyId: payload.companyId },
        include: { unit: { select: { unitNumber: true } } },
        orderBy: { firstName: 'asc' },
      }),
      prisma.owner.findMany({
        where: { companyId: payload.companyId },
        orderBy: { name: 'asc' },
      }),
      prisma.staffProfile.findMany({
        where: { companyId: payload.companyId },
        orderBy: { name: 'asc' },
      }),
    ]);

    const contacts: any[] = [];

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

export const chatService = new ChatService();

