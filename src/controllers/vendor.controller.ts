import { Response, NextFunction } from 'express';
import prisma from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import bcrypt from 'bcrypt';
import { getManagerCompanyId } from '../utils/companyHelper';
import { AppError } from '../utils/appError';
import { ensureRole } from '../utils/roleHelper';

export class VendorController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const vendors = await prisma.vendor.findMany({
        where: companyId ? { companyId } : {},
        include: {
          workOrders: true,
        },
      });

      // Fetch matching login users to attach their status
      const emails = vendors.map((v) => v.email).filter(Boolean);
      const matchedUsers = await prisma.user.findMany({
        where: {
          email: { in: emails },
          companyId: companyId || undefined,
        },
      });

      const vendorsWithStatus = vendors.map((v) => {
        const userRec = matchedUsers.find((u) => u.email === v.email);
        return {
          ...v,
          status: userRec ? userRec.status : 'Active',
        };
      });

      return sendSuccess({ res, data: vendorsWithStatus });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { companyName, contactName, email, phone, serviceType, rating, password } = req.body;
      const companyId = await getManagerCompanyId(req, req.body.companyId || req.user?.companyId);
      if (email) {
        const normEmail = email.trim().toLowerCase();
        const existingVendor = await prisma.vendor.findFirst({ where: { email: normEmail } });
        if (existingVendor) {
          throw new AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL');
        }

        const existingUser = await prisma.user.findFirst({ where: { email: normEmail } });
        if (existingUser) {
          const activeCompany = await prisma.company.findFirst({ where: { email: normEmail } });
          const activeOwner = await prisma.owner.findFirst({ where: { email: normEmail } });
          const activeTenant = await prisma.tenant.findFirst({ where: { email: normEmail } });
          if (activeCompany || activeOwner || activeTenant) {
            throw new AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL');
          } else {
            // Clean up orphaned user/companyUser records
            await prisma.user.deleteMany({ where: { email: normEmail } });
            await prisma.companyUser.deleteMany({ where: { email: normEmail } });
          }
        }
      }

      const vendor = await prisma.vendor.create({
        data: {
          companyName,
          contactName,
          email,
          phone,
          serviceType,
          rating: rating || 5.0,
          companyId,
        },
      });

      // Automatically create matching login user for this vendor (Maintenance Staff role)
      if (email) {
        const roleObj = await ensureRole('Maintenance Staff');

        if (roleObj) {
          const passwordHash = await bcrypt.hash(password || 'vendor123', 12);
          const nameParts = (contactName || companyName || 'Vendor').trim().split(/\s+/);
          const firstName = nameParts[0] || 'Vendor';
          const lastName = nameParts.slice(1).join(' ') || 'Partner';

          await prisma.user.create({
            data: {
              email,
              passwordHash,
              firstName,
              lastName,
              phone: phone || '',
              roleId: roleObj.id,
              companyId,
            },
          });
        }
      }
      return sendSuccess({ res, statusCode: 201, data: vendor });
    } catch (error: any) {
      if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
        return next(new AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL'));
      }
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyName = req.body.companyName || req.body.name;
      const contactName = req.body.contactName || req.body.primaryContact || req.body.contact;
      const serviceType = req.body.serviceType || req.body.category;
      const { email, phone, rating, status } = req.body;
      const id = req.params.id as string;
      const companyId = req.user?.companyId;

      const check = await prisma.vendor.findFirst({
        where: companyId ? { id, companyId } : { id },
      });
      if (!check) throw new AppError('Vendor not found.', 404);

      const vendor = await prisma.vendor.update({
        where: { id },
        data: {
          ...(companyName ? { companyName } : {}),
          ...(contactName ? { contactName } : {}),
          ...(email ? { email: email.trim().toLowerCase() } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(serviceType ? { serviceType } : {}),
          ...(rating !== undefined ? { rating: Number(rating) } : {}),
        },
      });

      // Update matching user if email/contact changed
      if (check.email) {
        await prisma.user.updateMany({
          where: { email: check.email, ...(companyId ? { companyId } : {}) },
          data: {
            ...(email ? { email: email.trim().toLowerCase() } : {}),
            ...(phone !== undefined ? { phone } : {}),
            ...(status ? { status } : {}),
          },
        }).catch(() => {});
      }

      return sendSuccess({ res, data: vendor });
    } catch (error: any) {
      if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
        return next(new AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL'));
      }
      next(error);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const companyId = req.user?.companyId;

      const vendor = await prisma.vendor.findFirst({
        where: companyId ? { id, companyId } : { id },
      });
      if (!vendor) throw new Error('Vendor not found.');

      if (vendor.email) {
        const normEmail = vendor.email.trim().toLowerCase();
        const users = await prisma.user.findMany({ where: { email: normEmail }, select: { id: true } });
        const userIds = users.map(u => u.id);
        if (userIds.length > 0) {
          await prisma.auditLog.updateMany({
            where: { userId: { in: userIds } },
            data: { userId: null }
          });
          await prisma.user.deleteMany({
            where: { email: normEmail },
          });
        }
        await prisma.companyUser.deleteMany({
          where: { email: normEmail },
        });
      }

      await prisma.vendor.delete({
        where: { id },
      });
      return sendSuccess({ res, data: { success: true } });
    } catch (error) {
      next(error);
    }
  }
}

export const vendorController = new VendorController();
