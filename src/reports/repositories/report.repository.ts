import prisma from '../../config/database';

export class ReportRepository {
  // 1. Rent Roll Report Data
  async getRentRollData(params: {
    companyId?: string;
    propertyIds: string[];
    propertyId?: string;
    unitId?: string;
    tenantId?: string;
    leaseStatus?: string;
    search?: string;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { propertyIds, propertyId, unitId, tenantId, leaseStatus, search, page, limit, sortBy, sortOrder = 'desc' } = params;
    const activePropertyIds = propertyId ? [propertyId] : propertyIds;

    if (activePropertyIds.length === 0) {
      return { leases: [], units: [], totalRecords: 0, summary: { totalMonthlyRent: 0, totalSecurityDeposits: 0, occupiedCount: 0, vacantCount: 0, totalUnits: 0 } };
    }

    const whereClause: any = {
      propertyId: { in: activePropertyIds },
      property: {
        status: { notIn: ['Inactive', 'Deleted'] },
      },
    };

    if (params.companyId) {
      whereClause.companyId = params.companyId;
    }

    if (unitId) {
      whereClause.unitId = unitId;
    }

    if (tenantId) {
      whereClause.tenantId = tenantId;
    }

    if (leaseStatus) {
      const ls = leaseStatus.toLowerCase();
      if (ls === 'occupied' || ls === 'active') {
        whereClause.status = 'Active';
      } else if (ls === 'pending' || ls === 'pending_move_in') {
        whereClause.status = 'Pending_Move_In';
      } else if (ls === 'ended' || ls === 'expired' || ls === 'terminated') {
        whereClause.status = { in: ['Ended', 'Expired', 'Terminated'] };
      } else if (ls !== 'all' && ls !== 'all statuses' && ls !== 'all_statuses') {
        whereClause.status = leaseStatus;
      } else {
        whereClause.status = 'Active';
      }
    } else {
      whereClause.status = 'Active';
    }

    if (search) {
      whereClause.AND = [
        {
          OR: [
            { tenant: { firstName: { contains: search } } },
            { tenant: { lastName: { contains: search } } },
            { property: { name: { contains: search } } },
            { unit: { unitNumber: { contains: search } } },
          ],
        },
      ];
    }

    const skip = (page - 1) * limit;

    let orderBy: any = { startDate: sortOrder };
    if (sortBy === 'endDate') orderBy = { endDate: sortOrder };
    if (sortBy === 'rentAmount') orderBy = { rentAmount: sortOrder };
    if (sortBy === 'depositAmount') orderBy = { depositAmount: sortOrder };

    const [leases, totalRecords] = await Promise.all([
      prisma.lease.findMany({
        where: whereClause,
        include: {
          property: true,
          unit: true,
          tenant: true,
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.lease.count({ where: whereClause }),
    ]);

    const targetPropertyIds = propertyId ? [propertyId] : activePropertyIds;

    const allActiveLeases = await prisma.lease.findMany({
      where: {
        propertyId: { in: targetPropertyIds },
        property: {
          status: { notIn: ['Inactive', 'Deleted'] },
        },
        ...(params.companyId ? { companyId: params.companyId } : {}),
        status: 'Active',
      },
      select: {
        rentAmount: true,
        depositAmount: true,
        unit: {
          select: {
            rentAmount: true,
            securityDeposit: true,
          },
        },
      },
    });

    const allUnits = await prisma.unit.findMany({
      where: {
        propertyId: { in: targetPropertyIds },
        property: {
          status: { notIn: ['Inactive', 'Deleted'] },
        },
        ...(unitId ? { id: unitId } : {}),
        ...(tenantId ? { tenants: { some: { id: tenantId } } } : {}),
      },
      select: {
        id: true,
        status: true,
      },
    });

    let totalMonthlyRent = 0;
    let totalSecurityDeposits = 0;

    allActiveLeases.forEach((l) => {
      totalMonthlyRent += Number(l.rentAmount || l.unit?.rentAmount || 0);
      totalSecurityDeposits += Number(l.depositAmount || l.unit?.securityDeposit || 0);
    });

    const totalUnitsCount = allUnits.length > 0 ? allUnits.length : leases.length;
    const occupiedCount = allUnits.filter((u) => u.status === 'Occupied').length;
    const vacantCount = allUnits.filter((u) => u.status === 'Vacant').length;

    return {
      leases,
      units: leases.length === 0 ? allUnits : [],
      totalRecords: totalRecords || allUnits.length,
      summary: {
        totalMonthlyRent,
        totalSecurityDeposits,
        occupiedCount,
        vacantCount,
        totalUnits: totalUnitsCount,
      },
    };
  }

  // 2. Occupancy Report Data
  async getOccupancyData(params: {
    companyId?: string;
    propertyIds: string[];
    propertyId?: string;
    page: number;
    limit: number;
  }) {
    const { propertyIds, propertyId, page, limit } = params;
    const activePropertyIds = propertyId ? [propertyId] : propertyIds;

    if (activePropertyIds.length === 0) {
      return { properties: [], totalRecords: 0, summary: { portfolioTotalUnits: 0, portfolioOccupiedUnits: 0, portfolioVacantUnits: 0, portfolioMaintenanceUnits: 0, overallOccupancyPercentage: 0, totalProperties: 0 } };
    }

    const whereClause: any = {
      id: { in: activePropertyIds },
      status: { notIn: ['Inactive', 'Deleted'] },
    };

    const skip = (page - 1) * limit;

    const [properties, totalRecords, allUnits] = await Promise.all([
      prisma.property.findMany({
        where: whereClause,
        include: {
          units: {
            select: {
              status: true,
            },
          },
        },
        orderBy: [
          { units: { _count: 'desc' } },
          { name: 'asc' },
        ],
        skip,
        take: limit,
      }),
      prisma.property.count({ where: whereClause }),
      prisma.unit.findMany({
        where: {
          propertyId: { in: activePropertyIds },
          property: {
            status: { notIn: ['Inactive', 'Deleted'] },
          },
        },
        select: {
          id: true,
          status: true,
          propertyId: true,
        },
      }),
    ]);

    let portfolioTotalUnits = allUnits.length;
    let portfolioOccupiedUnits = 0;
    let portfolioMaintenanceUnits = 0;
    let portfolioVacantUnits = 0;

    allUnits.forEach((u) => {
      if (u.status === 'Occupied') {
        portfolioOccupiedUnits++;
      } else if (u.status === 'UnderMaintenance') {
        portfolioMaintenanceUnits++;
      } else {
        portfolioVacantUnits++;
      }
    });

    const overallOccupancyPercentage = portfolioTotalUnits > 0
      ? parseFloat(((portfolioOccupiedUnits / portfolioTotalUnits) * 100).toFixed(1))
      : 0.0;

    return {
      properties,
      totalRecords,
      summary: {
        portfolioTotalUnits,
        portfolioOccupiedUnits,
        portfolioVacantUnits,
        portfolioMaintenanceUnits,
        overallOccupancyPercentage,
        totalProperties: totalRecords,
      },
    };
  }

  // 3. Delinquency Report Data
  async getDelinquencyData(params: {
    companyId?: string;
    propertyIds: string[];
    propertyId?: string;
    tenantId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { propertyIds, propertyId, tenantId, status, startDate, endDate, page, limit, sortBy, sortOrder = 'desc' } = params;
    const activePropertyIds = propertyId ? [propertyId] : propertyIds;

    if (activePropertyIds.length === 0) {
      return { invoices: [], totalRecords: 0, summary: { totalDelinquentBalance: 0, totalOriginalAmount: 0, totalDelinquentTenants: 0, totalDelinquentInvoices: 0, averageDaysLate: 0 } };
    }

    const whereClause: any = {
      propertyId: { in: activePropertyIds },
      ...(params.companyId ? { companyId: params.companyId } : {}),
    };

    if (tenantId) {
      whereClause.tenantId = tenantId;
    }

    if (status && status !== 'All Statuses' && status !== 'all') {
      whereClause.status = status;
    } else {
      whereClause.status = { in: ['Unpaid', 'Overdue', 'Partially Paid', 'OVERDUE', 'UNPAID', 'PARTIAL'] };
    }

    if (startDate || endDate) {
      whereClause.dueDate = {};
      if (startDate) whereClause.dueDate.gte = startDate instanceof Date ? startDate.toISOString().split('T')[0] : String(startDate).split('T')[0];
      if (endDate) whereClause.dueDate.lte = endDate instanceof Date ? endDate.toISOString().split('T')[0] : String(endDate).split('T')[0];
    }

    const skip = (page - 1) * limit;

    let orderBy: any = { dueDate: sortOrder };
    if (sortBy === 'balance') orderBy = { balance: sortOrder };
    if (sortBy === 'amount') orderBy = { amount: sortOrder };

    const [invoices, totalRecords] = await Promise.all([
      prisma.invoice.findMany({
        where: whereClause,
        include: {
          tenant: true,
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where: whereClause }),
    ]);

    const allDelinquentInvoices = await prisma.invoice.findMany({
      where: whereClause,
      select: {
        balance: true,
        amount: true,
        paidAmount: true,
        tenantId: true,
        tenantName: true,
        dueDate: true,
      },
    });

    let totalDelinquentBalance = 0;
    let totalOriginalAmount = 0;
    let totalDaysLateSum = 0;
    const uniqueTenantIds = new Set<string>();

    const todayMs = new Date().getTime();

    allDelinquentInvoices.forEach((inv) => {
      const bal = Number(inv.balance ?? (Number(inv.amount || 0) - Number(inv.paidAmount || 0)));
      totalDelinquentBalance += Math.max(0, bal);
      totalOriginalAmount += Number(inv.amount || 0);

      if (inv.tenantId) uniqueTenantIds.add(inv.tenantId);
      else if (inv.tenantName) uniqueTenantIds.add(inv.tenantName);

      const dueMs = inv.dueDate ? new Date(inv.dueDate).getTime() : todayMs;
      if (todayMs > dueMs) {
        totalDaysLateSum += Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24));
      }
    });

    const averageDaysLate = allDelinquentInvoices.length > 0
      ? Math.round(totalDaysLateSum / allDelinquentInvoices.length)
      : 0;

    return {
      invoices,
      totalRecords,
      summary: {
        totalDelinquentBalance,
        totalOriginalAmount,
        totalDelinquentTenants: uniqueTenantIds.size,
        totalDelinquentInvoices: totalRecords,
        averageDaysLate,
      },
    };
  }

  // 4. Profit & Loss Report Data
  async getProfitLossData(params: {
    companyId?: string;
    propertyIds: string[];
    propertyId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const { propertyIds, propertyId, startDate, endDate } = params;
    const activePropertyIds = propertyId ? [propertyId] : propertyIds;

    if (activePropertyIds.length === 0) {
      return [];
    }

    const whereClause: any = {
      ...(params.companyId ? { journalEntry: { companyId: params.companyId } } : {}),
    };

    if (startDate || endDate) {
      whereClause.journalEntry = whereClause.journalEntry || {};
      whereClause.journalEntry.date = {};
      if (startDate) whereClause.journalEntry.date.gte = startDate;
      if (endDate) whereClause.journalEntry.date.lte = endDate;
    }

    try {
      const lines = await prisma.journalEntryLine.findMany({
        where: whereClause,
        include: {
          account: true,
          journalEntry: true,
        },
      });
      return lines;
    } catch (e) {
      console.warn('Failed to fetch journalEntryLine for P&L:', e);
      return [];
    }
  }

  // 5. Maintenance Report Data
  async getMaintenanceData(params: {
    companyId?: string;
    propertyIds: string[];
    propertyId?: string;
    status?: string;
    priority?: string;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { propertyIds, propertyId, status, priority, startDate, endDate, page, limit, sortBy, sortOrder = 'desc' } = params;
    const activePropertyIds = propertyId ? [propertyId] : propertyIds;

    if (activePropertyIds.length === 0) {
      return { workOrders: [], totalRecords: 0, summary: { totalWorkOrders: 0, totalEstimatedCost: 0, totalActualCost: 0, completedCount: 0, inProgressCount: 0, openCount: 0, completionRate: 0 } };
    }

    const woWhere: any = {
      propertyId: { in: activePropertyIds },
      property: {
        status: { notIn: ['Inactive', 'Deleted'] },
      },
      ...(params.companyId ? { companyId: params.companyId } : {}),
    };

    const srWhere: any = {
      propertyId: { in: activePropertyIds },
      ...(params.companyId ? { companyId: params.companyId } : {}),
    };

    if (propertyId) {
      woWhere.propertyId = propertyId;
      srWhere.propertyId = propertyId;
    }

    if (status && status !== 'All Statuses' && status !== 'all') {
      const sf = status.toLowerCase().replace(/[\s_-]/g, '');
      let statusFilter: any;
      if (sf === 'inprogress' || sf === 'inprocess') {
        statusFilter = { in: ['InProgress', 'In Progress', 'in_progress', 'IN_PROGRESS', 'Assigned', 'assigned'] };
      } else if (sf === 'completed' || sf === 'closed') {
        statusFilter = { in: ['Completed', 'completed', 'Closed', 'closed'] };
      } else if (sf === 'notstarted' || sf === 'open' || sf === 'new') {
        statusFilter = { in: ['Not Started', 'not_started', 'Open', 'open', 'New', 'new', 'Pending'] };
      } else {
        statusFilter = { in: [status, status.toLowerCase(), status.toUpperCase()] };
      }
      woWhere.status = statusFilter;
      srWhere.status = statusFilter;
    }

    if (priority && priority !== 'All Priorities' && priority !== 'all') {
      woWhere.priority = priority;
      srWhere.priority = { in: [priority, priority.toLowerCase(), priority.toUpperCase()] };
    }

    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;
      woWhere.createdAt = dateFilter;
      srWhere.createdAt = dateFilter;
    }

    const [allWorkOrders, allServiceRequests] = await Promise.all([
      prisma.workOrder.findMany({
        where: woWhere,
        include: {
          property: true,
          vendor: true,
        },
      }),
      prisma.serviceRequest.findMany({
        where: srWhere,
      }),
    ]);

    const formattedWOs = allWorkOrders.map((w: any) => {
      const est = Number(w.estimatedCost || 0);
      const act = Number(w.actualCost || w.cost || est);
      return {
        id: w.id,
        propertyId: w.propertyId,
        propertyName: w.property?.name || w.propertyName || 'Property',
        unitNumber: w.unitNumber || 'Unit 101',
        title: w.title,
        priority: w.priority || 'Medium',
        status: w.status || 'Open',
        assignedTechnician: w.assignedTechnician || w.vendor?.contactName || 'Unassigned',
        vendorName: w.vendor?.companyName || w.vendorName || 'Unassigned',
        estimatedCost: est,
        actualCost: act,
        cost: act,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      };
    });

    const formattedSRs = allServiceRequests.map((sr: any) => {
      const est = Number(sr.estimatedCost || 0);
      const act = Number(sr.cost || sr.labourCost || est);
      return {
        id: sr.id,
        propertyId: sr.propertyId,
        propertyName: sr.propertyName || 'Property',
        unitNumber: sr.unitNumber || 'Unit 101',
        title: sr.title,
        priority: sr.priority === 'Normal' ? 'Medium' : (sr.priority || 'Medium'),
        status: sr.status || 'Open',
        assignedTechnician: sr.assignedTechnician || sr.assignedVendorName || 'Unassigned',
        vendorName: sr.assignedVendorName || 'Unassigned',
        estimatedCost: est,
        actualCost: act,
        cost: act,
        createdAt: sr.createdAt,
        updatedAt: sr.updatedAt,
      };
    });

    const combined = [...formattedSRs, ...formattedWOs];

    combined.sort((a, b) => {
      if (sortBy === 'estimatedCost') {
        return sortOrder === 'asc' ? a.estimatedCost - b.estimatedCost : b.estimatedCost - a.estimatedCost;
      }
      if (sortBy === 'actualCost') {
        return sortOrder === 'asc' ? a.actualCost - b.actualCost : b.actualCost - a.actualCost;
      }
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });

    let totalEstimatedCost = 0;
    let totalActualCost = 0;
    let completedCount = 0;
    let inProgressCount = 0;
    let openCount = 0;

    combined.forEach((w: any) => {
      totalEstimatedCost += Number(w.estimatedCost || 0);
      totalActualCost += Number(w.actualCost || w.cost || 0);

      const st = (w.status || '').toLowerCase().replace(/[\s_-]/g, '');
      if (st === 'completed' || st === 'closed') completedCount++;
      else if (st === 'inprogress' || st === 'assigned') inProgressCount++;
      else openCount++;
    });

    const completionRate = combined.length > 0
      ? parseFloat(((completedCount / combined.length) * 100).toFixed(1))
      : 0.0;

    const skip = (page - 1) * limit;
    const paginated = combined.slice(skip, skip + limit);

    return {
      workOrders: paginated,
      totalRecords: combined.length,
      summary: {
        totalWorkOrders: combined.length,
        totalEstimatedCost,
        totalActualCost: totalActualCost || totalEstimatedCost,
        completedCount,
        inProgressCount,
        openCount,
        completionRate,
      },
    };
  }

  // 6. Payment History Report Data
  async getPaymentHistoryData(params: {
    companyId?: string;
    propertyIds: string[];
    propertyId?: string;
    tenantId?: string;
    paymentMethod?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const {
      propertyIds,
      propertyId,
      tenantId,
      paymentMethod,
      status,
      startDate,
      endDate,
      page,
      limit,
      sortBy,
      sortOrder = 'desc',
    } = params;

    const activePropertyIds = propertyId ? [propertyId] : propertyIds;

    if (activePropertyIds.length === 0) {
      return { payments: [], totalRecords: 0, summary: { totalCollectedAmount: 0, totalTransactions: 0, averageTransaction: 0, methodMap: {} } };
    }

    const whereClause: any = {
      propertyId: { in: activePropertyIds },
      property: {
        status: { notIn: ['Inactive', 'Deleted'] },
      },
    };

    if (params.companyId) {
      whereClause.companyId = params.companyId;
    }

    if (tenantId) {
      whereClause.tenantId = tenantId;
    }

    if (paymentMethod) {
      whereClause.paymentMethod = { in: [paymentMethod, paymentMethod.toLowerCase(), paymentMethod.toUpperCase()] };
    }

    if (status) {
      whereClause.status = { in: [status, status.toLowerCase(), status.toUpperCase()] };
    }

    if (startDate || endDate) {
      whereClause.paidDate = {};
      if (startDate) whereClause.paidDate.gte = startDate;
      if (endDate) whereClause.paidDate.lte = endDate;
    }

    const skip = (page - 1) * limit;

    let orderBy: any = { paidDate: sortOrder };
    if (sortBy === 'amount') orderBy = { amount: sortOrder };

    const [payments, totalRecords, allPayments] = await Promise.all([
      prisma.rentPayment.findMany({
        where: whereClause,
        include: {
          tenant: true,
          property: true,
          unit: true,
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.rentPayment.count({ where: whereClause }),
      prisma.rentPayment.findMany({
        where: whereClause,
      }),
    ]);

    let totalCollectedAmount = 0;
    const methodMap: Record<string, number> = {};

    allPayments.forEach((p: any) => {
      if (['Paid', 'PartiallyPaid', 'Cleared'].includes(p.status) || !p.status) {
        const amt = Number(p.amount || 0);
        totalCollectedAmount += amt;
      }
      const m = p.paymentMethod || 'ACH';
      methodMap[m] = (methodMap[m] || 0) + 1;
    });

    // If rentPayment is empty, aggregate paid invoices
    if (allPayments.length === 0) {
      const paidInvoices = await prisma.invoice.findMany({
        where: {
          propertyId: { in: activePropertyIds },
          status: { in: ['Paid', 'Partially Paid'] },
        },
      });

      paidInvoices.forEach((inv) => {
        totalCollectedAmount += Number(inv.paidAmount || inv.amount || 0);
      });
    }

    const averageTransaction = allPayments.length > 0
      ? Math.round(totalCollectedAmount / allPayments.length)
      : 0;

    return {
      payments,
      totalRecords,
      summary: {
        totalCollectedAmount,
        totalTransactions: totalRecords || allPayments.length,
        averageTransaction,
        methodMap,
      },
    };
  }

  // Exports Tracking
  private static inMemoryExports: any[] = [];

  async createExport(data: any) {
    try {
      if ((prisma as any).reportExport) {
        return await (prisma as any).reportExport.create({ data });
      }
    } catch (e) {
      console.warn('DB reportExport create failed, using in-memory store:', e);
    }
    const newEntry = {
      id: `exp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    ReportRepository.inMemoryExports.unshift(newEntry);
    return newEntry;
  }

  async saveExport(data: any) {
    return this.createExport(data);
  }

  async getExports(companyId: string, userId: string, page: number, limit: number) {
    try {
      if ((prisma as any).reportExport) {
        const skip = (page - 1) * limit;
        const [exports, totalRecords] = await Promise.all([
          (prisma as any).reportExport.findMany({
            where: companyId ? { OR: [{ companyId }, { companyId: null }] } : {},
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          (prisma as any).reportExport.count({
            where: companyId ? { OR: [{ companyId }, { companyId: null }] } : {},
          }),
        ]);
        if (exports && exports.length > 0) {
          return { exports, totalRecords };
        }
      }
    } catch (e) {
      console.warn('DB reportExport findMany failed, returning in-memory store:', e);
    }

    const filtered = ReportRepository.inMemoryExports.filter(
      (item) => !companyId || !item.companyId || item.companyId === companyId
    );
    const skip = (page - 1) * limit;
    const paginated = filtered.slice(skip, skip + limit);
    return { exports: paginated, totalRecords: filtered.length };
  }

  async updateExportStatus(
    id: string,
    status: 'Pending' | 'Processing' | 'Completed' | 'Failed',
    fileUrl?: string,
    errorMessage?: string
  ) {
    try {
      if ((prisma as any).reportExport) {
        return await (prisma as any).reportExport.update({
          where: { id },
          data: {
            status,
            fileUrl,
            errorMessage,
          },
        });
      }
    } catch (e) {
      console.warn('DB reportExport update failed, updating in-memory store:', e);
    }

    const item = ReportRepository.inMemoryExports.find((x) => x.id === id);
    if (item) {
      item.status = status;
      if (fileUrl) item.fileUrl = fileUrl;
      if (errorMessage) item.errorMessage = errorMessage;
      item.updatedAt = new Date();
    }
    return item;
  }
}
