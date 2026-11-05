import { ReportRepository } from '../repositories/report.repository';
import prisma from '../../config/database';
import { AppError } from '../../utils/appError';

export class ReportService {
  private reportRepository: ReportRepository;

  constructor() {
    this.reportRepository = new ReportRepository();
  }

  // Helper: Resolve Allowed Property IDs for a User (Strict Manager Isolation + Soft-Delete Exclusion)
  async resolveAllowedProperties(user: any, companyId?: string): Promise<string[]> {
    if (!user) {
      throw new AppError('Unauthorized access.', 401, 'UNAUTHORIZED');
    }

    const userRole = (user.roleName || user.role || (user.role && user.role.name) || '').toString();
    const softDeleted = await this.reportRepository.getSoftDeletedIds(companyId || user?.companyId);
    const excludeDeletedProps = softDeleted.properties;

    const filterActiveIds = (props: { id: string }[]) =>
      props.map((p) => p.id).filter((id) => !excludeDeletedProps.includes(id));

    // 1. Check explicit UserAssignments for the manager/user
    const assignments = await prisma.userAssignment.findMany({
      where: {
        userId: user.id,
      },
      select: { propertyId: true },
    });
    const assignedIds = assignments
      .map((a) => a.propertyId)
      .filter((id): id is string => Boolean(id) && !excludeDeletedProps.includes(id as string));

    if (assignedIds.length > 0) {
      const activeProps = await prisma.property.findMany({
        where: {
          id: { in: assignedIds },
          status: { notIn: ['Inactive', 'Deleted', 'Draft'] },
        },
        select: { id: true },
      });
      return filterActiveIds(activeProps);
    }

    // 2. Filter by Company ID if manager has a companyId
    const targetCompanyId = companyId || user?.companyId;
    if (targetCompanyId) {
      const companyProperties = await prisma.property.findMany({
        where: {
          companyId: targetCompanyId,
          status: { notIn: ['Inactive', 'Deleted', 'Draft'] },
        },
        select: { id: true },
      });
      const filtered = filterActiveIds(companyProperties);
      if (filtered.length > 0) {
        return filtered;
      }
    }

    // 3. Filter by Owner ID if user is a property owner
    const ownerProperties = await prisma.property.findMany({
      where: {
        ownerId: user.id,
        status: { notIn: ['Inactive', 'Deleted', 'Draft'] },
      },
      select: { id: true },
    });
    const filteredOwnerProps = filterActiveIds(ownerProperties);
    if (filteredOwnerProps.length > 0) {
      return filteredOwnerProps;
    }

    // 4. SuperAdmin or Admin role can view all properties
    if (userRole === 'SuperAdmin' || userRole === 'Admin') {
      const allProps = await prisma.property.findMany({
        where: {
          status: { notIn: ['Inactive', 'Deleted', 'Draft'] },
        },
        select: { id: true },
      });
      return filterActiveIds(allProps);
    }

    // 5. Fallback for single-manager DB setups
    const properties = await prisma.property.findMany({
      where: {
        status: { notIn: ['Inactive', 'Deleted', 'Draft'] },
      },
      select: { id: true },
    });
    return filterActiveIds(properties);
  }

