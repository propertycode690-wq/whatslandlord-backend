import { Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import bcrypt from 'bcrypt';
import { getManagerCompanyId } from '../utils/companyHelper.js';
import { AppError } from '../utils/appError.js';
import { ensureRole } from '../utils/roleHelper.js';

export class OwnerController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      if (!companyId && req.user?.roleName !== 'SuperAdmin' && (req.user as any)?.role !== 'SuperAdmin') {
        return sendSuccess({ res, data: [] });
      }
      const owners = await prisma.owner.findMany({
        where: companyId ? { companyId } : {},
        include: {
          properties: true,
        },
      });
      return sendSuccess({ res, data: owners });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name, firstName, lastName, email, phone, payoutMethod, password, propertiesOwned } = req.body;
      const resolvedName = name || `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown';
      const companyId = await getManagerCompanyId(req, req.body.companyId || req.user?.companyId);

      if (email) {
        const normEmail = email.trim().toLowerCase();
        const existingOwner = await prisma.owner.findFirst({ where: { email: normEmail } });
        if (existingOwner) {
          throw new AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL');
        }

        const existingUser = await prisma.user.findFirst({ where: { email: normEmail } });
        if (existingUser) {
          const activeCompany = await prisma.company.findFirst({ where: { email: normEmail } });
          const activeTenant = await prisma.tenant.findFirst({ where: { email: normEmail } });
          if (activeCompany || activeTenant) {
            throw new AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL');
          } else {
            // Remove orphaned user record to allow fresh owner creation
            await prisma.user.deleteMany({ where: { email: normEmail } });
          }
        }
      }

      const owner = await prisma.owner.create({
        data: {
          name: resolvedName,
          email,
          phone,
          payoutMethod: payoutMethod || 'ACH/Direct Deposit',
          companyId,
        },
      });

      if (Array.isArray(propertiesOwned) && propertiesOwned.length > 0) {
        await prisma.property.updateMany({
          where: { id: { in: propertiesOwned } },
          data: { ownerId: owner.id },
        });
      }

      if (password) {
        const role = await ensureRole('Owner');
        const passwordHash = await bcrypt.hash(password, 12);
        const [first = '', ...lastParts] = resolvedName.split(' ');
        const last = lastParts.join(' ') || 'Owner';
        await prisma.user.create({
          data: {
            email,
            passwordHash,
            firstName: first || 'Owner',
            lastName: last,
            phone: phone || null,
            roleId: role.id,
            companyId,
          },
        });
      }

      return sendSuccess({ res, statusCode: 201, data: owner });
    } catch (error: any) {
      if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
        return next(new AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL'));
      }
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { name, firstName, lastName, email, phone, payoutMethod, password, propertiesOwned } = req.body;
      const resolvedName = name || `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown';
      const companyId = req.user?.companyId;

      const oldOwner = await prisma.owner.findUnique({
        where: { id },
      });

      const owner = await prisma.owner.update({
        where: companyId ? { id, companyId } : { id },
        data: {
          name: resolvedName,
          email,
          phone,
          payoutMethod,
        },
      });

      if (Array.isArray(propertiesOwned)) {
        if (propertiesOwned.length > 0) {
          await prisma.property.updateMany({
            where: { id: { in: propertiesOwned } },
            data: { ownerId: owner.id },
          });
        }
      }

      if (password && oldOwner) {
        const passwordHash = await bcrypt.hash(password, 12);
        const [first = '', ...lastParts] = resolvedName.split(' ');
        const last = lastParts.join(' ') || 'Owner';

        const existingUser = await prisma.user.findFirst({
          where: { email: oldOwner.email },
        });

        if (existingUser) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              email,
              passwordHash,
              firstName: first || 'Owner',
              lastName: last,
              phone,
            },
          });
        } else {
          const role = await ensureRole('Owner');
          await prisma.user.create({
            data: {
              email,
              passwordHash,
              firstName: first || 'Owner',
              lastName: last,
              phone: phone || null,
              roleId: role.id,
              companyId,
            },
          });
        }
      }

      return sendSuccess({ res, data: owner });
    } catch (error: any) {
      if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
        return next(new AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL'));
      }
      next(error);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const companyId = req.user?.companyId;

      const ownerExists = await prisma.owner.findFirst({
        where: companyId ? { id, companyId } : { id },
      });
      if (!ownerExists) {
        return res.status(404).json({ success: false, error: 'Owner not found' });
      }

      await prisma.$transaction(
        async (tx) => {
          // 1. Delete associated owner distributions
          await tx.ownerDistribution.deleteMany({
            where: { ownerId: id },
          });

          // 2. Delete associated owner documents
          await tx.ownerDocument.deleteMany({
            where: { ownerId: id },
          });

          // 3. Find properties owned by this owner
          const properties = await tx.property.findMany({
            where: { ownerId: id },
            select: { id: true },
          });

          for (const prop of properties) {
            const propertyId = prop.id;

            // Delete rent payments linked to property
            await tx.rentPayment.deleteMany({
              where: { propertyId },
            });

            // Find leases linked to property and clean up MoveIn / MoveOut / Leases
            const leases = await tx.lease.findMany({
              where: { propertyId },
              select: { id: true },
            });
            const leaseIds = leases.map((l) => l.id);
            if (leaseIds.length > 0) {
              await tx.moveIn.deleteMany({
                where: { leaseId: { in: leaseIds } },
              });
              await tx.moveOut.deleteMany({
                where: { leaseId: { in: leaseIds } },
              });
              await tx.lease.deleteMany({
                where: { propertyId },
              });
            }

            // Delete work orders linked to property
            await tx.workOrder.deleteMany({
              where: { propertyId },
            });

            // Delete service requests linked to property
            await tx.serviceRequest.deleteMany({
              where: { propertyId },
            });

            // Delete tenant documents linked to property
            await tx.tenantDocument.deleteMany({
              where: { propertyId },
            });

            // Delete owner documents linked to property
            await tx.ownerDocument.deleteMany({
              where: { propertyId },
            });

            // Delete units and buildings
            await tx.unit.deleteMany({
              where: { propertyId },
            });
            await tx.building.deleteMany({
              where: { propertyId },
            });

            // Delete property
            await tx.property.delete({
              where: { id: propertyId },
            });
          }

          // 3.5 Delete associated user record safely
          if (ownerExists.email) {
            const normEmail = ownerExists.email.trim().toLowerCase();
            const users = await tx.user.findMany({ where: { email: normEmail }, select: { id: true } });
            const userIds = users.map(u => u.id);
            if (userIds.length > 0) {
              await tx.auditLog.updateMany({
                where: { userId: { in: userIds } },
                data: { userId: null }
              });
              await tx.user.deleteMany({
                where: { email: normEmail },
              });
            }
          }

          // 4. Finally delete the owner record
          await tx.owner.delete({
            where: { id },
          });
        },
        { maxWait: 10000, timeout: 30000 }
      );

      return sendSuccess({ res, message: 'Owner deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export const ownerController = new OwnerController();
