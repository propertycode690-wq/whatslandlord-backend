"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.restoreBinController = exports.RestoreBinController = void 0;
const database_1 = __importDefault(require("../config/database"));
const apiResponse_1 = require("../utils/apiResponse");
const appError_1 = require("../utils/appError");
const uuid_1 = require("uuid");
class RestoreBinController {
    // Ensure the table exists dynamically
    static tableEnsured = false;
    static async ensureTable() {
        if (this.tableEnsured)
            return;
        try {
            await database_1.default.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS restore_bin (
          id VARCHAR(191) PRIMARY KEY,
          entityType VARCHAR(100) NOT NULL,
          entityId VARCHAR(191) NOT NULL,
          title VARCHAR(255) NOT NULL,
          subtitle VARCHAR(255) NULL,
          data LONGTEXT NOT NULL,
          deletedBy VARCHAR(191) NULL,
          deletedByUserId VARCHAR(191) NULL,
          deletedByEmail VARCHAR(191) NULL,
          companyId VARCHAR(191) NULL,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          deletedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          INDEX idx_rb_company (companyId),
          INDEX idx_rb_user (deletedByUserId),
          INDEX idx_rb_entity (entityType, entityId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
            await database_1.default.$executeRawUnsafe(`
        ALTER TABLE restore_bin ADD COLUMN deletedByUserId VARCHAR(191) NULL;
      `).catch(() => { });
            await database_1.default.$executeRawUnsafe(`
        ALTER TABLE restore_bin ADD COLUMN deletedByEmail VARCHAR(191) NULL;
      `).catch(() => { });
            this.tableEnsured = true;
        }
        catch (e) {
            console.error('Failed to ensure restore_bin table:', e);
        }
    }
    async getAll(req, res, next) {
        try {
            await RestoreBinController.ensureTable();
            const companyId = req.user?.companyId;
            const userId = req.user?.userId;
            const userEmail = req.user?.email;
            const userRole = req.user?.roleName;
            const { type, search } = req.query;
            let query = 'SELECT * FROM restore_bin WHERE 1=1';
            const params = [];
            // 1. Strict Company Isolation (Never leak across companies)
            if (companyId) {
                query += ' AND companyId = ?';
                params.push(companyId);
            }
            else {
                query += ' AND companyId IS NULL';
            }
            // 2. Strict Manager Isolation (Manager A only sees items deleted by Manager A)
            const isSuperOrAdmin = userRole === 'Super Admin' || userRole === 'Admin' || userRole === 'Company Admin';
            if (!isSuperOrAdmin && (userId || userEmail)) {
                query += ' AND (deletedByUserId = ? OR deletedByEmail = ? OR (deletedByUserId IS NULL AND deletedBy = ?))';
                params.push(userId || '', userEmail || '', userEmail || '');
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
            const items = await database_1.default.$queryRawUnsafe(query, ...params);
            const seen = new Set();
            const parsed = [];
            for (const item of items) {
                const uniqueKey = `${(item.entityType || '').toLowerCase()}_${item.entityId}`;
                if (seen.has(uniqueKey))
                    continue;
                seen.add(uniqueKey);
                let parsedData = {};
                try {
                    parsedData = item.data ? JSON.parse(item.data) : {};
                }
                catch {
                    parsedData = {};
                }
                parsed.push({
                    id: item.id,
                    entityType: item.entityType,
                    entityId: item.entityId,
                    title: item.title,
                    subtitle: item.subtitle,
                    deletedBy: item.deletedBy || 'Property Manager',
                    deletedByUserId: item.deletedByUserId,
                    deletedByEmail: item.deletedByEmail,
                    companyId: item.companyId,
                    deletedAt: item.deletedAt,
                    createdAt: item.createdAt,
                    data: parsedData,
                });
            }
            return (0, apiResponse_1.sendSuccess)({ res, data: parsed });
        }
        catch (error) {
            next(error);
        }
    }
    async softDelete(req, res, next) {
        try {
            await RestoreBinController.ensureTable();
            const companyId = req.user?.companyId;
            const { entityType, entityId, title, subtitle, data, deletedBy, deletedAt } = req.body;
            if (!entityType || !entityId) {
                throw new appError_1.AppError('entityType and entityId are required', 400);
            }
            // Remove any pre-existing bin records for this exact entity to prevent duplicates
            try {
                await database_1.default.$executeRawUnsafe('DELETE FROM restore_bin WHERE entityType = ? AND entityId = ?', entityType, entityId);
            }
            catch (e) {
                console.warn('Failed to clean previous restore_bin duplicate:', e);
            }
            const id = (0, uuid_1.v4)();
            const userObj = req.user;
            const userId = req.user?.userId || null;
            const userEmail = req.user?.email || null;
            const userIdentifier = deletedBy ||
                (userObj ? `${userObj.firstName || ''} ${userObj.lastName || ''}`.trim() : '') ||
                userEmail ||
                'Property Manager';
            const serializedData = typeof data === 'string' ? data : JSON.stringify(data || {});
            const now = new Date();
            const itemDeletedAt = deletedAt ? new Date(deletedAt) : now;
            await database_1.default.$executeRawUnsafe(`INSERT INTO restore_bin (id, entityType, entityId, title, subtitle, data, deletedBy, deletedByUserId, deletedByEmail, companyId, createdAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, entityType, entityId, title || `${entityType} #${entityId.substring(0, 8)}`, subtitle || '', serializedData, userIdentifier, userId, userEmail, companyId || null, now, itemDeletedAt);
            // Perform soft delete on the source entity if applicable
            try {
                if (entityType === 'Property') {
                    await database_1.default.property.update({
                        where: { id: entityId },
                        data: { status: 'Deleted' },
                    }).catch(() => { });
                }
                else if (entityType === 'Unit') {
                    await database_1.default.unit.update({
                        where: { id: entityId },
                        data: { status: 'UnderMaintenance' },
                    }).catch(() => { });
                }
                else if (entityType === 'Tenant') {
                    await database_1.default.tenant.update({
                        where: { id: entityId },
                        data: { status: 'Inactive' },
                    }).catch(() => { });
                }
                else if (entityType === 'Lease') {
                    await database_1.default.lease.update({
                        where: { id: entityId },
                        data: { status: 'Terminated' },
                    }).catch(() => { });
                }
            }
            catch (e) {
                console.warn('Soft-delete status update on source entity ignored:', e);
            }
            return (0, apiResponse_1.sendSuccess)({
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
        }
        catch (error) {
            next(error);
        }
    }
    async restore(req, res, next) {
        try {
            await RestoreBinController.ensureTable();
            const id = req.params.id;
            const companyId = req.user?.companyId;
            const items = await database_1.default.$queryRawUnsafe(`SELECT * FROM restore_bin WHERE id = ? ${companyId ? 'AND (companyId = ? OR companyId IS NULL)' : ''} LIMIT 1`, ...(companyId ? [id, companyId] : [id]));
            if (!items || items.length === 0) {
                throw new appError_1.AppError('Item not found in Restore Bin', 404);
            }
            const item = items[0];
            let entityData = {};
            try {
                entityData = JSON.parse(item.data);
            }
            catch {
                entityData = {};
            }
            // Restore based on entityType
            const { entityType, entityId } = item;
            if (entityType === 'Property') {
                const existing = await database_1.default.property.findUnique({ where: { id: entityId } }).catch(() => null);
                if (existing) {
                    await database_1.default.property.update({
                        where: { id: entityId },
                        data: { status: entityData.status && entityData.status !== 'Deleted' ? entityData.status : 'Active' },
                    });
                }
            }
            else if (entityType === 'Unit') {
                const existing = await database_1.default.unit.findUnique({ where: { id: entityId } }).catch(() => null);
                if (existing) {
                    await database_1.default.unit.update({
                        where: { id: entityId },
                        data: { status: (entityData.status && entityData.status !== 'Inactive' ? entityData.status : 'Vacant') },
                    });
                }
            }
            else if (entityType === 'Tenant') {
                const existing = await database_1.default.tenant.findUnique({ where: { id: entityId } }).catch(() => null);
                if (existing) {
                    await database_1.default.tenant.update({
                        where: { id: entityId },
                        data: { status: (entityData.status && entityData.status !== 'Inactive' ? entityData.status : 'Active') },
                    });
                }
            }
            else if (entityType === 'Lease') {
                const existing = await database_1.default.lease.findUnique({ where: { id: entityId } }).catch(() => null);
                if (existing) {
                    await database_1.default.lease.update({
                        where: { id: entityId },
                        data: { status: (entityData.status && entityData.status !== 'Terminated' ? entityData.status : 'Active') },
                    });
                }
            }
            else if (entityType === 'Owner') {
                const existing = await database_1.default.owner.findUnique({ where: { id: entityId } }).catch(() => null);
                if (!existing) {
                    const resolvedName = entityData.name || `${entityData.firstName || ''} ${entityData.lastName || ''}`.trim() || item.title || 'Restored Owner';
                    const resolvedEmail = entityData.email || `${entityId.substring(0, 8)}@example.com`;
                    await database_1.default.owner.create({
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
            }
            else if (entityType === 'ServiceRequest') {
                const existing = await database_1.default.serviceRequest.findUnique({ where: { id: entityId } }).catch(() => null);
                if (existing) {
                    await database_1.default.serviceRequest.update({
                        where: { id: entityId },
                        data: { status: 'New' },
                    }).catch(() => { });
                }
            }
            else if (entityType === 'WorkOrder') {
                const existing = await database_1.default.workOrder.findUnique({ where: { id: entityId } }).catch(() => null);
                if (existing) {
                    await database_1.default.workOrder.update({
                        where: { id: entityId },
                        data: { status: 'Open' },
                    }).catch(() => { });
                }
            }
            // Remove from restore_bin
            await database_1.default.$executeRawUnsafe(`DELETE FROM restore_bin WHERE id = ? OR entityId = ?`, id, entityId);
            return (0, apiResponse_1.sendSuccess)({
                res,
                message: 'Item restored successfully',
                data: { id, entityType, entityId, restored: true },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async permanentDelete(req, res, next) {
        try {
            await RestoreBinController.ensureTable();
            const id = req.params.id;
            const companyId = req.user?.companyId;
            const userId = req.user?.userId;
            const userEmail = req.user?.email;
            const userRole = req.user?.roleName;
            let checkQuery = 'SELECT * FROM restore_bin WHERE id = ?';
            const checkParams = [id];
            if (companyId) {
                checkQuery += ' AND companyId = ?';
                checkParams.push(companyId);
            }
            else {
                checkQuery += ' AND companyId IS NULL';
            }
            const isSuperOrAdmin = userRole === 'Super Admin' || userRole === 'Admin' || userRole === 'Company Admin';
            if (!isSuperOrAdmin && (userId || userEmail)) {
                checkQuery += ' AND (deletedByUserId = ? OR deletedByEmail = ? OR deletedBy = ?)';
                checkParams.push(userId || '', userEmail || '', userEmail || '');
            }
            const items = await database_1.default.$queryRawUnsafe(checkQuery, ...checkParams);
            if (!items || items.length === 0) {
                throw new appError_1.AppError('Item not found in Restore Bin', 404);
            }
            const item = items[0];
            const { entityType, entityId } = item;
            // Permanently remove source entity from DB if it exists
            try {
                if (entityType === 'Property') {
                    await database_1.default.unit.deleteMany({ where: { propertyId: entityId } }).catch(() => { });
                    await database_1.default.building.deleteMany({ where: { propertyId: entityId } }).catch(() => { });
                    await database_1.default.property.delete({ where: { id: entityId } }).catch(() => { });
                }
                else if (entityType === 'Unit') {
                    await database_1.default.unit.delete({ where: { id: entityId } }).catch(() => { });
                }
                else if (entityType === 'Tenant') {
                    await database_1.default.tenant.delete({ where: { id: entityId } }).catch(() => { });
                }
                else if (entityType === 'Lease') {
                    await database_1.default.lease.delete({ where: { id: entityId } }).catch(() => { });
                }
                else if (entityType === 'WorkOrder') {
                    await database_1.default.workOrder.delete({ where: { id: entityId } }).catch(() => { });
                }
                else if (entityType === 'ServiceRequest') {
                    await database_1.default.serviceRequest.delete({ where: { id: entityId } }).catch(() => { });
                }
                else if (entityType === 'Invoice') {
                    await database_1.default.invoice.delete({ where: { id: entityId } }).catch(() => { });
                }
                else if (entityType === 'Vendor') {
                    await database_1.default.vendor.delete({ where: { id: entityId } }).catch(() => { });
                }
                else if (entityType === 'Owner') {
                    await database_1.default.owner.delete({ where: { id: entityId } }).catch(() => { });
                }
            }
            catch (err) {
                console.warn('Permanent delete from DB table encountered error, continuing:', err);
            }
            // Remove from restore_bin
            await database_1.default.$executeRawUnsafe(`DELETE FROM restore_bin WHERE id = ?`, id);
            return (0, apiResponse_1.sendSuccess)({
                res,
                message: 'Item permanently deleted',
                data: { id, entityType, entityId, permanentlyDeleted: true },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async emptyBin(req, res, next) {
        try {
            await RestoreBinController.ensureTable();
            const companyId = req.user?.companyId;
            const userId = req.user?.userId;
            const userEmail = req.user?.email;
            const userRole = req.user?.roleName;
            let query = 'DELETE FROM restore_bin WHERE 1=1';
            const params = [];
            if (companyId) {
                query += ' AND companyId = ?';
                params.push(companyId);
            }
            else {
                query += ' AND companyId IS NULL';
            }
            const isSuperOrAdmin = userRole === 'Super Admin' || userRole === 'Admin' || userRole === 'Company Admin';
            if (!isSuperOrAdmin && (userId || userEmail)) {
                query += ' AND (deletedByUserId = ? OR deletedByEmail = ? OR deletedBy = ?)';
                params.push(userId || '', userEmail || '', userEmail || '');
            }
            await database_1.default.$executeRawUnsafe(query, ...params);
            return (0, apiResponse_1.sendSuccess)({
                res,
                message: 'Restore Bin emptied permanently',
                data: { success: true },
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.RestoreBinController = RestoreBinController;
exports.restoreBinController = new RestoreBinController();
