import { Response, NextFunction } from 'express';
import { paymentService } from '../services/payment.service';
import { sendSuccess } from '../utils/apiResponse';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { AppError } from '../utils/appError';
import prisma from '../config/database';

export class PaymentController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const payments = await paymentService.getAllPayments(companyId, req.user);
      return sendSuccess({ res, data: payments });
    } catch (error) {
      next(error);
    }
  }

  async processPayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const { tenantId, propertyId, unitId, leaseId, invoiceId } = req.body;

      if (companyId) {
        if (tenantId) {
          const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, companyId } });
          if (!tenant) throw new AppError('Tenant not found.', 404, 'NOT_FOUND');
        }
        if (propertyId) {
          const prop = await prisma.property.findFirst({ where: { id: propertyId, companyId } });
          if (!prop) throw new AppError('Property not found.', 404, 'NOT_FOUND');
        }
        if (unitId) {
          const unit = await prisma.unit.findFirst({ where: { id: unitId, property: { companyId } } });
          if (!unit) throw new AppError('Unit not found.', 404, 'NOT_FOUND');
        }
        if (leaseId) {
          const lease = await prisma.lease.findFirst({ where: { id: leaseId, companyId } });
          if (!lease) throw new AppError('Lease not found.', 404, 'NOT_FOUND');
        }
        if (invoiceId) {
          const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId } });
          if (!invoice) throw new AppError('Invoice not found.', 404, 'NOT_FOUND');
        }
      }

      const payment = await paymentService.processPayment({
        ...req.body,
        companyId,
        userEmail: req.user?.email,
        userRole: req.user?.roleName || (req.user as any)?.role,
      });
      return sendSuccess({ res, statusCode: 201, data: payment });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const id = req.params.id as string;
      const payment = await paymentService.getPaymentById(id, companyId);
      return sendSuccess({ res, data: payment });
    } catch (error) {
      next(error);
    }
  }

  async updatePayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const id = req.params.id as string;
      const updatedPayment = await paymentService.updatePayment(id, req.body, companyId);
      return sendSuccess({ res, data: updatedPayment });
    } catch (error) {
      next(error);
    }
  }

  async getActiveGateway(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const propertyId = req.query.propertyId as string | undefined;
      const gateway = await paymentService.getActiveGateway(companyId, propertyId, req.user);
      return sendSuccess({ res, data: gateway });
    } catch (error) {
      next(error);
    }
  }

  async createRazorpayOrder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const { amount, currency, propertyId } = req.body;
      const order = await paymentService.createRazorpayOrder(Number(amount), currency || 'USD', companyId, propertyId);
      return sendSuccess({ res, data: order });
    } catch (error) {
      next(error);
    }
  }

  async verifyRazorpayPayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const { razorpayOrderId, razorpayPaymentId, razorpaySignature, amount, propertyId } = req.body;
      const result = await paymentService.verifyRazorpayPayment({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        amount: Number(amount),
        companyId,
        propertyId,
        userEmail: req.user?.email,
        userRole: req.user?.roleName || (req.user as any)?.role,
      });
      return sendSuccess({ res, data: result });
    } catch (error) {
      next(error);
    }
  }

  async deletePayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const id = req.params.id as string;
      const result = await paymentService.deletePayment(id, companyId);
      return sendSuccess({ res, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const paymentController = new PaymentController();
