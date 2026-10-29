import { Response, NextFunction } from 'express';
import prisma from '../config/database';
import cloudinary from '../config/cloudinary';
import { sendSuccess } from '../utils/apiResponse';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class DocumentController {
  // Helper to format bytes to human readable format
  private formatBytes(bytes: number, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Upload Owner Document
  async uploadOwnerDocument(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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
        fileUrl = await new Promise<string>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'owner-documents', resource_type: 'auto' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result?.secure_url || '');
            }
          );
          uploadStream.end(file.buffer);
        });
      } catch (err) {
        console.error('Cloudinary owner document upload failed:', err);
        throw new Error('Cloudinary upload failed');
      }

      const fileSizeStr = this.formatBytes(file.size);

      // Save to database
      const doc = await prisma.ownerDocument.create({
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

      return sendSuccess({ res, statusCode: 201, data: doc, message: 'Owner document uploaded successfully.' });
    } catch (error) {
      next(error);
    }
  }

  // Upload Tenant Document
  async uploadTenantDocument(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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
        fileUrl = await new Promise<string>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'tenant-documents', resource_type: 'auto' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result?.secure_url || '');
            }
          );
          uploadStream.end(file.buffer);
        });
      } catch (err) {
        console.error('Cloudinary tenant document upload failed:', err);
        throw new Error('Cloudinary upload failed');
      }

      const fileSizeStr = this.formatBytes(file.size);

      // Save to database
      const doc = await prisma.tenantDocument.create({
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

      return sendSuccess({ res, statusCode: 201, data: doc, message: 'Tenant document uploaded successfully.' });
    } catch (error) {
      next(error);
    }
  }

  // Get Owner Documents (Strictly isolated by company or specific owner)
  async getOwnerDocuments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const userRole = req.user?.roleName;
      const isOwner = userRole === 'Owner';
      const requestedOwnerId = req.query.ownerId as string | undefined;

      if (isOwner && req.user?.email) {
        const owner = await prisma.owner.findFirst({
          where: { email: req.user.email },
        });
        if (!owner) return sendSuccess({ res, data: [] });
        const docs = await prisma.ownerDocument.findMany({
          where: { ownerId: owner.id },
          orderBy: { uploadedAt: 'desc' },
        });
        return sendSuccess({ res, data: docs });
      }

      const whereClause: any = {};
      if (companyId) whereClause.companyId = companyId;
      if (requestedOwnerId) whereClause.ownerId = requestedOwnerId;

      const docs = await prisma.ownerDocument.findMany({
        where: whereClause,
        orderBy: { uploadedAt: 'desc' },
      });
      return sendSuccess({ res, data: docs });
    } catch (error) {
      next(error);
    }
  }

  // Get Tenant Documents (Strictly isolated: Tenant only sees their own documents)
  async getTenantDocuments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const userRole = req.user?.roleName;
      const isTenant = userRole === 'Tenant';
      const requestedTenantId = req.query.tenantId as string | undefined;

      if (isTenant && req.user?.email) {
        const tenant = await prisma.tenant.findFirst({
          where: { email: req.user.email },
        });
        if (!tenant) return sendSuccess({ res, data: [] });
        const docs = await prisma.tenantDocument.findMany({
          where: { tenantId: tenant.id },
          orderBy: { uploadedAt: 'desc' },
        });
        return sendSuccess({
          res,
          data: docs.map((d: any) => ({
            ...d,
            tenantName: `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || 'Resident Tenant',
          })),
        });
      }

      const whereClause: any = {};
      if (companyId) {
        whereClause.OR = [{ companyId }, { companyId: null }];
      }
      if (requestedTenantId) {
        whereClause.tenantId = requestedTenantId;
      }

      const docs = await prisma.tenantDocument.findMany({
        where: whereClause,
        orderBy: { uploadedAt: 'desc' },
      });

      const tenantIds = docs.map((d: any) => d.tenantId).filter(Boolean) as string[];
      let tenantMap = new Map<string, string>();
      if (tenantIds.length > 0) {
        const tenants = await prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, firstName: true, lastName: true },
        });
        tenants.forEach((t: any) => {
          tenantMap.set(t.id, `${t.firstName || ''} ${t.lastName || ''}`.trim());
        });
      }

      const enrichedDocs = docs.map((d: any) => ({
        ...d,
        tenantName: d.tenantId && tenantMap.has(d.tenantId) ? tenantMap.get(d.tenantId) : 'Resident Tenant',
      }));

      return sendSuccess({ res, data: enrichedDocs });
    } catch (error) {
      next(error);
    }
  }
}

export const documentController = new DocumentController();
