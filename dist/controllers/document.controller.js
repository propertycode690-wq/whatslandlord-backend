"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentController = exports.DocumentController = void 0;
const database_1 = __importDefault(require("../config/database"));
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const apiResponse_1 = require("../utils/apiResponse");
class DocumentController {
    // Helper to format bytes to human readable format
    formatBytes(bytes, decimals = 1) {
        if (bytes === 0)
            return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    // Upload Owner Document
    async uploadOwnerDocument(req, res, next) {
        try {
            const { name, category, ownerId, propertyId } = req.body;
            const companyId = req.user?.companyId;
            const file = req.file;
            if (!file) {
                throw new Error('File is required for upload');
            }
            // Cloudinary Upload
            let fileUrl = '';
            try {
                fileUrl = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary_1.default.uploader.upload_stream({ folder: 'owner', resource_type: 'auto' }, (error, result) => {
                        if (error)
                            return reject(error);
                        resolve(result?.secure_url || '');
                    });
                    uploadStream.end(file.buffer);
                });
            }
            catch (err) {
                console.error('Cloudinary owner document upload failed:', err);
                throw new Error('Cloudinary upload failed');
            }
            const fileSizeStr = this.formatBytes(file.size);
            // Save to database
            const doc = await database_1.default.ownerDocument.create({
                data: {
                    name: name || file.originalname,
                    category: category || 'Statements',
                    size: fileSizeStr,
                    fileUrl,
                    ownerId: ownerId || null,
                    propertyId: propertyId || null,
                    companyId: companyId || null,
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: doc, message: 'Owner document uploaded successfully.' });
        }
        catch (error) {
            next(error);
        }
    }
    // Upload Tenant Document
    async uploadTenantDocument(req, res, next) {
        try {
            const { name, category, tenantId, propertyId, buildingId, unitId } = req.body;
            const companyId = req.user?.companyId;
            const file = req.file;
            if (!file) {
                throw new Error('File is required for upload');
            }
            // Cloudinary Upload
            let fileUrl = '';
            try {
                fileUrl = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary_1.default.uploader.upload_stream({ folder: 'tenant-documents', resource_type: 'auto' }, (error, result) => {
                        if (error)
                            return reject(error);
                        resolve(result?.secure_url || '');
                    });
                    uploadStream.end(file.buffer);
                });
            }
            catch (err) {
                console.error('Cloudinary tenant document upload failed:', err);
                throw new Error('Cloudinary upload failed');
            }
            const fileSizeStr = this.formatBytes(file.size);
            // Save to database
            const doc = await database_1.default.tenantDocument.create({
                data: {
                    name: name || file.originalname,
                    category: category || 'Leasing',
                    size: fileSizeStr,
                    fileUrl,
                    tenantId: tenantId || null,
                    propertyId: propertyId || null,
                    buildingId: buildingId || null,
                    unitId: unitId || null,
                    companyId: companyId || null,
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: doc, message: 'Tenant document uploaded successfully.' });
        }
        catch (error) {
            next(error);
        }
    }
    // Get Owner Documents (Strictly isolated by company or specific owner)
    async getOwnerDocuments(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const userRole = req.user?.roleName;
            const isOwner = userRole === 'Owner';
            const requestedOwnerId = req.query.ownerId;
            if (isOwner && req.user?.email) {
                const owner = await database_1.default.owner.findFirst({
                    where: { email: req.user.email },
                });
                if (!owner)
                    return (0, apiResponse_1.sendSuccess)({ res, data: [] });
                const docs = await database_1.default.ownerDocument.findMany({
                    where: { ownerId: owner.id },
                    orderBy: { uploadedAt: 'desc' },
                });
                return (0, apiResponse_1.sendSuccess)({ res, data: docs });
            }
            const whereClause = {};
            if (companyId)
                whereClause.companyId = companyId;
            if (requestedOwnerId)
                whereClause.ownerId = requestedOwnerId;
            const docs = await database_1.default.ownerDocument.findMany({
                where: whereClause,
                orderBy: { uploadedAt: 'desc' },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: docs });
        }
        catch (error) {
            next(error);
        }
    }
    // Get Tenant Documents (Strictly isolated: Tenant only sees their own documents)
    async getTenantDocuments(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const userRole = req.user?.roleName;
            const isTenant = userRole === 'Tenant';
            const requestedTenantId = req.query.tenantId;
            if (isTenant && req.user?.email) {
                const tenant = await database_1.default.tenant.findFirst({
                    where: { email: req.user.email },
                });
                if (!tenant)
                    return (0, apiResponse_1.sendSuccess)({ res, data: [] });
                const docs = await database_1.default.tenantDocument.findMany({
                    where: { tenantId: tenant.id },
                    orderBy: { uploadedAt: 'desc' },
                });
                return (0, apiResponse_1.sendSuccess)({
                    res,
                    data: docs.map((d) => ({
                        ...d,
                        tenantName: `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || 'Resident Tenant',
                    })),
                });
            }
            const whereClause = {};
            if (companyId) {
                whereClause.OR = [{ companyId }, { companyId: null }];
            }
            if (requestedTenantId) {
                whereClause.tenantId = requestedTenantId;
            }
            const docs = await database_1.default.tenantDocument.findMany({
                where: whereClause,
                orderBy: { uploadedAt: 'desc' },
            });
            const tenantIds = docs.map((d) => d.tenantId).filter(Boolean);
            let tenantMap = new Map();
            if (tenantIds.length > 0) {
                const tenants = await database_1.default.tenant.findMany({
                    where: { id: { in: tenantIds } },
                    select: { id: true, firstName: true, lastName: true },
                });
                tenants.forEach((t) => {
                    tenantMap.set(t.id, `${t.firstName || ''} ${t.lastName || ''}`.trim());
                });
            }
            const enrichedDocs = docs.map((d) => ({
                ...d,
                tenantName: d.tenantId && tenantMap.has(d.tenantId) ? tenantMap.get(d.tenantId) : 'Resident Tenant',
            }));
            return (0, apiResponse_1.sendSuccess)({ res, data: enrichedDocs });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.DocumentController = DocumentController;
exports.documentController = new DocumentController();
