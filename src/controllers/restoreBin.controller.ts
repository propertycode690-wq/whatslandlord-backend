import { Response, NextFunction } from 'express';
import prisma from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { AppError } from '../utils/appError';
import { v4 as uuidv4 } from 'uuid';

export class RestoreBinController {
  // Ensure the table exists dynamically
  private static tableEnsured = false;
  private static async ensureTable() {
    if (this.tableEnsured) return;
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS restore_bin (
          id VARCHAR(191) PRIMARY KEY,
          entityType VARCHAR(100) NOT NULL,
          entityId VARCHAR(191) NOT NULL,
          title VARCHAR(255) NOT NULL,
          subtitle VARCHAR(255) NULL,
          data LONGTEXT NOT NULL,
          deletedBy VARCHAR(191) NULL,
          companyId VARCHAR(191) NULL,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          deletedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          INDEX idx_rb_company (companyId),
          INDEX idx_rb_entity (entityType, entityId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      this.tableEnsured = true;
    } catch (e) {
      console.error('Failed to ensure restore_bin table:', e);
    }
  }

  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await RestoreBinController.ensureTable();
      const companyId = req.user?.companyId;
      const { type, search } = req.query;

      let query = 'SELECT * FROM restore_bin WHERE 1=1';
      const params: any[] = [];

      if (companyId) {
        query += ' AND (companyId = ? OR companyId IS NULL)';
        params.push(companyId);
      }

      if (type && type !== 'all' && type !== 'All') {
        query += ' AND entityType = ?';
        params.push(type);
      }

      if (search && typeof search === 'string' && search.trim()) {
        query += ' AND (title LIKE ? OR subtitle LIKE ? OR entityType LIKE ?)';
        const term = `%${search.trim()}%`;
        params.push(term, term, term);
      }

      query += ' ORDER BY deletedAt DESC';

      const items: any[] = await prisma.$queryRawUnsafe(query, ...params);
      
      const seen = new Set<string>();
      const parsed: any[] = [];
      for (const item of items) {
        const uniqueKey = `${(item.entityType || '').toLowerCase()}_${item.entityId}`;
        if (seen.has(uniqueKey)) continue;
        seen.add(uniqueKey);

        let parsedData = {};
        try {
          parsedData = item.data ? JSON.parse(item.data) : {};
        } catch {
          parsedData = {};
        }
        parsed.push({
          id: item.id,
          entityType: item.entityType,
          entityId: item.entityId,
          title: item.title,
          subtitle: item.subtitle,
          deletedBy: item.deletedBy || 'Property Manager',
          companyId: item.companyId,
          deletedAt: item.deletedAt,
          createdAt: item.createdAt,
          data: parsedData,
        });
      }

      return sendSuccess({ res, data: parsed });
    } catch (error) {
      next(error);
    }
  }

  async softDelete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await RestoreBinController.ensureTable();
      const companyId = req.user?.companyId;
      const { entityType, entityId, title, subtitle, data, deletedBy } = req.body;

      if (!entityType || !entityId) {
        throw new AppError('entityType and entityId are required', 400);
      }

      // Remove any pre-existing bin records for this exact entity to prevent duplicates
      try {
        await prisma.$executeRawUnsafe(
          'DELETE FROM restore_bin WHERE entityType = ? AND entityId = ?',
          entityType,
          entityId
        );
      } catch (e) {
        console.warn('Failed to clean previous restore_bin duplicate:', e);
      }

      const id = uuidv4();
      const userIdentifier = deletedBy || (req.user ? `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() : 'Property Manager') || req.user?.email || 'Property Manager';
      const serializedData = typeof data === 'string' ? data : JSON.stringify(data || {});
      const now = new Date();

      await prisma.$executeRawUnsafe(
        `INSERT INTO restore_bin (id, entityType, entityId, title, subtitle, data, deletedBy, companyId, createdAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        entityType,
        entityId,
        title || `${entityType} #${entityId.substring(0, 8)}`,
        subtitle || '',
        serializedData,
        userIdentifier,
        companyId || null,
        now,
        now
      );

      // Perform soft delete on the source entity if applicable
      try {
        if (entityType === 'Property') {
          await prisma.property.update({
            where: { id: entityId },
            data: { status: 'Deleted' },
          }).catch(() => {});
        } else if (entityType === 'Unit') {
          await prisma.unit.update({
            where: { id: entityId },
            data: { status: 'Inactive' },
          }).catch(() => {});
        } else if (entityType === 'Tenant') {
          await prisma.tenant.update({
            where: { id: entityId },
            data: { status: 'Inactive' },
          }).catch(() => {});
        } else if (entityType === 'Lease') {
          await prisma.lease.update({
            where: { id: entityId },
            data: { status: 'Terminated' },
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('Soft-delete status update on source entity ignored:', e);
      }

      return sendSuccess({
        res,
        statusCode: 201,
        message: 'Item moved to Restore Bin',
        data: {
          id,
          entityType,
          entityId,
          title: title || `${entityType} #${entityId.substring(0, 8)}`,
          subtitle: subtitle || '',
          deletedBy: userIdentifier,
          companyId,
          deletedAt: now,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async restore(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await RestoreBinController.ensureTable();
      const id = req.params.id as string;
      const companyId = req.user?.companyId;

      const items: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM restore_bin WHERE id = ? ${companyId ? 'AND (companyId = ? OR companyId IS NULL)' : ''} LIMIT 1`,
        ...(companyId ? [id, companyId] : [id])
      );

      if (!items || items.length === 0) {
        throw new AppError('Item not found in Restore Bin', 404);
      }

      const item = items[0];
      let entityData: any = {};
      try {
        entityData = JSON.parse(item.data);
      } catch {
        entityData = {};
      }

      // Restore based on entityType
      const { entityType, entityId } = item;

      if (entityType === 'Property') {
        const existing = await prisma.property.findUnique({ where: { id: entityId } }).catch(() => null);
        if (existing) {
          await prisma.property.update({
            where: { id: entityId },
            data: { status: entityData.status && entityData.status !== 'Deleted' ? entityData.status : 'Active' },
          });
        }
      } else if (entityType === 'Unit') {
        const existing = await prisma.unit.findUnique({ where: { id: entityId } }).catch(() => null);
        if (existing) {
          await prisma.unit.update({
            where: { id: entityId },
            data: { status: entityData.status && entityData.status !== 'Inactive' ? entityData.status : 'Vacant' },
          });
        }
      } else if (entityType === 'Tenant') {
        const existing = await prisma.tenant.findUnique({ where: { id: entityId } }).catch(() => null);
        if (existing) {
          await prisma.tenant.update({
            where: { id: entityId },
            data: { status: entityData.status && entityData.status !== 'Inactive' ? entityData.status : 'Active' },
          });
        }
      } else if (entityType === 'Lease') {
        const existing = await prisma.lease.findUnique({ where: { id: entityId } }).catch(() => null);
        if (existing) {
          await prisma.lease.update({
            where: { id: entityId },
            data: { status: entityData.status && entityData.status !== 'Terminated' ? entityData.status : 'Active' },
          });
        }
      } else if (entityType === 'Owner') {
        const existing = await prisma.owner.findUnique({ where: { id: entityId } }).catch(() => null);
        if (!existing) {
          const resolvedName = entityData.name || `${entityData.firstName || ''} ${entityData.lastName || ''}`.trim() || item.title || 'Restored Owner';
          const resolvedEmail = entityData.email || `${entityId.substring(0, 8)}@example.com`;
          await prisma.owner.create({
            data: {
              id: entityId,
              name: resolvedName,
              email: resolvedEmail,
              phone: entityData.phone || '',
              payoutMethod: entityData.payoutMethod || 'ACH/Direct Deposit',
              companyId: item.companyId || companyId || null,
            },
          }).catch((err) => {
            console.error('Failed to recreate restored owner in DB:', err);
          });
        }
      } else if (entityType === 'ServiceRequest') {
        const existing = await prisma.serviceRequest.findUnique({ where: { id: entityId } }).catch(() => null);
        if (existing) {
          await prisma.serviceRequest.update({
            where: { id: entityId },
            data: { status: 'New' },
          }).catch(() => {});
        }
      } else if (entityType === 'WorkOrder') {
        const existing = await prisma.workOrder.findUnique({ where: { id: entityId } }).catch(() => null);
        if (existing) {
          await prisma.workOrder.update({
            where: { id: entityId },
            data: { status: 'Open' },
          }).catch(() => {});
        }
      }

      // Remove from restore_bin
      await prisma.$executeRawUnsafe(`DELETE FROM restore_bin WHERE id = ? OR entityId = ?`, id, entityId);

      return sendSuccess({
        res,
        message: 'Item restored successfully',
        data: { id, entityType, entityId, restored: true },
      });
    } catch (error) {
      next(error);
    }
  }

  async permanentDelete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await RestoreBinController.ensureTable();
      const id = req.params.id as string;
      const companyId = req.user?.companyId;

      const items: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM restore_bin WHERE id = ? ${companyId ? 'AND (companyId = ? OR companyId IS NULL)' : ''} LIMIT 1`,
        ...(companyId ? [id, companyId] : [id])
      );

      if (!items || items.length === 0) {
        throw new AppError('Item not found in Restore Bin', 404);
      }

      const item = items[0];
      const { entityType, entityId } = item;

      // Permanently remove source entity from DB if it exists
      try {
        if (entityType === 'Property') {
          await prisma.unit.deleteMany({ where: { propertyId: entityId } }).catch(() => {});
          await prisma.building.deleteMany({ where: { propertyId: entityId } }).catch(() => {});
          await prisma.property.delete({ where: { id: entityId } }).catch(() => {});
        } else if (entityType === 'Unit') {
          await prisma.unit.delete({ where: { id: entityId } }).catch(() => {});
        } else if (entityType === 'Tenant') {
          await prisma.tenant.delete({ where: { id: entityId } }).catch(() => {});
        } else if (entityType === 'Lease') {
          await prisma.lease.delete({ where: { id: entityId } }).catch(() => {});
        } else if (entityType === 'WorkOrder') {
          await prisma.workOrder.delete({ where: { id: entityId } }).catch(() => {});
        } else if (entityType === 'ServiceRequest') {
          await prisma.serviceRequest.delete({ where: { id: entityId } }).catch(() => {});
        } else if (entityType === 'Invoice') {
          await prisma.invoice.delete({ where: { id: entityId } }).catch(() => {});
        } else if (entityType === 'Vendor') {
          await prisma.vendor.delete({ where: { id: entityId } }).catch(() => {});
        } else if (entityType === 'Owner') {
          await prisma.owner.delete({ where: { id: entityId } }).catch(() => {});
        }
      } catch (err) {
        console.warn('Permanent delete from DB table encountered error, continuing:', err);
      }

      // Remove from restore_bin
      await prisma.$executeRawUnsafe(`DELETE FROM restore_bin WHERE id = ?`, id);

      return sendSuccess({
        res,
        message: 'Item permanently deleted',
        data: { id, entityType, entityId, permanentlyDeleted: true },
      });
    } catch (error) {
      next(error);
    }
  }

  async emptyBin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await RestoreBinController.ensureTable();
      const companyId = req.user?.companyId;

      if (companyId) {
        await prisma.$executeRawUnsafe(`DELETE FROM restore_bin WHERE companyId = ?`, companyId);
      } else {
        await prisma.$executeRawUnsafe(`DELETE FROM restore_bin`);
      }

      return sendSuccess({
        res,
        message: 'Restore Bin emptied permanently',
        data: { success: true },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const restoreBinController = new RestoreBinController();
