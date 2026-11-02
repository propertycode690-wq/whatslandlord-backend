import { ReportRepository } from '../repositories/report.repository';
import prisma from '../../config/database';
import { AppError } from '../../utils/appError';

export class ReportService {
  private reportRepository: ReportRepository;

  constructor() {
    this.reportRepository = new ReportRepository();
  }

  // Helper: Resolve Allowed Property IDs for a User (Strict Manager Isolation)
  async resolveAllowedProperties(user: any, companyId?: string): Promise<string[]> {
    if (!user) {
      throw new AppError('Unauthorized access.', 401, 'UNAUTHORIZED');
    }

    const userRole = (user.roleName || user.role || (user.role && user.role.name) || '').toString();

    // 1. Check explicit UserAssignments for the manager/user
    const assignments = await prisma.userAssignment.findMany({
      where: {
        userId: user.id,
      },
      select: { propertyId: true },
    });
    const assignedIds = assignments
      .map((a) => a.propertyId)
      .filter((id): id is string => Boolean(id));

    if (assignedIds.length > 0) {
      const activeProps = await prisma.property.findMany({
        where: {
          id: { in: assignedIds },
          status: { notIn: ['Inactive', 'Deleted'] },
        },
        select: { id: true },
      });
      return activeProps.map((p) => p.id);
    }

    // 2. Filter by Company ID if manager has a companyId
    const targetCompanyId = companyId || user?.companyId;
    if (targetCompanyId) {
      const companyProperties = await prisma.property.findMany({
        where: {
          companyId: targetCompanyId,
          status: { notIn: ['Inactive', 'Deleted'] },
        },
        select: { id: true },
      });
      if (companyProperties.length > 0) {
        return companyProperties.map((p) => p.id);
      }
    }

    // 3. Filter by Owner ID if user is a property owner
    const ownerProperties = await prisma.property.findMany({
      where: {
        ownerId: user.id,
        status: { notIn: ['Inactive', 'Deleted'] },
      },
      select: { id: true },
    });
    if (ownerProperties.length > 0) {
      return ownerProperties.map((p) => p.id);
    }

    // 4. SuperAdmin or Admin role can view all properties
    if (userRole === 'SuperAdmin' || userRole === 'Admin') {
      const allProps = await prisma.property.findMany({
        where: {
          status: { notIn: ['Inactive', 'Deleted'] },
        },
        select: { id: true },
      });
      return allProps.map((p) => p.id);
    }

    // 5. Fallback for single-manager DB setups
    const properties = await prisma.property.findMany({
      where: {
        status: { notIn: ['Inactive', 'Deleted'] },
      },
      select: { id: true },
    });
    return properties.map((p) => p.id);
  }

