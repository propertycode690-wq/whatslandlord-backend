"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.workOrderController = exports.WorkOrderController = void 0;
const database_js_1 = __importDefault(require("../config/database.js"));
const apiResponse_js_1 = require("../utils/apiResponse.js");
const notification_helper_js_1 = require("../services/notification.helper.js");
class WorkOrderController {
    async getAll(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            // 1. Fetch WorkOrders
            const workOrders = await database_js_1.default.workOrder.findMany({
                where: companyId ? { companyId } : {},
                include: { property: true, vendor: true },
                orderBy: { createdAt: 'desc' },
            });
            // 2. Fetch ServiceRequests
            const serviceRequests = await database_js_1.default.serviceRequest.findMany({
                where: companyId ? { companyId } : {},
                orderBy: { createdAt: 'desc' },
            });
            const formattedWorkOrders = workOrders.map((wo, index) => {
                const est = Number(wo.estimatedCost || 0);
                const act = Number(wo.actualCost || wo.cost || est);
                return {
                    id: wo.id,
                    workOrderNumber: `WO-${1001 + index}`,
                    propertyId: wo.propertyId,
                    propertyName: wo.property?.name || wo.propertyName || 'Property',
                    unitNumber: wo.unitNumber || (wo.property?.units?.length ? `Unit ${wo.property.units[0].unitNumber}` : 'Unit 101'),
                    vendorId: wo.vendorId || '',
                    vendorName: wo.vendor?.companyName || wo.vendorName || wo.assignedTechnician || 'Unassigned',
                    assignedTechnician: wo.assignedTechnician || wo.vendor?.contactName || wo.vendorName || 'Unassigned',
                    scheduledDate: wo.createdAt ? new Date(wo.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    priority: wo.priority || 'Normal',
                    status: wo.status === 'Open' || wo.status === 'Submitted' ? 'Open' : wo.status === 'InProgress' || wo.status === 'In Progress' ? 'In Progress' : wo.status === 'Completed' ? 'Completed' : wo.status === 'Cancelled' ? 'Cancelled' : wo.status || 'Open',
                    estimatedCost: est,
                    actualCost: act,
                    extraExpenses: wo.extraExpenses || 0,
                    labourCost: wo.labourCost || 0,
                    title: wo.title,
                    description: wo.description,
                    createdAt: wo.createdAt ? new Date(wo.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    rejectReason: wo.rejectReason || null,
                    resolutionNotes: wo.resolutionNotes || null,
                };
            });
            const formattedServiceRequests = serviceRequests.map((sr, index) => {
                const est = Number(sr.estimatedCost || 0);
                const act = Number(sr.labourCost || sr.cost || 0);
                return {
                    id: sr.id,
                    workOrderNumber: `SR-${1001 + index}`,
                    propertyId: sr.propertyId,
                    propertyName: sr.propertyName || 'Property',
                    unitNumber: sr.unitNumber ? (String(sr.unitNumber).toLowerCase().includes('unit') ? sr.unitNumber : `Unit ${sr.unitNumber}`) : 'Unit 101',
                    vendorId: sr.assignedVendorId || '',
                    vendorName: sr.assignedVendorName || sr.assignedTechnician || 'Unassigned',
                    assignedTechnician: sr.assignedTechnician || sr.assignedVendorName || 'Unassigned',
                    scheduledDate: sr.scheduledDate || (sr.createdAt ? new Date(sr.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
                    preferredTime: sr.scheduledDate || (sr.notes?.includes('Preferred Visit:') ? sr.notes.replace('Preferred Visit:', '').trim() : null) || (sr.description?.match(/\[Preferred Visit:\s*([^\]]+)\]/)?.[1]) || null,
                    priority: sr.priority === 'Normal' ? 'Medium' : sr.priority || 'Medium',
                    status: sr.status === 'Open' || sr.status === 'New' || sr.status === 'Submitted' ? 'Open' : sr.status === 'InProgress' || sr.status === 'In Progress' ? 'In Progress' : sr.status === 'Completed' ? 'Completed' : sr.status === 'Closed' ? 'Closed' : sr.status === 'Rejected' ? 'Rejected' : sr.status === 'Assigned' ? 'Assigned' : sr.status || 'Open',
                    estimatedCost: est,
                    actualCost: act,
                    extraExpenses: sr.extraExpenses || 0,
                    labourCost: sr.labourCost || 0,
                    title: sr.title,
                    description: sr.description || '',
                    createdAt: sr.createdAt ? new Date(sr.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    rejectReason: sr.status === 'Rejected' ? sr.notes : null,
                    resolutionNotes: sr.status === 'Completed' ? sr.notes : null,
                };
            });
            const combined = [...formattedServiceRequests, ...formattedWorkOrders];
            return (0, apiResponse_js_1.sendSuccess)({ res, data: combined });
        }
        catch (error) {
            next(error);
        }
    }
    async getById(req, res, next) {
        try {
            const id = req.params['id'];
            const companyId = req.user?.companyId;
            const wo = await database_js_1.default.workOrder.findFirst({
                where: companyId ? { id, companyId } : { id },
                include: { property: true, vendor: true },
            });
            if (wo) {
                return (0, apiResponse_js_1.sendSuccess)({
                    res,
                    data: {
                        id: wo.id,
                        workOrderNumber: `WO-${wo.id.slice(0, 8)}`,
                        propertyId: wo.propertyId,
                        propertyName: wo.property?.name || 'Oakridge Heights',
                        unitNumber: 'Unit 102',
                        vendorId: wo.vendorId || '',
                        vendorName: wo.vendor?.companyName || 'ProFix Solutions',
                        assignedTechnician: wo.vendor?.contactName || 'Technician Lead 1',
                        scheduledDate: new Date().toISOString().split('T')[0],
                        priority: wo.priority || 'Normal',
                        status: wo.status === 'Open' ? 'Open' : wo.status === 'InProgress' ? 'In Progress' : wo.status === 'Completed' ? 'Completed' : wo.status === 'Cancelled' ? 'Cancelled' : wo.status || 'Open',
                        estimatedCost: wo.estimatedCost || 0,
                        actualCost: wo.actualCost || 0,
                        extraExpenses: wo.extraExpenses || 0,
                        labourCost: wo.labourCost || 0,
                        title: wo.title,
                        description: wo.description,
                        createdAt: wo.createdAt ? new Date(wo.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                        rejectReason: wo.rejectReason || null,
                        resolutionNotes: wo.resolutionNotes || null,
                    },
                });
            }
            const sr = await database_js_1.default.serviceRequest.findFirst({
                where: companyId ? { id, companyId } : { id },
            });
            if (sr) {
                return (0, apiResponse_js_1.sendSuccess)({
                    res,
                    data: {
                        id: sr.id,
                        workOrderNumber: `SR-${sr.id.slice(0, 8)}`,
                        propertyId: sr.propertyId,
                        propertyName: sr.propertyName || 'Oakridge Heights',
                        unitNumber: sr.unitNumber ? `Unit ${sr.unitNumber}` : 'Unit 102',
                        vendorId: sr.assignedVendorId || '',
                        vendorName: sr.assignedVendorName || 'ProFix Solutions',
                        assignedTechnician: sr.assignedVendorName || sr.assignedTechnician || 'Technician Lead 1',
                        scheduledDate: sr.scheduledDate || new Date().toISOString().split('T')[0],
                        preferredTime: sr.scheduledDate || (sr.notes?.includes('Preferred Visit:') ? sr.notes.replace('Preferred Visit:', '').trim() : null) || (sr.description?.match(/\[Preferred Visit:\s*([^\]]+)\]/)?.[1]) || null,
                        priority: sr.priority || 'Normal',
                        status: sr.status === 'Open' || sr.status === 'New' ? 'Open' : sr.status === 'InProgress' || sr.status === 'In Progress' ? 'In Progress' : sr.status === 'Completed' ? 'Completed' : sr.status === 'Closed' ? 'Closed' : sr.status === 'Rejected' ? 'Rejected' : sr.status === 'Assigned' ? 'Assigned' : sr.status || 'Open',
                        estimatedCost: sr.estimatedCost || 0,
                        actualCost: sr.labourCost || sr.cost || 0,
                        extraExpenses: sr.extraExpenses || 0,
                        labourCost: sr.labourCost || 0,
                        title: sr.title,
                        description: sr.description,
                        createdAt: sr.createdAt ? new Date(sr.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                        rejectReason: sr.status === 'Rejected' ? sr.notes : null,
                        resolutionNotes: sr.status === 'Completed' ? sr.notes : null,
                    },
                });
            }
            return res.status(404).json({ success: false, error: { message: 'Task not found' } });
        }
        catch (error) {
            next(error);
        }
    }
    async create(req, res, next) {
        try {
            const { propertyId, title, description, vendorId, priority, status, estimatedCost, actualCost } = req.body;
            const companyId = req.user?.companyId;
            const workOrder = await database_js_1.default.workOrder.create({
                data: {
                    propertyId,
                    title,
                    description,
                    vendorId: vendorId || null,
                    priority: priority || 'Normal',
                    status: status || 'Open',
                    estimatedCost: estimatedCost ? parseFloat(estimatedCost) : null,
                    actualCost: actualCost ? parseFloat(actualCost) : null,
                    companyId,
                },
                include: { property: true, vendor: true },
            });
            // Notify Property Manager & Maintenance Staff
            await (0, notification_helper_js_1.createNotification)({
                title: 'New Work Order Created',
                message: `Work Order: "${title}" created for ${workOrder.property?.name || 'Property'}`,
                role: 'Property Manager',
                companyId,
                targetId: workOrder.id,
            });
            await (0, notification_helper_js_1.createNotification)({
                title: 'New Maintenance Task Assigned',
                message: `Work Order "${title}" has been created for ${workOrder.property?.name || 'Property'}`,
                role: 'Maintenance Staff',
                companyId,
                targetId: workOrder.id,
            });
            return (0, apiResponse_js_1.sendSuccess)({ res, statusCode: 201, data: workOrder });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const id = req.params['id'];
            const { status, priority, estimatedCost, actualCost, extraCost, cost, vendorId, rejectReason, resolutionNotes } = req.body;
            const companyId = req.user?.companyId;
            const statusMap = {
                'Open': 'Open',
                'New': 'Submitted',
                'Submitted': 'Submitted',
                'Approved': 'Approved',
                'Assigned': 'Assigned',
                'Accepted': 'Accepted',
                'InProgress': 'InProgress',
                'In Progress': 'InProgress',
                'Completed': 'Completed',
                'Rejected': 'Rejected',
                'Cancelled': 'Cancelled',
                'Closed': 'Closed',
                'Returned': 'Returned',
            };
            const finalStatus = status ? (statusMap[status] ?? status) : undefined;
            const resolvedActualCost = actualCost !== undefined ? parseFloat(String(actualCost)) : (cost !== undefined ? parseFloat(String(cost)) : undefined);
            // 1. Check ServiceRequest table
            const existingSr = await database_js_1.default.serviceRequest.findUnique({ where: { id } });
            if (existingSr) {
                const srStatus = finalStatus === 'InProgress' ? 'In Progress' : finalStatus;
                const updatedSr = await database_js_1.default.serviceRequest.update({
                    where: { id },
                    data: {
                        ...(srStatus && { status: srStatus }),
                        ...(resolvedActualCost !== undefined && { cost: resolvedActualCost }),
                        ...(estimatedCost !== undefined && { estimatedCost: parseFloat(String(estimatedCost)) }),
                        ...(rejectReason && { notes: rejectReason }),
                    },
                });
                // Notify Tenant if status changed
                if (existingSr.tenantId && srStatus) {
                    await (0, notification_helper_js_1.createNotification)({
                        title: `Service Request: ${srStatus}`,
                        message: `Your maintenance request "${existingSr.title}" is now ${srStatus}.`,
                        role: 'Tenant',
                        companyId: existingSr.companyId,
                        targetId: existingSr.tenantId,
                    });
                }
                // Notify Property Manager
                if (srStatus) {
                    await (0, notification_helper_js_1.createNotification)({
                        title: `Maintenance Request ${srStatus}`,
                        message: `Task "${existingSr.title}" updated to status ${srStatus}.`,
                        role: 'Property Manager',
                        companyId: existingSr.companyId,
                        targetId: existingSr.id,
                    });
                }
                return (0, apiResponse_js_1.sendSuccess)({ res, data: updatedSr });
            }
            // 2. Check WorkOrder table
            const existingWo = await database_js_1.default.workOrder.findUnique({ where: { id } });
            if (existingWo) {
                const workOrder = await database_js_1.default.workOrder.update({
                    where: { id },
                    data: {
                        ...(finalStatus && { status: finalStatus }),
                        ...(priority && { priority }),
                        ...(estimatedCost !== undefined && { estimatedCost: parseFloat(String(estimatedCost)) }),
                        ...(resolvedActualCost !== undefined && { actualCost: resolvedActualCost }),
                        ...(vendorId && { vendorId }),
                        ...(rejectReason && { rejectReason }),
                        ...(resolutionNotes && { resolutionNotes }),
                    },
                    include: { property: true, vendor: true },
                });
                return (0, apiResponse_js_1.sendSuccess)({ res, data: workOrder });
            }
            return res.status(404).json({ success: false, error: { message: 'Task not found' } });
        }
        catch (error) {
            next(error);
        }
    }
    async remove(req, res, next) {
        try {
            const id = req.params['id'];
            const companyId = req.user?.companyId;
            // 1. Try finding and deleting from WorkOrder
            const woCheck = await database_js_1.default.workOrder.findFirst({
                where: companyId ? { id, companyId } : { id },
            });
            if (woCheck) {
                await database_js_1.default.workOrder.delete({ where: { id } });
                return (0, apiResponse_js_1.sendSuccess)({ res, data: { deleted: true } });
            }
            // 2. If not found in WorkOrder, check ServiceRequest (since getAll combines them)
            const srCheck = await database_js_1.default.serviceRequest.findFirst({
                where: companyId ? { id, companyId } : { id },
            });
            if (srCheck) {
                await database_js_1.default.serviceRequest.delete({ where: { id } });
                return (0, apiResponse_js_1.sendSuccess)({ res, data: { deleted: true } });
            }
            throw new Error('WorkOrder not found.');
        }
        catch (error) {
            next(error);
        }
    }
}
exports.WorkOrderController = WorkOrderController;
exports.workOrderController = new WorkOrderController();
