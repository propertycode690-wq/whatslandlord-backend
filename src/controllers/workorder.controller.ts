import { Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { createNotification } from '../services/notification.helper.js';

export class WorkOrderController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;

      // 1. Fetch WorkOrders
      const workOrders = await prisma.workOrder.findMany({
        where: companyId ? { companyId } : {},
        include: { property: true, vendor: true },
        orderBy: { createdAt: 'desc' },
      });

      // 2. Fetch ServiceRequests
      const serviceRequests = await prisma.serviceRequest.findMany({
        where: companyId ? { companyId } : {},
        orderBy: { createdAt: 'desc' },
      });

      const formattedWorkOrders = workOrders.map((wo: any, index: number) => {
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

      const formattedServiceRequests = serviceRequests.map((sr: any, index: number) => {
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
      return sendSuccess({ res, data: combined });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params['id'] as string;
      const companyId = req.user?.companyId;

      const wo = await prisma.workOrder.findFirst({
        where: companyId ? { id, companyId } : { id },
        include: { property: true, vendor: true },
      });

      if (wo) {
        return sendSuccess({
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

      const sr = await prisma.serviceRequest.findFirst({
        where: companyId ? { id, companyId } : { id },
      });

      if (sr) {
        return sendSuccess({
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
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId, title, description, vendorId, priority, status, estimatedCost, actualCost } = req.body;
      const companyId = req.user?.companyId;
      const workOrder = await prisma.workOrder.create({
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
      await createNotification({
        title: 'New Work Order Created',
        message: `Work Order: "${title}" created for ${workOrder.property?.name || 'Property'}`,
        role: 'Property Manager',
        companyId,
        targetId: workOrder.id,
      });

      await createNotification({
        title: 'New Maintenance Task Assigned',
        message: `Work Order "${title}" has been created for ${workOrder.property?.name || 'Property'}`,
        role: 'Maintenance Staff',
        companyId,
        targetId: workOrder.id,
      });

      return sendSuccess({ res, statusCode: 201, data: workOrder });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params['id'] as string;
      const { status, priority, estimatedCost, actualCost, extraCost, cost, vendorId, rejectReason, resolutionNotes } = req.body;
      const companyId = req.user?.companyId;

      const statusMap: Record<string, string> = {
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
      const existingSr = await prisma.serviceRequest.findUnique({ where: { id } });
      if (existingSr) {
        const srStatus = finalStatus === 'InProgress' ? 'In Progress' : finalStatus;
        const updatedSr = await prisma.serviceRequest.update({
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
          await createNotification({
            title: `Service Request: ${srStatus}`,
            message: `Your maintenance request "${existingSr.title}" is now ${srStatus}.`,
            role: 'Tenant',
            companyId: existingSr.companyId,
            targetId: existingSr.tenantId,
          });
        }

        // Notify Property Manager
        if (srStatus) {
          await createNotification({
            title: `Maintenance Request ${srStatus}`,
            message: `Task "${existingSr.title}" updated to status ${srStatus}.`,
            role: 'Property Manager',
            companyId: existingSr.companyId,
            targetId: existingSr.id,
          });
        }

        return sendSuccess({ res, data: updatedSr });
      }

      // 2. Check WorkOrder table
      const existingWo = await prisma.workOrder.findUnique({ where: { id } });
      if (existingWo) {
        const workOrder = await prisma.workOrder.update({
          where: { id },
          data: {
            ...(finalStatus && { status: finalStatus as any }),
            ...(priority && { priority }),
            ...(estimatedCost !== undefined && { estimatedCost: parseFloat(String(estimatedCost)) }),
            ...(resolvedActualCost !== undefined && { actualCost: resolvedActualCost }),
            ...(vendorId && { vendorId }),
            ...(rejectReason && { rejectReason }),
            ...(resolutionNotes && { resolutionNotes }),
          },
          include: { property: true, vendor: true },
        });
        return sendSuccess({ res, data: workOrder });
      }

      return res.status(404).json({ success: false, error: { message: 'Task not found' } });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params['id'] as string;
      const companyId = req.user?.companyId;

      if (companyId) {
        const check = await prisma.workOrder.findFirst({
          where: { id, companyId },
        });
        if (!check) throw new Error('WorkOrder not found.');
      }

      await prisma.workOrder.delete({ where: { id } });
      return sendSuccess({ res, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  }
}

export const workOrderController = new WorkOrderController();
