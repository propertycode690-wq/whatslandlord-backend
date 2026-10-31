import { Response, NextFunction } from 'express';
import prisma from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { generateAutoInvoices, generateAutoLateFees } from '../services/billingAutomation.service';
import { env } from '../config/env';
import { createNotification } from '../services/notification.helper';

class InvoiceController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      // Auto-generate rent invoices & late fees (catch-up)
      await generateAutoInvoices();
      await generateAutoLateFees();

      const companyId = req.user?.companyId;
      const userRole = req.user?.roleName || (req.user as any)?.role;
      const userEmail = req.user?.email;

      let whereClause: any = companyId ? { companyId } : {};

      if (userRole === 'Tenant' && userEmail) {
        const tenant = await prisma.tenant.findFirst({
          where: { email: userEmail },
        });
        if (tenant) {
          whereClause = { tenantId: tenant.id, status: { notIn: ['Draft', 'Void', 'Cancelled'] } };
        } else {
          return sendSuccess({ res, data: [] });
        }
      }

      let invoices = await prisma.invoice.findMany({
        where: whereClause,
        include: {
          tenant: {
            include: {
              unit: {
                include: {
                  property: true,
                },
              },
              leases: {
                include: {
                  property: true,
                  unit: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }).catch(async (err) => {
        console.warn('Invoice findMany with include failed, falling back to clean query:', err.message);
        return prisma.invoice.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
        });
      });

      const formatted = invoices.map((inv: any) => {
        let tName = inv.tenantName;
        let pName = inv.propertyName;
        let uNum = inv.unitNumber;
        let pId = inv.propertyId;

        if (inv.tenant) {
          const fullName = `${inv.tenant.firstName || ''} ${inv.tenant.lastName || ''}`.trim();
          if ((!tName || tName === 'Unknown Tenant') && fullName) {
            tName = fullName;
          }
          const prop = inv.tenant.unit?.property || inv.tenant.leases?.[0]?.property;
          const unit = inv.tenant.unit || inv.tenant.leases?.[0]?.unit;
          if ((!pName || pName === 'Unknown Property') && prop?.name) {
            pName = prop.name;
          }
          if ((!pId || pId === 'default') && prop?.id) {
            pId = prop.id;
          }
          if ((!uNum || uNum === '') && unit?.unitNumber) {
            uNum = unit.unitNumber;
          }
        }

        return {
          ...inv,
          tenantName: tName || inv.tenantName || 'Unknown Tenant',
          propertyName: pName || inv.propertyName || 'Unknown Property',
          unitNumber: uNum || inv.unitNumber || '',
          propertyId: pId || inv.propertyId || 'default',
          dueDate: inv.dueDate || '',
          lineItems: (() => {
            try { return JSON.parse(inv.lineItems as string); } catch { return []; }
          })(),
        };
      });

      return sendSuccess({ res, data: formatted });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      let {
        tenantId, tenantName, propertyId, propertyName,
        unitNumber, dueDate, amount, paidAmount, balance,
        status, lineItems, notes,
      } = req.body;
      const companyId = req.user?.companyId;

      if (tenantId && (!tenantName || tenantName === 'Unknown Tenant' || !propertyName || propertyName === 'Unknown Property' || !unitNumber)) {
        try {
          const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            include: {
              unit: {
                include: {
                  property: true,
                },
              },
              leases: {
                include: {
                  property: true,
                  unit: true,
                },
              },
            },
          });

          if (tenant) {
            if (!tenantName || tenantName === 'Unknown Tenant') {
              const fullName = `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim();
              if (fullName) tenantName = fullName;
            }
            const prop = tenant.unit?.property || tenant.leases?.[0]?.property;
            const unit = tenant.unit || tenant.leases?.[0]?.unit;
            if ((!propertyName || propertyName === 'Unknown Property') && prop?.name) {
              propertyName = prop.name;
            }
            if ((!propertyId || propertyId === 'default') && (prop?.id || tenant.unit?.propertyId)) {
              propertyId = prop?.id || tenant.unit?.propertyId || 'default';
            }
            if ((!unitNumber || unitNumber === '') && unit?.unitNumber) {
              unitNumber = unit.unitNumber;
            }
          }
        } catch (lookupErr) {
          console.warn('Tenant lookup during invoice creation warning:', lookupErr);
        }
      }

      const parsedDueDate = dueDate ? new Date(dueDate) : new Date();

      const invoice = await prisma.invoice.create({
        data: {
          tenantId: tenantId || 'default',
          tenantName: tenantName || 'Unknown Tenant',
          propertyId: propertyId || 'default',
          propertyName: propertyName || 'Unknown Property',
          unitNumber: unitNumber || '',
          dueDate: typeof dueDate === 'string' ? dueDate : (isNaN(parsedDueDate.getTime()) ? new Date().toISOString().split('T')[0] : parsedDueDate.toISOString().split('T')[0]),
          amount: parseFloat(amount) || 0,
          paidAmount: parseFloat(paidAmount) || 0,
          balance: parseFloat(balance ?? amount) || 0,
          status: status || 'Draft',
          lineItems: JSON.stringify(lineItems || []),
          notes: notes || null,
          companyId,
        },
      });

      return sendSuccess({
        res,
        statusCode: 201,
        data: { ...invoice, lineItems: lineItems || [] },
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { status, paidAmount, balance, notes } = req.body;
      const companyId = req.user?.companyId;

      if (companyId) {
        const check = await prisma.invoice.findFirst({
          where: { id, companyId },
        });
        if (!check) throw new Error('Invoice not found.');
      }

      const invoice = await prisma.invoice.update({
        where: { id },
        data: {
          ...(status && { status }),
          ...(paidAmount !== undefined && { paidAmount: parseFloat(paidAmount) }),
          ...(balance !== undefined && { balance: parseFloat(balance) }),
          ...(notes !== undefined && { notes }),
        },
      });

      return sendSuccess({
        res,
        data: {
          ...invoice,
          lineItems: (() => {
            try { return JSON.parse(invoice.lineItems as string); } catch { return []; }
          })(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const companyId = req.user?.companyId;

      if (companyId) {
        const check = await prisma.invoice.findFirst({
          where: { id, companyId },
        });
        if (!check) throw new Error('Invoice not found.');
      }

      await prisma.invoice.delete({ where: { id } });
      return sendSuccess({ res, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  }

  async generateAiReminder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { tone } = req.body;
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: { tenant: true },
      });

      if (!invoice) throw new Error('Invoice not found.');

      const tenantName = invoice.tenantName || (invoice.tenant ? `${invoice.tenant.firstName} ${invoice.tenant.lastName}` : 'Resident');
      const propertyName = invoice.propertyName || 'Property';
      const unitNumber = invoice.unitNumber || '';
      const amount = invoice.amount || 0;
      const balance = invoice.balance ?? ((invoice.amount || 0) - (invoice.paidAmount || 0));
      const dueDate = invoice.dueDate || 'due date';

      let daysOverdue = 0;
      try {
        const due = new Date(dueDate);
        const today = new Date();
        const diffTime = today.getTime() - due.getTime();
        daysOverdue = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
      } catch {}

      let reminderText = '';
      const urgencyLevel = daysOverdue > 10 ? 'Urgent' : (daysOverdue > 3 ? 'Moderate' : 'Friendly');

      if (env.OPENAI_API_KEY) {
        try {
          const prompt = `Write a concise, professional property management rent reminder notice for:
Tenant Name: ${tenantName}
Property / Unit: ${propertyName} ${unitNumber ? `Unit ${unitNumber}` : ''}
Outstanding Balance: $${balance}
Due Date: ${dueDate}
Days Overdue: ${daysOverdue} days
Tone: ${tone || (daysOverdue > 10 ? 'firm and urgent but professional' : 'courteous friendly reminder')}

Keep the message under 80 words. Include clear call to action to pay via tenant portal. Sign off as Property Management.`;

          const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: env.OPENAI_MODEL || 'gpt-4o',
              messages: [
                { role: 'system', content: 'You are an AI assistant for a professional property management platform. Generate high quality, courteous, compliant rent notices.' },
                { role: 'user', content: prompt },
              ],
              temperature: 0.4,
              max_tokens: 220,
            }),
          });

          if (aiResponse.ok) {
            const aiJson: any = await aiResponse.json();
            reminderText = aiJson.choices?.[0]?.message?.content?.trim() || '';
          }
        } catch (err) {
          console.warn('[AI Rent Reminder] OpenAI call failed, falling back to rule engine:', err);
        }
      }

      if (!reminderText) {
        if (daysOverdue > 10 || tone === 'urgent') {
          reminderText = `URGENT NOTICE: Dear ${tenantName}, this is a formal notification that your rent balance of $${balance} for ${propertyName} (Unit ${unitNumber || 'N/A'}) is now ${daysOverdue} days past due (Due Date: ${dueDate}). Please log in to your Tenant Portal immediately to remit payment and avoid additional late penalties. Thank you, Property Management.`;
        } else {
          reminderText = `Friendly Reminder: Hi ${tenantName}, hope you are doing well! This is a gentle reminder that your rent payment of $${balance} for ${propertyName} (Unit ${unitNumber || 'N/A'}) was due on ${dueDate} (${daysOverdue > 0 ? `${daysOverdue} days ago` : 'today'}). Please submit payment through your online tenant portal at your earliest convenience. Thank you! - Property Management`;
        }
      }

      return sendSuccess({
        res,
        data: {
          reminderText,
          urgencyLevel,
          tenantName,
          propertyName,
          unitNumber,
          amount,
          balance,
          dueDate,
          daysOverdue,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async sendAiReminder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { reminderText, tone } = req.body;
      const invoice = await prisma.invoice.findUnique({
        where: { id },
      });

      if (!invoice) throw new Error('Invoice not found.');

      const title = tone === 'urgent' ? '🚨 Urgent Rent Notice' : '📢 AI Rent Payment Reminder';
      const notifMsg = reminderText || `Your rent payment of $${invoice.balance} for Unit ${invoice.unitNumber} is past due. Please submit payment via tenant portal.`;

      // 1. Create targeted notification for Tenant
      const notification = await createNotification({
        title,
        message: notifMsg,
        role: 'Tenant',
        type: tone === 'urgent' ? 'warning' : 'info',
        companyId: invoice.companyId,
        targetId: invoice.tenantId,
      });

      // 2. Notify Collection Manager
      await createNotification({
        title: 'Rent Reminder Dispatched',
        message: `Notice sent to tenant for invoice #${invoice.id.slice(0, 6)} ($${invoice.balance})`,
        role: 'Collection Manager',
        companyId: invoice.companyId,
        targetId: invoice.id,
      });

      return sendSuccess({
        res,
        statusCode: 201,
        data: {
          success: true,
          notification,
          message: 'Notice dispatched to Tenant Portal successfully.',
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const invoiceController = new InvoiceController();
