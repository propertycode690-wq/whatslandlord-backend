"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantController = exports.TenantController = void 0;
const database_js_1 = __importDefault(require("../config/database.js"));
const apiResponse_js_1 = require("../utils/apiResponse.js");
const appError_js_1 = require("../utils/appError.js");
const bcrypt_1 = __importDefault(require("bcrypt"));
const cloudinary_js_1 = __importDefault(require("../config/cloudinary.js"));
const companyHelper_js_1 = require("../utils/companyHelper.js");
const roleHelper_js_1 = require("../utils/roleHelper.js");
const email_service_1 = require("../services/email.service");
class TenantController {
    async getAll(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            if (!companyId && req.user?.roleName !== 'SuperAdmin' && req.user?.role !== 'SuperAdmin') {
                return (0, apiResponse_js_1.sendSuccess)({ res, data: [] });
            }
            const tenants = await database_js_1.default.tenant.findMany({
                where: {
                    ...(companyId ? { companyId } : {}),
                    status: { not: 'Inactive' },
                },
                include: {
                    unit: {
                        include: {
                            property: true,
                        },
                    },
                    screeningReports: true,
                    invoices: true,
                },
            });
            // Reconcile invoices with rentPayment records so accurate balance is returned
            const payments = await database_js_1.default.rentPayment.findMany({
                where: {
                    ...(companyId ? { companyId } : {}),
                    status: { in: ['Paid', 'PartiallyPaid'] },
                },
            });
            const reconciledTenants = tenants.map((tenant) => {
                const tenantPayments = payments.filter((p) => {
                    if (p.tenantId && p.tenantId === tenant.id)
                        return true;
                    if (tenant.unitId && p.unitId === tenant.unitId)
                        return true;
                    return false;
                });
                const reconciledInvoices = (tenant.invoices || []).map((inv) => {
                    const invMonth = String(inv.dueDate || '').slice(0, 7);
                    const matchedPayments = tenantPayments.filter((p) => {
                        if (p.invoiceId && p.invoiceId === inv.id)
                            return true;
                        const pMonth = String(p.dueDate || p.paidDate || '').slice(0, 7);
                        return pMonth && pMonth === invMonth;
                    });
                    const actualPaid = matchedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
                    const actualBalance = Math.max(0, Number(inv.amount || 0) - actualPaid);
                    const newStatus = actualBalance === 0 ? 'Paid' : (actualPaid > 0 ? 'Partially Paid' : inv.status);
                    return {
                        ...inv,
                        paidAmount: actualPaid > 0 ? actualPaid : inv.paidAmount,
                        balance: actualBalance,
                        status: newStatus,
                    };
                });
                return {
                    ...tenant,
                    invoices: reconciledInvoices,
                };
            });
            return (0, apiResponse_js_1.sendSuccess)({ res, data: reconciledTenants });
        }
        catch (error) {
            next(error);
        }
    }
    async create(req, res, next) {
        try {
            const { firstName, lastName, email, phone, unitId, status, password, dob, nationality, idType, idNumber, emergencyName, emergencyRelationship, emergencyPhone, employer, position, monthlyIncome, employmentStatus, currentAddress, preferredName, altPhone, moveInDate, invoiceStartDate, gender, previousBalance, openingBalance, } = req.body;
            const companyId = await (0, companyHelper_js_1.getManagerCompanyId)(req, req.body.companyId || req.user?.companyId);
            const file = req.file;
            let imageUrl = null;
            if (file) {
                try {
                    imageUrl = await new Promise((resolve, reject) => {
                        const uploadStream = cloudinary_js_1.default.uploader.upload_stream({ folder: 'talent' }, (error, result) => {
                            if (error)
                                return reject(error);
                            resolve(result?.secure_url || '');
                        });
                        uploadStream.end(file.buffer);
                    });
                }
                catch (err) {
                    console.error('Cloudinary tenant photo upload failed:', err);
                }
            }
            if (email) {
                const normEmail = email.trim().toLowerCase();
                const existingTenant = await database_js_1.default.tenant.findFirst({ where: { email: normEmail } });
                if (existingTenant) {
                    const updatedTenant = await database_js_1.default.tenant.update({
                        where: { id: existingTenant.id },
                        data: {
                            unitId: unitId || existingTenant.unitId,
                            firstName: firstName || existingTenant.firstName,
                            lastName: lastName || existingTenant.lastName,
                            phone: phone || existingTenant.phone,
                            status: 'Active',
                            dob: dob || existingTenant.dob,
                            nationality: nationality || existingTenant.nationality,
                            idType: idType || existingTenant.idType,
                            idNumber: idNumber || existingTenant.idNumber,
                            emergencyName: emergencyName || existingTenant.emergencyName,
                            emergencyRelationship: emergencyRelationship || existingTenant.emergencyRelationship,
                            emergencyPhone: emergencyPhone || existingTenant.emergencyPhone,
                            employer: employer || existingTenant.employer,
                            position: position || existingTenant.position,
                            monthlyIncome: monthlyIncome ? Number(monthlyIncome) : existingTenant.monthlyIncome,
                            employmentStatus: employmentStatus || existingTenant.employmentStatus,
                            currentAddress: currentAddress || existingTenant.currentAddress,
                            preferredName: preferredName || existingTenant.preferredName,
                            altPhone: altPhone || existingTenant.altPhone,
                            moveInDate: moveInDate || existingTenant.moveInDate,
                            invoiceStartDate: invoiceStartDate || existingTenant.invoiceStartDate,
                            gender: gender || existingTenant.gender,
                            previousBalance: previousBalance !== undefined ? (previousBalance ? Number(previousBalance) : 0) : existingTenant.previousBalance,
                            openingBalance: openingBalance !== undefined ? (openingBalance ? Number(openingBalance) : 0) : existingTenant.openingBalance,
                        },
                    });
                    return (0, apiResponse_js_1.sendSuccess)({ res, statusCode: 200, data: updatedTenant });
                }
                const existingUser = await database_js_1.default.user.findFirst({ where: { email: normEmail } });
                if (existingUser) {
                    const activeCompany = await database_js_1.default.company.findFirst({ where: { email: normEmail } });
                    const activeOwner = await database_js_1.default.owner.findFirst({ where: { email: normEmail } });
                    if (activeCompany || activeOwner) {
                        throw new appError_js_1.AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL');
                    }
                    else {
                        // Remove orphaned user record to allow fresh tenant creation
                        await database_js_1.default.user.deleteMany({ where: { email: normEmail } });
                    }
                }
            }
            if (unitId && companyId) {
                const unit = await database_js_1.default.unit.findFirst({
                    where: { id: unitId, property: { companyId } },
                });
                if (!unit) {
                    throw new appError_js_1.AppError('Unit not found.', 404, 'NOT_FOUND');
                }
            }
            const tenant = await database_js_1.default.tenant.create({
                data: {
                    firstName,
                    lastName,
                    email,
                    phone,
                    unitId,
                    status: status || 'Pending',
                    imageUrl,
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
                    preferredName: preferredName || null,
                    altPhone: altPhone || null,
                    moveInDate: moveInDate || null,
                    invoiceStartDate: invoiceStartDate || null,
                    gender: gender || null,
                    previousBalance: previousBalance !== undefined && previousBalance !== '' ? Number(previousBalance) : 0,
                    openingBalance: openingBalance !== undefined && openingBalance !== '' ? Number(openingBalance) : (previousBalance !== undefined && previousBalance !== '' ? Number(previousBalance) : 0),
                },
            });
            if (password) {
                const role = await (0, roleHelper_js_1.ensureRole)('Tenant');
                const passwordHash = await bcrypt_1.default.hash(password, 12);
                await database_js_1.default.user.create({
                    data: {
                        email,
                        passwordHash,
                        firstName: firstName || 'Tenant',
                        lastName: lastName || 'User',
                        phone: phone || null,
                        roleId: role.id,
                        companyId,
                    },
                });
            }
            if (companyId && email) {
                email_service_1.emailService.sendTenantWelcomeEmail(companyId, tenant, password).catch((err) => {
                    console.error('[Tenant Registration Email Trigger] Error:', err);
                });
            }
            return (0, apiResponse_js_1.sendSuccess)({ res, statusCode: 201, data: tenant });
        }
        catch (error) {
            if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
                return next(new appError_js_1.AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL'));
            }
            next(error);
        }
    }
    async getById(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const tenant = await database_js_1.default.tenant.findFirst({
                where: companyId ? { id: req.params.id, companyId } : { id: req.params.id },
                include: {
                    unit: {
                        include: {
                            property: true,
                        },
                    },
                    leases: true,
                    invoices: true,
                },
            });
            if (!tenant)
                throw new appError_js_1.AppError('Tenant not found.', 404, 'NOT_FOUND');
            // Reconcile invoices with rentPayment records for accurate balance
            const tenantPayments = await database_js_1.default.rentPayment.findMany({
                where: {
                    OR: [
                        { tenantId: tenant.id },
                        ...(tenant.unitId ? [{ unitId: tenant.unitId }] : []),
                    ],
                    status: { in: ['Paid', 'PartiallyPaid'] },
                },
            });
            const reconciledInvoices = (tenant.invoices || []).map((inv) => {
                const invMonth = String(inv.dueDate || '').slice(0, 7);
                const matchedPayments = tenantPayments.filter((p) => {
                    if (p.invoiceId && p.invoiceId === inv.id)
                        return true;
                    const pMonth = String(p.dueDate || p.paidDate || '').slice(0, 7);
                    return pMonth && pMonth === invMonth;
                });
                const actualPaid = matchedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
                const actualBalance = Math.max(0, Number(inv.amount || 0) - actualPaid);
                const newStatus = actualBalance === 0 ? 'Paid' : (actualPaid > 0 ? 'Partially Paid' : inv.status);
                return {
                    ...inv,
                    paidAmount: actualPaid > 0 ? actualPaid : inv.paidAmount,
                    balance: actualBalance,
                    status: newStatus,
                };
            });
            return (0, apiResponse_js_1.sendSuccess)({
                res,
                data: {
                    ...tenant,
                    invoices: reconciledInvoices,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const { firstName, lastName, email, phone, unitId, status, password, dob, nationality, idType, idNumber, emergencyName, emergencyRelationship, emergencyPhone, employer, position, monthlyIncome, employmentStatus, currentAddress, preferredName, altPhone, moveInDate, invoiceStartDate, gender, previousBalance, openingBalance, } = req.body;
            const companyId = req.user?.companyId;
            const id = req.params.id;
            const file = req.file;
            const oldTenant = await database_js_1.default.tenant.findFirst({
                where: companyId ? { id, companyId } : { id },
            });
            if (!oldTenant)
                throw new appError_js_1.AppError('Tenant not found.', 404, 'NOT_FOUND');
            if (unitId && companyId) {
                const unit = await database_js_1.default.unit.findFirst({
                    where: { id: unitId, property: { companyId } },
                });
                if (!unit) {
                    throw new appError_js_1.AppError('Unit not found.', 404, 'NOT_FOUND');
                }
            }
            let imageUrl = oldTenant.imageUrl;
            if (file) {
                try {
                    imageUrl = await new Promise((resolve, reject) => {
                        const uploadStream = cloudinary_js_1.default.uploader.upload_stream({ folder: 'talent' }, (error, result) => {
                            if (error)
                                return reject(error);
                            resolve(result?.secure_url || '');
                        });
                        uploadStream.end(file.buffer);
                    });
                }
                catch (err) {
                    console.error('Cloudinary tenant photo upload failed:', err);
                }
            }
            const tenant = await database_js_1.default.tenant.update({
                where: { id },
                data: {
                    firstName,
                    lastName,
                    email,
                    phone,
                    unitId,
                    status,
                    imageUrl,
                    dob: dob !== undefined ? dob : undefined,
                    nationality: nationality !== undefined ? nationality : undefined,
                    idType: idType !== undefined ? idType : undefined,
                    idNumber: idNumber !== undefined ? idNumber : undefined,
                    emergencyName: emergencyName !== undefined ? emergencyName : undefined,
                    emergencyRelationship: emergencyRelationship !== undefined ? emergencyRelationship : undefined,
                    emergencyPhone: emergencyPhone !== undefined ? emergencyPhone : undefined,
                    employer: employer !== undefined ? employer : undefined,
                    position: position !== undefined ? position : undefined,
                    monthlyIncome: monthlyIncome !== undefined ? (monthlyIncome ? Number(monthlyIncome) : null) : undefined,
                    employmentStatus: employmentStatus !== undefined ? employmentStatus : undefined,
                    currentAddress: currentAddress !== undefined ? currentAddress : undefined,
                    preferredName: preferredName !== undefined ? preferredName : undefined,
                    altPhone: altPhone !== undefined ? altPhone : undefined,
                    moveInDate: moveInDate !== undefined ? moveInDate : undefined,
                    invoiceStartDate: invoiceStartDate !== undefined ? invoiceStartDate : undefined,
                    gender: gender !== undefined ? gender : undefined,
                    previousBalance: previousBalance !== undefined && previousBalance !== '' ? Number(previousBalance) : undefined,
                    openingBalance: openingBalance !== undefined && openingBalance !== '' ? Number(openingBalance) : undefined,
                },
            });
            if (password) {
                const passwordHash = await bcrypt_1.default.hash(password, 12);
                const existingUser = await database_js_1.default.user.findFirst({
                    where: { email: oldTenant.email },
                });
                if (existingUser) {
                    await database_js_1.default.user.update({
                        where: { id: existingUser.id },
                        data: {
                            email,
                            passwordHash,
                            firstName: firstName || undefined,
                            lastName: lastName || undefined,
                            phone,
                        },
                    });
                }
                else {
                    const role = await (0, roleHelper_js_1.ensureRole)('Tenant');
                    await database_js_1.default.user.create({
                        data: {
                            email,
                            passwordHash,
                            firstName: firstName || 'Tenant',
                            lastName: lastName || 'User',
                            phone: phone || null,
                            roleId: role.id,
                            companyId,
                        },
                    });
                }
            }
            return (0, apiResponse_js_1.sendSuccess)({ res, data: tenant });
        }
        catch (error) {
            if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
                return next(new appError_js_1.AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL'));
            }
            next(error);
        }
    }
    async delete(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const id = req.params.id;
            const tenant = await database_js_1.default.tenant.findUnique({
                where: { id },
            });
            if (!tenant)
                throw new appError_js_1.AppError('Tenant not found.', 404, 'NOT_FOUND');
            if (companyId && tenant.companyId !== companyId) {
                throw new appError_js_1.AppError('Tenant not found.', 404, 'NOT_FOUND');
            }
            await database_js_1.default.$transaction(async (tx) => {
                // 1. Delete rent payments linked to tenant
                await tx.rentPayment.deleteMany({
                    where: { tenantId: id },
                });
                // 2. Delete invoices linked to tenant
                await tx.invoice.deleteMany({
                    where: { tenantId: id },
                });
                // 3. Delete leases linked to tenant (MoveIn, MoveOut, and LeaseRenewal have onDelete: Cascade with Lease)
                await tx.lease.deleteMany({
                    where: { tenantId: id },
                });
                // 4. Delete charges & deposits linked to tenant
                await tx.charge.deleteMany({
                    where: { tenantId: id },
                });
                await tx.deposit.deleteMany({
                    where: { tenantId: id },
                });
                // 5. Delete payment plans, screening reports, insurance policies
                await tx.paymentPlan.deleteMany({
                    where: { tenantId: id },
                });
                await tx.screeningReport.deleteMany({
                    where: { tenantId: id },
                });
                await tx.insurancePolicy.deleteMany({
                    where: { tenantId: id },
                });
                await tx.tenantDocument.deleteMany({
                    where: { tenantId: id },
                });
                await tx.serviceRequest.deleteMany({
                    where: { tenantId: id },
                });
                // 6. Delete login user safely
                if (tenant.email) {
                    const normEmail = tenant.email.trim().toLowerCase();
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
                // 7. Finally, delete the Tenant itself
                await tx.tenant.delete({
                    where: { id },
                });
            });
            return (0, apiResponse_js_1.sendSuccess)({ res, data: { success: true } });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.TenantController = TenantController;
exports.tenantController = new TenantController();