  // 1. Rent Roll
  async getRentRoll(user: any, query: any) {
    const companyId = user.companyId;
    const allowedProperties = await this.resolveAllowedProperties(user, companyId);
    
    if (!companyId || allowedProperties.length === 0) {
      return {
        data: [],
        summary: { totalMonthlyRent: 0, totalSecurityDeposits: 0, occupiedCount: 0, vacantCount: 0, totalUnits: 0 },
        pagination: { page: 1, limit: 50, totalRecords: 0, totalPages: 0 },
      };
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;

    const result = await this.reportRepository.getRentRollData({
      companyId,
      propertyIds: allowedProperties,
      propertyId: query.propertyId,
      unitId: query.unitId,
      tenantId: query.tenantId,
      leaseStatus: query.status,
      search: query.search,
      page,
      limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    let leases = result.leases;
    let unitsFallback: any[] = [];
    if (leases.length === 0) {
      unitsFallback = await prisma.unit.findMany({
        where: {
          propertyId: { in: query.propertyId ? [query.propertyId] : allowedProperties },
          ...(query.unitId ? { id: query.unitId } : {}),
          ...(query.tenantId ? { tenants: { some: { id: query.tenantId } } } : {}),
        },
        include: { property: true, tenants: true },
      });
    }

    let data: any[] = [];
    if (leases.length > 0) {
      data = leases.map((l) => ({
        id: l.id,
        propertyId: l.propertyId,
        unitId: l.unitId,
        tenantId: l.tenantId,
        propertyName: l.property?.name || 'Property',
        unitNumber: l.unit?.unitNumber ? (l.unit.unitNumber.toString().trim().toLowerCase().startsWith('unit') ? l.unit.unitNumber.toString().trim() : `Unit ${l.unit.unitNumber.toString().trim()}`) : 'Unit 101',
        tenantName: l.tenant ? `${l.tenant.firstName} ${l.tenant.lastName}` : 'Resident',
        startDate: l.startDate ? new Date(l.startDate).toISOString().split('T')[0] : 'N/A',
        endDate: l.endDate ? new Date(l.endDate).toISOString().split('T')[0] : 'N/A',
        leaseStatus: l.status || 'Active',
        monthlyRent: Number(l.rentAmount || l.unit?.rentAmount || 0),
        securityDeposit: Number(l.depositAmount || l.unit?.securityDeposit || 0),
        unitStatus: l.unit?.status || (l.status === 'Active' ? 'Occupied' : 'Vacant'),
      }));
    } else {
      data = unitsFallback.map((u) => {
        const tenantObj = u.tenants && u.tenants.length > 0 ? u.tenants[0] : null;
        return {
          tenantId: tenantObj ? tenantObj.id : null,
          propertyId: u.propertyId,
          unitId: u.id,
          propertyName: u.property?.name || 'Property',
          unitNumber: u.unitNumber ? (u.unitNumber.toString().trim().toLowerCase().startsWith('unit') ? u.unitNumber.toString().trim() : `Unit ${u.unitNumber.toString().trim()}`) : 'Unit 101',
          tenantName: tenantObj ? `${tenantObj.firstName} ${tenantObj.lastName}` : (u.status === 'Occupied' ? 'Tenant Assigned' : 'Vacant'),
          startDate: u.createdAt ? new Date(u.createdAt).toISOString().split('T')[0] : 'N/A',
          endDate: 'N/A',
          leaseStatus: u.status === 'Occupied' ? 'Active' : 'Vacant',
          monthlyRent: Number(u.rentAmount || 0),
          securityDeposit: Number(u.securityDeposit || 0),
          unitStatus: u.status || 'Vacant',
        };
      });
    }

    const totalMonthlyRent = result.summary?.totalMonthlyRent ?? data.reduce((sum, item) => sum + item.monthlyRent, 0);
    const totalSecurityDeposits = result.summary?.totalSecurityDeposits ?? data.reduce((sum, item) => sum + item.securityDeposit, 0);
    const occupiedCount = result.summary?.occupiedCount ?? data.filter((item) => item.unitStatus === 'Occupied' || item.leaseStatus === 'Active').length;
    const vacantCount = result.summary?.vacantCount ?? Math.max(0, data.length - occupiedCount);

    return {
      data,
      summary: {
        totalMonthlyRent,
        totalSecurityDeposits,
        occupiedCount,
        vacantCount,
        totalUnits: result.summary?.totalUnits || data.length,
      },
      pagination: {
        page,
        limit,
        totalRecords: result.totalRecords || data.length,
        totalPages: Math.ceil((result.totalRecords || data.length) / limit) || (data.length > 0 ? 1 : 0),
      },
    };
  }

  // 2. Occupancy Report
  async getOccupancy(user: any, query: any) {
    const companyId = user.companyId;
    const allowedProperties = await this.resolveAllowedProperties(user, companyId);

    if (!companyId || allowedProperties.length === 0) {
      return {
        data: [],
        summary: { portfolioTotalUnits: 0, portfolioOccupiedUnits: 0, portfolioVacantUnits: 0, portfolioMaintenanceUnits: 0, overallOccupancyPercentage: 0, totalProperties: 0 },
        pagination: { page: 1, limit: 50, totalRecords: 0, totalPages: 0 },
      };
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;

    const result = await this.reportRepository.getOccupancyData({
      companyId,
      propertyIds: allowedProperties,
      propertyId: query.propertyId,
      page,
      limit,
    });

    const data = (result.properties as any[]).map((p: any) => {
      const validUnits = (p.units || []);
      const totalUnits = validUnits.length;
      let occupiedUnits = 0;
      let maintenanceUnits = 0;
      let vacantUnits = 0;

      validUnits.forEach((u: any) => {
        if (u.status === 'Occupied') occupiedUnits++;
        else if (u.status === 'UnderMaintenance') maintenanceUnits++;
        else vacantUnits++;
      });

      const occupancyPercentage = totalUnits > 0 ? parseFloat(((occupiedUnits / totalUnits) * 100).toFixed(1)) : 0.0;

      return {
        propertyId: p.id,
        propertyName: p.name,
        totalUnits,
        occupiedUnits,
        vacantUnits,
        maintenanceUnits,
        occupancyPercentage,
      };
    });

    return {
      data,
      summary: result.summary || {
        portfolioTotalUnits: 0,
        portfolioOccupiedUnits: 0,
        portfolioVacantUnits: 0,
        portfolioMaintenanceUnits: 0,
        overallOccupancyPercentage: 0,
        totalProperties: result.totalRecords,
      },
      pagination: {
        page,
        limit,
        totalRecords: result.totalRecords,
        totalPages: Math.ceil(result.totalRecords / limit) || (data.length > 0 ? 1 : 0),
      },
    };
  }

  // 3. Delinquency Report
  async getDelinquency(user: any, query: any) {
    const companyId = user.companyId;
    const allowedProperties = await this.resolveAllowedProperties(user, companyId);

    if (!companyId || allowedProperties.length === 0) {
      return {
        data: [],
        summary: { totalDelinquentBalance: 0, totalOriginalAmount: 0, totalDelinquentTenants: 0, totalDelinquentInvoices: 0, averageDaysLate: 0 },
        pagination: { page: 1, limit: 50, totalRecords: 0, totalPages: 0 },
      };
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;

    const result = await this.reportRepository.getDelinquencyData({
      companyId,
      propertyIds: allowedProperties,
      propertyId: query.propertyId,
      tenantId: query.tenantId,
      status: query.status,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      page,
      limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const today = new Date().getTime();

    // Filter out Paid invoices so ONLY delinquent/unpaid/overdue invoices are returned
    const delinquentInvoices = result.invoices.filter((inv) => {
      if (query.status) return true;
      const statusLower = (inv.status || '').toLowerCase();
      const isPaid = statusLower === 'paid' || statusLower === 'cleared';
      return !isPaid;
    });

    const data = delinquentInvoices.map((inv) => {
      const dueDateMs = inv.dueDate ? new Date(inv.dueDate).getTime() : today;
      const diffTime = Math.max(0, today - dueDateMs);
      const daysLate = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      const rentAmount = Number(inv.amount || 0);
      const paidAmount = Number(inv.paidAmount || 0);
      const outstandingBalance = Number(inv.balance ?? Math.max(0, rentAmount - paidAmount));

      return {
        invoiceId: inv.id,
        tenantId: inv.tenantId,
        propertyId: inv.propertyId,
        tenantName: inv.tenant ? `${inv.tenant.firstName} ${inv.tenant.lastName}` : (inv.tenantName || 'Resident'),
        propertyName: inv.propertyName || 'Property',
        unitNumber: inv.unitNumber || 'Unit 101',
        dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : 'N/A',
        rentAmount,
        paidAmount,
        outstandingBalance,
        daysLate,
        paymentStatus: inv.status || 'Overdue',
      };
    });

    return {
      data,
      summary: result.summary || {
        totalDelinquentBalance: 0,
        totalOriginalAmount: 0,
        totalDelinquentTenants: 0,
        totalDelinquentInvoices: 0,
        averageDaysLate: 0,
      },
      pagination: {
        page,
        limit,
        totalRecords: result.totalRecords,
        totalPages: Math.ceil(result.totalRecords / limit) || (data.length > 0 ? 1 : 0),
      },
    };
  }

  // 4. Profit & Loss Report
  async getProfitLoss(user: any, query: any) {
    const companyId = user?.companyId;
    let allowedProperties = await this.resolveAllowedProperties(user, companyId);
    if (allowedProperties.length === 0) {
      const allProps = await prisma.property.findMany({ select: { id: true } });
      allowedProperties = allProps.map((p) => p.id);
    }

    const targetPropIds = query.propertyId ? [query.propertyId] : allowedProperties;
    const propertyFilter = targetPropIds.length > 0 ? { propertyId: { in: targetPropIds } } : {};

    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    const lines = await this.reportRepository.getProfitLossData({
      companyId,
      propertyIds: allowedProperties,
      propertyId: query.propertyId,
      startDate,
      endDate,
    });

    const incomeMap: Record<string, number> = {};
    const expensesMap: Record<string, number> = {};

    lines.forEach((l) => {
      const category = l.account?.accountName || 'Rental Revenue';
      const type = l.account?.type || 'Revenue';
      const amount = l.credit - l.debit;

      if (type === 'Revenue') {
        incomeMap[category] = (incomeMap[category] || 0) + amount;
      } else if (type === 'Expense') {
        const expAmount = l.debit - l.credit;
        expensesMap[category] = (expensesMap[category] || 0) + expAmount;
      }
    });

    const transactions: any[] = [];

    if (Object.keys(incomeMap).length === 0 && Object.keys(expensesMap).length === 0) {
      const [payments, invoices, workOrders, serviceRequests] = await Promise.all([
        prisma.rentPayment.findMany({
          where: {
            ...propertyFilter,
            status: 'Paid',
            ...(startDate || endDate
              ? {
                  paidDate: {
                    ...(startDate ? { gte: startDate } : {}),
                    ...(endDate ? { lte: endDate } : {}),
                  },
                }
              : {}),
          },
          include: { property: true, tenant: true },
        }),
        prisma.invoice.findMany({
          where: {
            ...propertyFilter,
            status: { in: ['Paid', 'Partially Paid'] },
          },
        }),
        prisma.workOrder.findMany({
          where: propertyFilter,
          include: { property: true },
        }),
        prisma.serviceRequest.findMany({
          where: propertyFilter,
        }),
      ]);

      // 1. Process Paid Invoices / Rent Payments as Income Transactions
      let rentalRevenue = 0;
      const seenPaymentIds = new Set<string>();

      invoices.forEach((inv) => {
        const amt = Number(inv.paidAmount > 0 ? inv.paidAmount : inv.amount || 0);
        if (amt > 0) {
          rentalRevenue += amt;
          seenPaymentIds.add(inv.id);
          transactions.push({
            id: inv.id,
            date: inv.dueDate ? (inv.dueDate.includes('T') ? inv.dueDate.split('T')[0] : inv.dueDate) : (inv.createdAt ? inv.createdAt.toISOString().split('T')[0] : 'N/A'),
            description: `Rent payment - ${inv.tenantName || 'Tenant'}`,
            propertyName: inv.propertyName || 'Property',
            unitNumber: inv.unitNumber ? (inv.unitNumber.toString().trim().toLowerCase().startsWith('unit') ? inv.unitNumber.toString().trim() : `Unit ${inv.unitNumber.toString().trim()}`) : '',
            category: 'Rental Revenue',
            type: 'Income',
            amount: amt,
          });
        }
      });

      // Include any rent payments not covered by invoices
      payments.forEach((p) => {
        if (!seenPaymentIds.has(p.id)) {
          const amt = Number(p.amount || 0);
          if (amt > 0) {
            transactions.push({
              id: p.id,
              date: p.paidDate ? p.paidDate.toISOString().split('T')[0] : (p.dueDate ? p.dueDate.toISOString().split('T')[0] : 'N/A'),
              description: `Rent payment - ${p.tenant ? `${p.tenant.firstName} ${p.tenant.lastName}` : 'Tenant'}`,
              propertyName: p.property?.name || 'Property',
              unitNumber: p.unitId || '',
              category: 'Rental Revenue',
              type: 'Income',
              amount: amt,
            });
          }
        }
      });

      if (rentalRevenue > 0) {
        incomeMap['Rental Revenue'] = rentalRevenue;
      }

      // 2. Process Service Requests & Work Orders as Expense Transactions
      let totalMaintenance = 0;
      serviceRequests.forEach((sr: any) => {
        const cost = Number(sr.cost || sr.estimatedCost || 0);
        if (cost > 0) {
          totalMaintenance += cost;
          transactions.push({
            id: sr.id,
            date: sr.createdAt ? sr.createdAt.toISOString().split('T')[0] : 'N/A',
            description: sr.title || 'Property Maintenance',
            propertyName: sr.propertyName || 'Property',
            unitNumber: sr.unitNumber ? (sr.unitNumber.toString().trim().toLowerCase().startsWith('unit') ? sr.unitNumber.toString().trim() : `Unit ${sr.unitNumber.toString().trim()}`) : '',
            category: 'Property Maintenance & Repairs',
            type: 'Expense',
            amount: cost,
          });
        }
      });

      workOrders.forEach((wo: any) => {
        const cost = Number(wo.actualCost || wo.cost || wo.estimatedCost || 0);
        if (cost > 0) {
          totalMaintenance += cost;
          transactions.push({
            id: wo.id,
            date: wo.createdAt ? wo.createdAt.toISOString().split('T')[0] : 'N/A',
            description: wo.title || 'Work Order Repair',
            propertyName: wo.property?.name || 'Property',
            unitNumber: wo.unitNumber || '',
            category: 'Property Maintenance & Repairs',
            type: 'Expense',
            amount: cost,
          });
        }
      });

      if (totalMaintenance > 0) {
        expensesMap['Property Maintenance & Repairs'] = totalMaintenance;
      }
    }

    // Sort transactions date descending
    transactions.sort((a, b) => {
      const dateA = a.date && a.date !== 'N/A' ? new Date(a.date).getTime() : 0;
      const dateB = b.date && b.date !== 'N/A' ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    const income = Object.keys(incomeMap).map((k) => ({ name: k, amount: incomeMap[k] }));
    const expenses = Object.keys(expensesMap).map((k) => ({ name: k, amount: expensesMap[k] }));

    const totalIncome = income.reduce((acc, curr) => acc + curr.amount, 0);
    const totalExpenses = expenses.reduce((acc, curr) => acc + curr.amount, 0);
    const netProfit = totalIncome - totalExpenses;

    return {
      data: {
        income,
        expenses,
        transactions,
        summary: {
          totalIncome,
          totalExpenses,
          netProfit,
        },
      },
      transactions,
      summary: {
        totalIncome,
        totalExpenses,
        netProfit,
      },
      pagination: {
        page: 1,
        limit: transactions.length || 50,
        totalRecords: transactions.length,
        totalPages: 1,
      },
    };
  }

  // 5. Maintenance Report
  async getMaintenance(user: any, query: any) {
    const companyId = user.companyId;
    const allowedProperties = await this.resolveAllowedProperties(user, companyId);

    if (!companyId || allowedProperties.length === 0) {
      return {
        data: [],
        summary: { totalWorkOrders: 0, totalEstimatedCost: 0, totalActualCost: 0, completedCount: 0, inProgressCount: 0, openCount: 0, completionRate: 0 },
        pagination: { page: 1, limit: 50, totalRecords: 0, totalPages: 0 },
      };
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;

    const result = await this.reportRepository.getMaintenanceData({
      companyId,
      propertyIds: allowedProperties,
      propertyId: query.propertyId,
      status: query.status,
      priority: query.priority,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      page,
      limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const data = result.workOrders.map((w: any, idx: number) => {
      const est = Number(w.estimatedCost || 0);
      const act = Number(w.actualCost || w.cost || est);
      const st = w.status || 'Open';

      return {
        workOrderId: w.id,
        propertyId: w.propertyId,
        ticketId: w.ticketId || `WO-${1001 + idx}`,
        propertyName: w.property?.name || w.propertyName || 'Property',
        unitNumber: w.unitNumber || 'Unit 101',
        issue: w.title,
        priority: w.priority || 'Medium',
        status: st,
        assignedPerson: w.vendor?.contactName || w.assignedTechnician || 'Unassigned',
        vendor: w.vendor?.companyName || w.vendorName || 'Unassigned',
        estimatedCost: est,
        actualCost: act,
        createdDate: w.createdAt ? new Date(w.createdAt).toISOString().split('T')[0] : 'N/A',
        completedDate: (st === 'Completed' || st === 'Closed') ? (w.updatedAt ? new Date(w.updatedAt).toISOString().split('T')[0] : 'N/A') : null,
      };
    });

    return {
      data,
      summary: result.summary || {
        totalWorkOrders: result.totalRecords,
        totalEstimatedCost: 0,
        totalActualCost: 0,
        completedCount: 0,
        inProgressCount: 0,
        openCount: 0,
        completionRate: 0,
      },
      pagination: {
        page,
        limit,
        totalRecords: result.totalRecords,
        totalPages: Math.ceil(result.totalRecords / limit) || (data.length > 0 ? 1 : 0),
      },
    };
  }

  // 6. Payment History
  async getPaymentHistory(user: any, query: any) {
    const companyId = user.companyId;
    const allowedProperties = await this.resolveAllowedProperties(user, companyId);

    if (!companyId || allowedProperties.length === 0) {
      return {
        data: [],
        summary: { totalCollectedAmount: 0, totalTransactions: 0, averageTransaction: 0, topMethod: 'N/A' },
        pagination: { page: 1, limit: 50, totalRecords: 0, totalPages: 0 },
      };
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;

    const result = await this.reportRepository.getPaymentHistoryData({
      companyId,
      propertyIds: allowedProperties,
      propertyId: query.propertyId,
      tenantId: query.tenantId,
      paymentMethod: query.paymentMethod,
      status: query.status,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      page,
      limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    let data: any[] = result.payments.map((p: any, idx: number) => ({
      paymentId: p.id,
      tenantId: p.tenantId,
      propertyId: p.propertyId,
      receiptNo: `#${idx + 1}`,
      tenantName: p.tenant ? `${p.tenant.firstName} ${p.tenant.lastName}` : (p.tenantName || 'Resident'),
      propertyName: p.property?.name || p.propertyName || 'Property',
      unitNumber: p.unit?.unitNumber
        ? (String(p.unit.unitNumber).trim().toLowerCase().startsWith('unit') ? String(p.unit.unitNumber).trim() : `Unit ${p.unit.unitNumber}`)
        : (p.unitNumber || 'Unassigned'),
      paymentDate: p.paidDate ? new Date(p.paidDate).toISOString().split('T')[0] : (p.createdAt ? new Date(p.createdAt).toISOString().split('T')[0] : 'N/A'),
      amount: Number(p.amount || 0),
      paymentMethod: p.paymentMethod || 'ACH',
      referenceNumber: p.referenceNumber || `#REF-${1001 + idx}`,
      paymentStatus: p.status || 'Paid',
    }));

    if (data.length === 0) {
      const paidInvoices = await prisma.invoice.findMany({
        where: {
          companyId,
          propertyId: { in: query.propertyId ? [query.propertyId] : allowedProperties },
          status: { in: ['Paid', 'Partially Paid'] },
        },
        include: { tenant: true },
      });

      data = paidInvoices.map((inv, idx) => ({
        invoiceId: inv.id,
        tenantId: inv.tenantId,
        propertyId: inv.propertyId,
        receiptNo: `#INV-${1001 + idx}`,
        tenantName: inv.tenant ? `${inv.tenant.firstName} ${inv.tenant.lastName}` : (inv.tenantName || 'Resident'),
        propertyName: inv.propertyName || 'Property',
        unitNumber: inv.unitNumber || 'Unassigned',
        paymentDate: inv.updatedAt ? new Date(inv.updatedAt).toISOString().split('T')[0] : 'N/A',
        amount: Number(inv.paidAmount || inv.amount || 0),
        paymentMethod: 'Bank Transfer',
        referenceNumber: `#INV-REF-${inv.id.substring(0, 6)}`,
        paymentStatus: 'Paid',
      }));
    }

    let totalCollectedAmount = 0;
    const methodCounts: Record<string, number> = {};

    data.forEach((p) => {
      if (['Paid', 'Partially Paid', 'PartiallyPaid', 'Cleared'].includes(p.paymentStatus) || !p.paymentStatus) {
        totalCollectedAmount += p.amount;
      }
      const method = p.paymentMethod || 'ACH';
      methodCounts[method] = (methodCounts[method] || 0) + 1;
    });

    let topMethod = 'ACH';
    let maxCount = 0;
    Object.entries(methodCounts).forEach(([m, count]) => {
      if (count > maxCount) {
        maxCount = count;
        topMethod = m;
      }
    });

    const averageTransaction = data.length > 0 ? Math.round(totalCollectedAmount / data.length) : 0;

    return {
      data,
      summary: {
        totalCollectedAmount: result.summary?.totalCollectedAmount || totalCollectedAmount,
        totalTransactions: result.summary?.totalTransactions || data.length,
        averageTransaction: result.summary?.averageTransaction || averageTransaction,
        topMethod,
      },
      pagination: {
        page,
        limit,
        totalRecords: result.totalRecords || data.length,
        totalPages: Math.ceil((result.totalRecords || data.length) / limit) || (data.length > 0 ? 1 : 0),
      },
    };
  }

  // Exports tracking
  async createExport(user: any, body: any) {
    const companyId = user.companyId;
    return this.reportRepository.createExport({
      companyId,
      userId: user.id,
      reportType: body.reportType,
      filters: JSON.stringify(body.filters),
      fileName: body.fileName,
      fileType: body.fileType,
      status: 'Pending',
    });
  }

  async getExports(user: any, query: any) {
    const companyId = user.companyId;
    if (!companyId) return { exports: [], totalRecords: 0 };

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    return this.reportRepository.getExports(companyId, user.id, page, limit);
  }
}
export const reportService = new ReportService();
