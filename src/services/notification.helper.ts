import prisma from '../config/database';

export interface CreateNotificationParams {
  title: string;
  message: string;
  role: 'Property Manager' | 'Tenant' | 'Owner' | 'Maintenance Staff' | 'Collection Manager' | string;
  type?: 'info' | 'success' | 'warning' | 'error';
  companyId?: string | null;
  userId?: string | null;
  targetId?: string | null;
  targetUrl?: string | null;
}

export async function createNotification(params: CreateNotificationParams) {
  try {
    return await prisma.notification.create({
      data: {
        title: params.title,
        message: params.message,
        role: params.role || 'Property Manager',
        type: params.type || 'info',
        companyId: params.companyId || null,
        userId: params.userId || null,
        targetId: params.targetId || null,
        targetUrl: params.targetUrl || null,
      },
    });
  } catch (error) {
    console.error('Failed to create notification:', error);
    return null;
  }
}
