import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { superAdminService } from '../services/superadmin.service';
import { authorizeNetService } from '../services/authorizeNet.service';
import { sendSuccess } from '../utils/apiResponse';
import prisma from '../config/database';
import { AppError } from '../utils/appError';
import { ensureRole } from '../utils/roleHelper';
import bcrypt from 'bcrypt';

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      return sendSuccess({ res, data: result, message: 'Authentication successful.' });
    } catch (error) {
      next(error);
    }
  }

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await superAdminService.createCompany(req.body);
      return sendSuccess({ res, statusCode: 201, data: result, message: 'Registration successful.' });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refreshToken(refreshToken);
      return sendSuccess({ res, data: result });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: any, res: Response, next: NextFunction) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userEmail = req.user?.email;
      const result = await authService.changePassword(userEmail, currentPassword, newPassword);
      return sendSuccess({ res, data: result, message: 'Password changed successfully.' });
    } catch (error) {
      next(error);
    }
  }

  async getPublicPlans(req: Request, res: Response, next: NextFunction) {
    try {
      const plans = await superAdminService.getPlans();
      return sendSuccess({ res, data: plans });
    } catch (error) {
      next(error);
    }
  }

  async createHostedPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { amount, planName, description, email } = req.body;
      if (email && typeof email === 'string' && email.trim().length > 0) {
        const normalizedEmail = email.trim().toLowerCase();
        const existingCompany = await prisma.company.findFirst({ where: { email: normalizedEmail } });
        if (existingCompany) {
          throw new AppError('Email address is already registered with a company. Please sign in instead.', 400, 'DUPLICATE_EMAIL');
        }
        const existingUser = await prisma.user.findFirst({ where: { email: normalizedEmail } });
        if (existingUser && existingUser.companyId) {
          const userCompany = await prisma.company.findUnique({ where: { id: existingUser.companyId } });
          if (userCompany) {
            throw new AppError('Email address is already registered with a company. Please sign in instead.', 400, 'DUPLICATE_EMAIL');
          }
        }
      }

      const result = await authorizeNetService.getHostedPaymentToken({
        amount: Number(amount) || 99,
        planName: planName || 'Subscription Plan',
        description: description || `SaaS Subscription Plan: ${planName}`,
      });
      return sendSuccess({ res, data: result, message: 'Hosted payment token generated successfully.' });
    } catch (error) {
      next(error);
    }
  }

  async getPublicProperties(req: Request, res: Response, next: NextFunction) {
    try {
      const properties = await prisma.property.findMany({
        select: {
          id: true,
          name: true,
          companyId: true,
          address: true,
          imageUrl: true,
          owner: {
            select: {
              name: true,
            },
          },
          units: {
            where: {
              status: {
                in: ['Vacant', 'Vacant_Needs_Preparation'],
              },
            },
            select: {
              id: true,
              unitNumber: true,
              rentAmount: true,
              status: true,
              bedrooms: true,
              bathrooms: true,
            },
          },
        },
      });
      return sendSuccess({ res, data: properties });
    } catch (error) {
      next(error);
    }
  }

  async tenantSignup(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        firstName,
        lastName,
        email,
        phone,
        password,
        companyId,
        property,
        unitId,
        unitNumber,
        dob,
        nationality,
        idType,
        idNumber,
        emergencyName,
        emergencyRelationship,
        emergencyPhone,
        employer,
        position,
        monthlyIncome,
        employmentStatus,
        currentAddress,
        budget,
        moveInDate,
        notes,
        priority,
      } = req.body;

      if (!firstName || !lastName || !email || !phone || !password || !companyId) {
        throw new AppError('Required parameters are missing (name, email, phone, password, and companyId are required).', 400, 'BAD_REQUEST');
      }

      const result = await prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({ where: { email } });
        if (existingUser) {
          throw new AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL');
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const role = await ensureRole('Tenant');

        const tenant = await tx.tenant.create({
          data: {
            firstName,
            lastName,
            email,
            phone,
            unitId: unitId || null,
            status: 'Pending',
            companyId,
            dob: dob || null,
            nationality: nationality || null,
            idType: idType || null,
            idNumber: idNumber || null,
            emergencyName: emergencyName || null,
            emergencyRelationship: emergencyRelationship || null,
            emergencyPhone: emergencyPhone || null,
            employer: employer || null,
            position: position || null,
            monthlyIncome: monthlyIncome ? Number(monthlyIncome) : null,
            employmentStatus: employmentStatus || null,
            currentAddress: currentAddress || null,
          },
        });

        await tx.user.create({
          data: {
            email,
            passwordHash,
            firstName,
            lastName,
            phone: phone || null,
            roleId: role.id,
            companyId,
            status: 'Active',
          },
        });

        const resolvedName = [firstName, lastName].filter(Boolean).join(' ') || 'Unnamed Lead';
        const unitDetail = unitNumber ? `Unit: ${unitNumber}` : '';
        const combinedNotes = [unitDetail, notes].filter(Boolean).join(' | ');

        const lead = await tx.crmLead.create({
          data: {
            name: resolvedName,
            email,
            phone,
            source: 'Portal',
            status: 'New',
            budget: budget ? Number(budget) : null,
            moveInDate: moveInDate || null,
            priority: priority || 'Medium',
            notes: combinedNotes || null,
            property: property ? (unitNumber ? `${property} · Unit ${unitNumber}` : property) : null,
            companyId,
          },
        });

        return { tenant, lead };
      });

      return sendSuccess({ res, statusCode: 201, data: result, message: 'Tenant signup and application submitted successfully.' });
    } catch (error) {
      next(error);
    }
  }

  async checkEmailAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;
      if (!email) {
        throw new AppError('Email is required', 400, 'BAD_REQUEST');
      }

      const emailLower = email.toLowerCase();

      const existingUser = await prisma.user.findFirst({
        where: { email: emailLower },
      });

      const existingTenant = await prisma.tenant.findFirst({
        where: { email: emailLower },
      });

      const exists = !!(existingUser || existingTenant);

      return sendSuccess({
        res,
        data: { exists },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();


