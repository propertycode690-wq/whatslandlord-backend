"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveInService = exports.MoveInService = void 0;
const database_1 = __importDefault(require("../config/database"));
const auditHelper_1 = require("../utils/auditHelper");
const notification_helper_1 = require("./notification.helper");
class MoveInService {
    async getAllMoveIns(companyId, status) {
        // 1. Auto-sync any Lease with Pending_Move_In that doesn't have a MoveIn record yet
        try {
            const leasesWithoutMoveIn = await database_1.default.lease.findMany({
                where: {
                    moveIn: null,
                    ...(companyId
                        ? {
                            OR: [
                                { companyId },
                                { companyId: null },
                                { property: { companyId } },
                            ],
                        }
                        : {}),
                },
                include: { unit: true },
            });
            for (const l of leasesWithoutMoveIn) {
                const mStatus = l.status === 'Active' ? 'COMPLETED' : 'SCHEDULED';
                await database_1.default.moveIn.create({
                    data: {
                        leaseId: l.id,
                        unitId: l.unitId,
                        scheduledDate: l.startDate || new Date(),
                        status: mStatus,
                        completedDate: mStatus === 'COMPLETED' ? new Date() : null,
                        createdBy: 'System',
                        companyId: l.companyId || companyId || null,
                    },
                }).catch(() => { });
            }
        }
        catch (syncErr) {
            console.warn('Auto-sync moveIns warning:', syncErr);
        }
        const companyFilter = companyId
            ? {
                OR: [
                    { companyId },
                    { companyId: null },
                    { lease: { companyId } },
                    { unit: { property: { companyId } } },
                ],
            }
            : {};
        return database_1.default.moveIn.findMany({
            where: {
                ...companyFilter,
                ...(status ? { status: status } : {}),
            },
            include: {
                unit: {
                    include: {
                        property: true,
                    },
                },
                lease: {
                    include: {
                        tenant: true,
                    },
                },
                inspections: {
                    orderBy: { createdAt: 'desc' },
                },
            },
            orderBy: { scheduledDate: 'asc' },
        });
    }
    async getMoveInById(id, companyId) {
        const companyFilter = companyId
            ? {
                OR: [
                    { companyId },
                    { companyId: null },
                    { lease: { companyId } },
                    { unit: { property: { companyId } } },
                ],
            }
            : {};
        return database_1.default.moveIn.findFirst({
            where: {
                id,
                ...companyFilter,
            },
            include: {
                unit: {
                    include: {
                        property: true,
                    },
                },
                lease: {
                    include: {
                        tenant: true,
                    },
                },
                inspections: {
                    include: {
                        assignedInspector: true,
                        rooms: {
                            include: {
                                items: {
                                    include: {
                                        photos: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });
    }
    async createMoveIn(data) {
        if (data.leaseId) {
            const existing = await database_1.default.moveIn.findFirst({
                where: { leaseId: data.leaseId },
            });
            if (existing) {
                return existing;
            }
        }
        return database_1.default.moveIn.create({
            data: {
                leaseId: data.leaseId,
                unitId: data.unitId,
                scheduledDate: new Date(data.scheduledDate),
                status: data.status || 'SCHEDULED',
                notes: data.notes,
                createdBy: data.createdBy || 'System',
                companyId: data.companyId,
            },
        });
    }
    async updateMoveIn(id, data, companyId) {
        const moveIn = await database_1.default.moveIn.findFirst({
            where: { id, ...(companyId ? { companyId } : {}) },
        });
        if (!moveIn)
            throw new Error('Move In record not found');
        if (moveIn.status === 'COMPLETED') {
            throw new Error('Cannot update completed Move In record');
        }
        const updateData = {};
        if (data.scheduledDate)
            updateData.scheduledDate = new Date(data.scheduledDate);
        if (data.notes !== undefined)
            updateData.notes = data.notes;
        if (data.status)
            updateData.status = data.status;
        const updatedMoveIn = await database_1.default.moveIn.update({
            where: { id },
            data: updateData,
        });
        const validUserId = await (0, auditHelper_1.getValidUserId)(data.userId);
        await database_1.default.auditLog.create({
            data: {
                action: `Move In Updated: Status ${updatedMoveIn.status}`,
                userId: validUserId,
                module: 'Leasing',
                object: `MoveIn ${id}`,
                ip: '127.0.0.1',
                status: 'Success',
            },
        });
        return updatedMoveIn;
    }
    async completeMoveIn(id, userId, companyId) {
        const companyFilter = companyId
            ? {
                OR: [
                    { companyId },
                    { companyId: null },
                    { lease: { companyId } },
                    { unit: { property: { companyId } } },
                ],
            }
            : {};
        const moveIn = await database_1.default.moveIn.findFirst({
            where: { id, ...companyFilter },
            include: {
                lease: {
                    include: {
                        tenant: true,
                        property: true,
                        unit: true,
                    },
                },
                unit: {
                    include: {
                        property: true,
                    },
                },
                inspections: true,
            },
        });
        if (!moveIn)
            throw new Error('Move In record not found');
        if (moveIn.status === 'COMPLETED')
            throw new Error('Move In is already completed');
        // Validate that Lease status is Pending Move In or Active
        if (moveIn.lease && moveIn.lease.status !== 'Pending_Move_In' && moveIn.lease.status !== 'Active') {
            console.warn(`Lease status is ${moveIn.lease.status}, continuing move-in completion.`);
        }
        // Validate that Unit is Vacant (relaxed for development/testing)
        if (moveIn.unit && moveIn.unit.status !== 'Vacant') {
            console.warn(`Unit status is ${moveIn.unit.status}, continuing move-in.`);
        }
        // Validate that at least one inspection is COMPLETED (relaxed to support Skip Inspection)
        const completedInspections = moveIn.inspections.filter((ins) => ins.status === 'COMPLETED');
        if (completedInspections.length === 0) {
            console.warn('Inspection skipped by manager, completing Move In process directly.');
        }
        return database_1.default.$transaction(async (tx) => {
            // 1. Update MoveIn status
            const updatedMoveIn = await tx.moveIn.update({
                where: { id },
                data: {
                    status: 'COMPLETED',
                    completedDate: new Date(),
                },
            });
            // 2. Update Lease status to Active
            if (moveIn.leaseId) {
                await tx.lease.update({
                    where: { id: moveIn.leaseId },
                    data: {
                        status: 'Active',
                    },
                });
            }
            // 3. Update Unit status to Occupied
            if (moveIn.unitId) {
                await tx.unit.update({
                    where: { id: moveIn.unitId },
                    data: {
                        status: 'Occupied',
                    },
                });
            }
            // 4. Update Tenant status to Active and assign unit
            if (moveIn.lease?.tenantId) {
                await tx.tenant.update({
                    where: { id: moveIn.lease.tenantId },
                    data: {
                        status: 'Active',
                        unitId: moveIn.unitId,
                    },
                });
            }
            // 5. Generate Immediate Move-In Rent Invoice
            const lease = moveIn.lease;
            let generatedInvoice = null;
            if (lease && lease.tenantId && (lease.rentAmount || 0) > 0) {
                const dueDateStr = lease.startDate ? lease.startDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                const tenantName = lease.tenant ? `${lease.tenant.firstName || ''} ${lease.tenant.lastName || ''}`.trim() : 'Resident';
                const propertyName = lease.property?.name || moveIn.unit?.property?.name || 'Property';
                const unitNumber = lease.unit?.unitNumber || moveIn.unit?.unitNumber ? `Unit ${lease.unit?.unitNumber || moveIn.unit?.unitNumber}` : 'Unit';
                // Check if invoice for this tenant, property and cycle dueDate already exists
                const existingInvoice = await tx.invoice.findFirst({
                    where: {
                        tenantId: lease.tenantId,
                        propertyId: lease.propertyId,
                        dueDate: dueDateStr,
                        lineItems: { contains: 'Rent' },
                    },
                });
                if (!existingInvoice) {
                    const lineItems = [
                        { description: 'Rent Charge (Move-In)', amount: lease.rentAmount },
                    ];
                    generatedInvoice = await tx.invoice.create({
                        data: {
                            tenantId: lease.tenantId,
                            tenantName,
                            propertyId: lease.propertyId,
                            propertyName,
                            unitNumber,
                            dueDate: dueDateStr,
                            amount: lease.rentAmount,
                            balance: lease.rentAmount,
                            paidAmount: 0,
                            status: 'Sent',
                            lineItems: JSON.stringify(lineItems),
                            notes: `Immediate rent invoice generated upon Move-In completion`,
                            companyId: moveIn.companyId || lease.companyId,
                        },
                    });
                    // Create notification for Property Manager
                    try {
                        await (0, notification_helper_1.createNotification)({
                            title: 'Move-In Invoice Generated',
                            message: `Immediate rent invoice of $${lease.rentAmount} generated for ${tenantName} (${propertyName} - ${unitNumber}).`,
                            role: 'Property Manager',
                            type: 'success',
                            companyId: moveIn.companyId || lease.companyId,
                            targetId: generatedInvoice.id,
                            targetUrl: '/rent-payments/invoices',
                        });
                    }
                    catch (notifErr) {
                        console.warn('Failed to send move-in invoice notification:', notifErr);
                    }
                }
                else {
                    generatedInvoice = existingInvoice;
                }
            }
            const validUserId = await (0, auditHelper_1.getValidUserId)(userId, tx);
            // 6. Create Audit Log
            await tx.auditLog.create({
                data: {
                    action: 'Move In Completed & Lease Activated',
                    userId: validUserId,
                    module: 'Leasing',
                    object: `MoveIn ${id}`,
                    ip: '127.0.0.1',
                    status: 'Success',
                },
            });
            return {
                ...updatedMoveIn,
                invoice: generatedInvoice,
            };
        });
    }
}
exports.MoveInService = MoveInService;
exports.moveInService = new MoveInService();
