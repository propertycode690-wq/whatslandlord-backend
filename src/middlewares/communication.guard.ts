import { AppError } from '../utils/appError.js';

export function assertChatAllowed(
  sender: { roleName?: string; companyId?: string },
  recipient: { roleName?: string; companyId?: string }
) {
  // 1. Strict SaaS Multi-Tenant Isolation
  if (!sender.companyId || !recipient.companyId || sender.companyId !== recipient.companyId) {
    throw new AppError('Forbidden: Cross-company communication is strictly prohibited.', 403, 'FORBIDDEN');
  }

  const sRole = (sender.roleName || '').toLowerCase().trim();
  const rRole = (recipient.roleName || '').toLowerCase().trim();

  const isManagerRole = (role: string) =>
    role.includes('manager') || role.includes('admin') || role.includes('superadmin') || role === 'property manager';

  const isSenderManager = isManagerRole(sRole);
  const isRecipientManager = isManagerRole(rRole);

  // 2. Block Manager-to-Manager
  if (isSenderManager && isRecipientManager) {
    throw new AppError('Forbidden: Manager-to-Manager internal chat is disabled.', 403, 'FORBIDDEN');
  }

  // 3. Block Horizontal Peer-to-Peer (Tenant-to-Tenant, Owner-to-Owner, Tenant-to-Owner, etc.)
  if (!isSenderManager && !isRecipientManager) {
    throw new AppError('Forbidden: Non-manager users can only communicate directly with Property Management.', 403, 'FORBIDDEN');
  }

  // All other combinations are Manager <-> Tenant / Owner / Staff (Allowed!)
  return true;
}