  // 1. Rent Roll
  async getRentRoll(user: any, query: any) {
    const companyId = user?.companyId;
    const allowedProperties = await this.resolveAllowedProperties(user, companyId);

    if (allowedProperties.length === 0) {
      return {
        data: [],
        summary: {
          totalMonthlyRent: 0,
          totalPotentialRent: 0,
          totalVacancyLoss: 0,
          totalSecurityDeposits: 0,
          occupiedCount: 0,
          vacantCount: 0,
          totalUnits: 0,
        },
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
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      search: query.search,
      page,
      limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const units = result.units || [];
    const data = units.map((u: any) => {
      const validLeases = Array.isArray(u.leases) ? u.leases : [];
      const activeLease = validLeases.find((l: any) => l.status === 'Active') || null;
      // If user explicitly filtered by a non-active lease status (e.g. Expired/Terminated/Draft), show that lease's info in the row, but only count Active leases as Occupied/earning rent
      const displayLease = activeLease || (query.status && validLeases.length > 0 ? validLeases[0] : null);

      const validTenants = Array.isArray(u.tenants) ? u.tenants.filter((t: any) => t && t.status === 'Active') : [];
      const tenantObj = displayLease?.tenant || (validTenants.length > 0 ? validTenants[0] : null);

      // Strict Occupancy Rule: Must have an Active Lease OR (Unit is marked Occupied AND has an Active Tenant)
      const isOccupied = Boolean(activeLease) || (u.status === 'Occupied' && validTenants.length > 0);

      const tenantName = isOccupied && tenantObj
        ? `${tenantObj.firstName || ''} ${tenantObj.lastName || ''}`.trim()
        : (displayLease && tenantObj ? `${tenantObj.firstName || ''} ${tenantObj.lastName || ''}`.trim() : 'Vacant');

      const leaseStatus = activeLease
        ? 'Active'
        : (displayLease?.status ? displayLease.status : (isOccupied ? 'Active' : 'Vacant'));

      const unitStatus = isOccupied ? 'Occupied' : (u.status && u.status !== 'Occupied' ? u.status : 'Vacant');

      const unitMarketRent = Number(u.rentAmount || 0);
      const activeRent = activeLease ? Number(activeLease.rentAmount ?? unitMarketRent) : unitMarketRent;

      const potentialRent = isOccupied ? activeRent : unitMarketRent;
      const monthlyRent = isOccupied ? activeRent : 0;
      const vacancyLoss = isOccupied ? 0 : unitMarketRent;
      const securityDeposit = isOccupied
        ? Number(activeLease ? (activeLease.depositAmount ?? u.securityDeposit ?? 0) : (u.securityDeposit ?? 0))
        : 0;

      const startDate = displayLease?.startDate
        ? new Date(displayLease.startDate).toISOString().split('T')[0]
        : 'N/A';
      const endDate = displayLease?.endDate
        ? new Date(displayLease.endDate).toISOString().split('T')[0]
        : 'N/A';

      let daysToExpiry = 'N/A';
      let daysToExpiryNum: number | null = null;
      if (displayLease?.endDate && (isOccupied || displayLease.status === 'Expired')) {
        const endD = new Date(displayLease.endDate);
        endD.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((endD.getTime() - todayMs) / (1000 * 60 * 60 * 24));
        daysToExpiryNum = diffDays;
        if (diffDays < 0) {
          daysToExpiry = `Expired (${Math.abs(diffDays)}d ago)`;
        } else if (diffDays === 0) {
          daysToExpiry = 'Expires Today';
        } else {
          daysToExpiry = `${diffDays} Days`;
        }
      }

      const rawUnitNum = u.unitNumber ? u.unitNumber.toString().trim() : '101';
      const unitNumber = rawUnitNum.toLowerCase().startsWith('unit') ? rawUnitNum : `Unit ${rawUnitNum}`;

      return {
        id: displayLease?.id || u.id,
        leaseId: displayLease?.id || null,
        propertyId: u.propertyId,
        unitId: u.id,
        tenantId: tenantObj?.id || null,
        propertyName: u.property?.name || 'Property',
        unitNumber,
        tenantName,
        startDate,
        endDate,
        daysToExpiry,
        daysToExpiryNum,
        leaseStatus,
        potentialRent,
        monthlyRent,
        vacancyLoss,
        securityDeposit,
        unitStatus,
      };
    });

    // Support sorting by computed columns like daysToExpiryNum, potentialRent, monthlyRent, vacancyLoss
    if (query.sortBy === 'daysToExpiry') {
      const dir = query.sortOrder === 'desc' ? -1 : 1;
      data.sort((a: any, b: any) => {
        const valA = a.daysToExpiryNum !== null && a.daysToExpiryNum !== undefined ? a.daysToExpiryNum : 999999;
        const valB = b.daysToExpiryNum !== null && b.daysToExpiryNum !== undefined ? b.daysToExpiryNum : 999999;
        return (valA - valB) * dir;
      });
    } else if (query.sortBy === 'vacancyLoss') {
      const dir = query.sortOrder === 'desc' ? -1 : 1;
      data.sort((a: any, b: any) => (a.vacancyLoss - b.vacancyLoss) * dir);
    } else if (query.sortBy === 'monthlyRent') {
      const dir = query.sortOrder === 'desc' ? -1 : 1;
      data.sort((a: any, b: any) => (a.monthlyRent - b.monthlyRent) * dir);
    }

    const totalMonthlyRent = result.summary?.totalMonthlyRent ?? data.reduce((sum: number, item: any) => sum + item.monthlyRent, 0);
    const totalPotentialRent = result.summary?.totalPotentialRent ?? data.reduce((sum: number, item: any) => sum + item.potentialRent, 0);
    const totalVacancyLoss = result.summary?.totalVacancyLoss ?? data.reduce((sum: number, item: any) => sum + item.vacancyLoss, 0);
    const totalSecurityDeposits = result.summary?.totalSecurityDeposits ?? data.reduce((sum: number, item: any) => sum + item.securityDeposit, 0);
    const occupiedCount = result.summary?.occupiedCount ?? data.filter((item: any) => item.unitStatus === 'Occupied').length;
    const vacantCount = result.summary?.vacantCount ?? Math.max(0, data.length - occupiedCount);

    return {
      data,
      summary: {
        totalMonthlyRent,
        totalPotentialRent,
        totalVacancyLoss,
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
      unitId: query.unitId,
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
      const isPaid = (statusLower === 'paid' || statusLower === 'cleared') && Number(inv.balance || 0) <= 0;
      return !isPaid;
    });

    const data = delinquentInvoices.map((inv) => {
      const dueDateMs = inv.dueDate ? new Date(inv.dueDate).getTime() : today;
      const diffTime = Math.max(0, today - dueDateMs);
      const daysLate = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      const rentAmount = Number(inv.amount || 0);
      const paidAmount = Number(inv.paidAmount || 0);
      const outstandingBalance = Number(inv.balance ?? Math.max(0, rentAmount - paidAmount));
      const unitId = inv.tenant?.unitId || (inv.tenant as any)?.unit?.id || (inv as any).unitId || '';
      const unitNumber = inv.unitNumber || ((inv.tenant as any)?.unit?.unitNumber ? (String((inv.tenant as any).unit.unitNumber).trim().toLowerCase().startsWith('unit') ? String((inv.tenant as any).unit.unitNumber).trim() : `Unit ${(inv.tenant as any).unit.unitNumber}`) : 'Unit 101');

      return {
        invoiceId: inv.id,
        tenantId: inv.tenantId,
        propertyId: inv.propertyId,
        unitId,
        tenantName: inv.tenant ? `${inv.tenant.firstName} ${inv.tenant.lastName}` : (inv.tenantName || 'Resident'),
        propertyName: inv.propertyName || 'Property',
        unitNumber,
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
            ...(query.unitId ? { tenant: { unitId: query.unitId } } : {}),
            ...(query.tenantId ? { tenantId: query.tenantId } : {}),
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
          include: { property: true, tenant: true, unit: true },
        }),
        prisma.invoice.findMany({
          where: {
            ...propertyFilter,
            ...(query.unitId ? { tenant: { unitId: query.unitId } } : {}),
            ...(query.tenantId ? { tenantId: query.tenantId } : {}),
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

      // 1. Process Real Paid Rent Payments as Income Transactions
      let rentalRevenue = 0;
      const seenPaymentKeys = new Set<string>();

      payments.forEach((p) => {
        const amt = Number(p.amount || 0);
        if (amt > 0) {
          rentalRevenue += amt;
          const dateStr = p.paidDate ? p.paidDate.toISOString().split('T')[0] : (p.dueDate ? p.dueDate.toISOString().split('T')[0] : 'N/A');
          const dedupKey = `${p.tenantId || ''}_${amt}_${dateStr}`;
          seenPaymentKeys.add(dedupKey);

          transactions.push({
            id: p.id,
            date: dateStr,
            description: `Rent payment - ${p.tenant ? `${p.tenant.firstName || ''} ${p.tenant.lastName || ''}`.trim() : 'Tenant'}`,
            propertyId: p.propertyId,
            unitId: p.unitId,
            tenantId: p.tenantId,
            tenantName: p.tenant ? `${p.tenant.firstName || ''} ${p.tenant.lastName || ''}`.trim() : '',
            propertyName: p.property?.name || 'Property',
            unitNumber: p.unit?.unitNumber ? (p.unit.unitNumber.toString().trim().toLowerCase().startsWith('unit') ? p.unit.unitNumber.toString().trim() : `Unit ${p.unit.unitNumber.toString().trim()}`) : (p.unitId || ''),
            category: 'Rental Revenue',
            type: 'Income',
            amount: amt,
          });
        }
      });

      // Include any paid invoices that were not already captured by payments
      invoices.forEach((inv) => {
        const amt = Number(inv.paidAmount > 0 ? inv.paidAmount : inv.amount || 0);
        const dateStr = inv.dueDate ? (inv.dueDate.includes('T') ? inv.dueDate.split('T')[0] : inv.dueDate) : (inv.createdAt ? inv.createdAt.toISOString().split('T')[0] : 'N/A');
        const dedupKey = `${inv.tenantId || ''}_${amt}_${dateStr}`;

        if (amt > 0 && !seenPaymentKeys.has(dedupKey)) {
          rentalRevenue += amt;
          seenPaymentKeys.add(dedupKey);
          transactions.push({
            id: inv.id,
            date: dateStr,
            description: `Rent payment - ${inv.tenantName || 'Tenant'}`,
            propertyId: inv.propertyId,
            unitId: (inv as any).unitId || '',
            tenantId: inv.tenantId,
            tenantName: inv.tenantName || '',
            propertyName: inv.propertyName || 'Property',
            unitNumber: inv.unitNumber ? (inv.unitNumber.toString().trim().toLowerCase().startsWith('unit') ? inv.unitNumber.toString().trim() : `Unit ${inv.unitNumber.toString().trim()}`) : '',
            category: 'Rental Revenue',
            type: 'Income',
            amount: amt,
          });
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
      unitId: query.unitId,
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
      unitId: p.unitId || p.unit?.id || p.tenant?.unitId || '',
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
        unitId: inv.tenant?.unitId || (inv as any).unitId || '',
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
