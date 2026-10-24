"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoiceController = void 0;
const database_1 = __importDefault(require("../config/database"));
const apiResponse_1 = require("../utils/apiResponse");
const billingAutomation_service_1 = require("../services/billingAutomation.service");
const env_1 = require("../config/env");
const notification_helper_1 = require("../services/notification.helper");
class InvoiceController {
    async getAll(req, res, next) {
        try {
            // Auto-generate rent invoices & late fees (catch-up)
            await (0, billingAutomation_service_1.generateAutoInvoices)();
            await (0, billingAutomation_service_1.generateAutoLateFees)();
            const companyId = req.user?.companyId;
            const userRole = req.user?.roleName || req.user?.role;
            const userEmail = req.user?.email;
            let whereClause = companyId ? { companyId } : {};
            if (userRole === 'Tenant' && userEmail) {
                const tenant = await database_1.default.tenant.findFirst({
                    where: { email: userEmail },
                });
                if (tenant) {
                    whereClause = { tenantId: tenant.id };
                }
                else {
                    return (0, apiResponse_1.sendSuccess)({ res, data: [] });
                }
            }
            let invoices = await database_1.default.invoice.findMany({
                where: whereClause,
                include: {
                    tenant: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            const formatted = invoices.map((inv) => ({
                ...inv,
                dueDate: inv.dueDate || '',
                lineItems: (() => {
                    try {
                        return JSON.parse(inv.lineItems);
                    }
                    catch {
                        return [];
                    }
                })(),
            }));
            return (0, apiResponse_1.sendSuccess)({ res, data: formatted });
        }
        catch (error) {
            next(error);
        }
    }
    async create(req, res, next) {
        try {
            const { tenantId, tenantName, propertyId, propertyName, unitNumber, dueDate, amount, paidAmount, balance, status, lineItems, notes, } = req.body;
            const companyId = req.user?.companyId;
            const parsedDueDate = dueDate ? new Date(dueDate) : new Date();
            const invoice = await database_1.default.invoice.create({
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
            return (0, apiResponse_1.sendSuccess)({
                res,
                statusCode: 201,
                data: { ...invoice, lineItems: lineItems || [] },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const id = req.params.id;
            const { status, paidAmount, balance, notes } = req.body;
            const companyId = req.user?.companyId;
            if (companyId) {
                const check = await database_1.default.invoice.findFirst({
                    where: { id, companyId },
                });
                if (!check)
                    throw new Error('Invoice not found.');
            }
            const invoice = await database_1.default.invoice.update({
                where: { id },
                data: {
                    ...(status && { status }),
                    ...(paidAmount !== undefined && { paidAmount: parseFloat(paidAmount) }),
                    ...(balance !== undefined && { balance: parseFloat(balance) }),
                    ...(notes !== undefined && { notes }),
                },
            });
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    ...invoice,
                    lineItems: (() => {
                        try {
                            return JSON.parse(invoice.lineItems);
                        }
                        catch {
                            return [];
                        }
                    })(),
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async remove(req, res, next) {
        try {
            const id = req.params.id;
            const companyId = req.user?.companyId;
            if (companyId) {
                const check = await database_1.default.invoice.findFirst({
                    where: { id, companyId },
                });
                if (!check)
                    throw new Error('Invoice not found.');
            }
            await database_1.default.invoice.delete({ where: { id } });
            return (0, apiResponse_1.sendSuccess)({ res, data: { deleted: true } });
        }
        catch (error) {
            next(error);
        }
    }
    async generateAiReminder(req, res, next) {
        try {
            const id = req.params.id;
            const { tone } = req.body;
            const invoice = await database_1.default.invoice.findUnique({
                where: { id },
                include: { tenant: true },
            });
            if (!invoice)
                throw new Error('Invoice not found.');
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
            }
            catch { }
            let reminderText = '';
            const urgencyLevel = daysOverdue > 10 ? 'Urgent' : (daysOverdue > 3 ? 'Moderate' : 'Friendly');
            if (env_1.env.OPENAI_API_KEY) {
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
                            Authorization: `Bearer ${env_1.env.OPENAI_API_KEY}`,
                        },
                        body: JSON.stringify({
                            model: env_1.env.OPENAI_MODEL || 'gpt-4o',
                            messages: [
                                { role: 'system', content: 'You are an AI assistant for a professional property management platform. Generate high quality, courteous, compliant rent notices.' },
                                { role: 'user', content: prompt },
                            ],
                            temperature: 0.4,
                            max_tokens: 220,
                        }),
                    });
                    if (aiResponse.ok) {
                        const aiJson = await aiResponse.json();
                        reminderText = aiJson.choices?.[0]?.message?.content?.trim() || '';
                    }
                }
                catch (err) {
                    console.warn('[AI Rent Reminder] OpenAI call failed, falling back to rule engine:', err);
                }
            }
            if (!reminderText) {
                if (daysOverdue > 10 || tone === 'urgent') {
                    reminderText = `URGENT NOTICE: Dear ${tenantName}, this is a formal notification that your rent balance of $${balance} for ${propertyName} (Unit ${unitNumber || 'N/A'}) is now ${daysOverdue} days past due (Due Date: ${dueDate}). Please log in to your Tenant Portal immediately to remit payment and avoid additional late penalties. Thank you, Property Management.`;
                }
                else {
                    reminderText = `Friendly Reminder: Hi ${tenantName}, hope you are doing well! This is a gentle reminder that your rent payment of $${balance} for ${propertyName} (Unit ${unitNumber || 'N/A'}) was due on ${dueDate} (${daysOverdue > 0 ? `${daysOverdue} days ago` : 'today'}). Please submit payment through your online tenant portal at your earliest convenience. Thank you! - Property Management`;
                }
            }
            return (0, apiResponse_1.sendSuccess)({
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
        }
        catch (error) {
            next(error);
        }
    }
    async sendAiReminder(req, res, next) {
        try {
            const id = req.params.id;
            const { reminderText, tone } = req.body;
            const invoice = await database_1.default.invoice.findUnique({
                where: { id },
            });
            if (!invoice)
                throw new Error('Invoice not found.');
            const title = tone === 'urgent' ? '🚨 Urgent Rent Notice' : '📢 AI Rent Payment Reminder';
            const notifMsg = reminderText || `Your rent payment of $${invoice.balance} for Unit ${invoice.unitNumber} is past due. Please submit payment via tenant portal.`;
            // 1. Create targeted notification for Tenant
            const notification = await (0, notification_helper_1.createNotification)({
                title,
                message: notifMsg,
                role: 'Tenant',
                type: tone === 'urgent' ? 'warning' : 'info',
                companyId: invoice.companyId,
                targetId: invoice.tenantId,
            });
            // 2. Notify Collection Manager
            await (0, notification_helper_1.createNotification)({
                title: 'Rent Reminder Dispatched',
                message: `Notice sent to tenant for invoice #${invoice.id.slice(0, 6)} ($${invoice.balance})`,
                role: 'Collection Manager',
                companyId: invoice.companyId,
                targetId: invoice.id,
            });
            return (0, apiResponse_1.sendSuccess)({
                res,
                statusCode: 201,
                data: {
                    success: true,
                    notification,
                    message: 'Notice dispatched to Tenant Portal successfully.',
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.invoiceController = new InvoiceController();
