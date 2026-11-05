import { ReportRepository } from '../repositories/report.repository';
import prisma from '../../config/database';
import { AppError } from '../../utils/appError';

export class ReportService {
  private reportRepository: ReportRepository;

  constructor() {
    this.reportRepository = new ReportRepository();
  }

  // Helper: Resolve Allowed Property IDs for a User (Strict Manager Isolation + Soft-Delete Exclusion, NO Global Fallback)
  async resolveAllowedProperties(user: any, companyId?: string): Promise<string[]> {
    if (!user) {
      throw new AppError('Unauthorized access.', 401, 'UNAUTHORIZED');
    }

    const actualUserId = user.userId || user.id;
    const targetCompanyId = companyId || user?.companyId;
    const softDeleted = await this.reportRepository.getSoftDeletedIds(targetCompanyId);
    const excludeDeletedProps = softDeleted.properties;

    const filterActiveIds = (props: { id: string }[]) =>
      props.map((p) => p.id).filter((id) => !excludeDeletedProps.includes(id));

    // 1. Check explicit UserAssignments for the manager/user
    if (actualUserId) {
      const assignments = await prisma.userAssignment.findMany({
        where: {
          userId: actualUserId,
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
            ...(targetCompanyId ? { companyId: targetCompanyId } : {}),
            status: { notIn: ['Inactive', 'Deleted', 'Draft'] },
          },
          select: { id: true },
        });
        return filterActiveIds(activeProps);
      }
    }

    // 2. Strict Company Isolation: If user belongs to a company, return ONLY that company's active properties (even if 0!)
    if (targetCompanyId) {
      const companyProperties = await prisma.property.findMany({
        where: {
          companyId: targetCompanyId,
          status: { notIn: ['Inactive', 'Deleted', 'Draft'] },
        },
        select: { id: true },
      });
      return filterActiveIds(companyProperties);
    }

    // 3. Filter by Owner ID if user is a property owner
    if (actualUserId) {
      const ownerProperties = await prisma.property.findMany({
        where: {
          ownerId: actualUserId,
          status: { notIn: ['Inactive', 'Deleted', 'Draft'] },
        },
        select: { id: true },
      });
      if (ownerProperties.length > 0) {
        return filterActiveIds(ownerProperties);
      }
    }

    // 4. No fallback! If user has no company, no assignments, and owns no properties, return empty (0 data)
    return [];
  }

  // 1. Rent Roll
  async getRentRoll(user: any, query: any) {
    const companyId = user?.companyId;
    const allowedProperties = await this.resolveAllowedProperties(user, companyId);

    if (!companyId || allowedProperties.length === 0) {
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
        ? `${tenantObj.firstName || ''} ${tenantObj.lastName || ''}`.trim() || 'N/A'
        : (displayLease && tenantObj ? `${tenantObj.firstName || ''} ${tenantObj.lastName || ''}`.trim() || 'N/A' : 'N/A');

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
    const emptyResponse = {
      data: {
        income: [],
        expenses: [],
        transactions: [],
        summary: { totalIncome: 0, totalExpenses: 0, netProfit: 0 },
      },
      transactions: [],
      summary: { totalIncome: 0, totalExpenses: 0, netProfit: 0 },
      pagination: { page: 1, limit: 50, totalRecords: 0, totalPages: 0 },
    };

    const companyId = user?.companyId;
    const allowedProperties = await this.resolveAllowedProperties(user, companyId);
    if (!companyId || allowedProperties.length === 0) {
      return emptyResponse;
    }

    const softDeleted = await this.reportRepository.getSoftDeletedIds(companyId);

    const candidatePropIds = (
      query.propertyId
        ? allowedProperties.filter((id) => id === query.propertyId)
        : allowedProperties
    ).filter((id) => !softDeleted.properties.includes(id));

    if (candidatePropIds.length === 0) {
      return emptyResponse;
    }

    // Verify properties are active and belong strictly to this company
    const activeProps = await prisma.property.findMany({
      where: {
        id: { in: candidatePropIds },
        companyId,
        status: { notIn: ['Inactive', 'Deleted', 'Draft'] },
      },
      select: { id: true, name: true },
    });

    const targetPropIds = activeProps.map((p) => p.id);
    if (targetPropIds.length === 0) {
      return emptyResponse;
    }

    const propNameMap = new Map<string, string>(activeProps.map((p) => [p.id, p.name]));

    // Fetch active units and active tenants to ensure deleted/inactive units or tenants are never calculated
    const [activeUnits, activeTenants] = await Promise.all([
      prisma.unit.findMany({
        where: {
          propertyId: { in: targetPropIds },
          ...(softDeleted.units.length > 0 ? { id: { notIn: softDeleted.units } } : {}),
        },
        select: { id: true, unitNumber: true, propertyId: true },
      }),
      prisma.tenant.findMany({
        where: {
          companyId,
          status: { not: 'Inactive' as any },
          ...(softDeleted.tenants.length > 0 ? { id: { notIn: softDeleted.tenants } } : {}),
        },
        select: { id: true, firstName: true, lastName: true, unitId: true },
      }),
    ]);

    const activeUnitIds = new Set<string>(activeUnits.map((u) => u.id));
    const activeTenantIds = new Set<string>(activeTenants.map((t) => t.id));
    const unitByIdMap = new Map(activeUnits.map((u) => [u.id, u]));

    const normalizeUnitNum = (val?: string | null) =>
      String(val || '')
        .toLowerCase()
        .replace(/^unit\s*/i, '')
        .trim();

    const formatUnitDisplay = (val?: string | null) => {
      const raw = String(val || '').trim();
      if (!raw) return 'N/A';
      return raw.toLowerCase().startsWith('unit') ? raw : `Unit ${raw}`;
    };

    const resolveUnitFromPropAndNumber = (propId?: string | null, unitNumber?: string | null) => {
      if (!propId || !unitNumber) return null;
      const targetNum = normalizeUnitNum(unitNumber);
      if (!targetNum) return null;
      return (
        activeUnits.find(
          (u) => u.propertyId === propId && normalizeUnitNum(u.unitNumber) === targetNum
        ) || null
      );
    };

    const propertyFilter = { propertyId: { in: targetPropIds } };

    const [payments, invoices, workOrders, serviceRequests] = await Promise.all([
      prisma.rentPayment
        .findMany({
          where: {
            ...propertyFilter,
            companyId,
            status: { in: ['Paid', 'PartiallyPaid'] as any },
          },
          include: { property: true, tenant: true, unit: true },
        })
        .catch(() => [] as any[]),
      prisma.invoice
        .findMany({
          where: {
            ...propertyFilter,
            companyId,
            status: { in: ['Paid', 'Partially Paid'] },
          },
        })
        .catch(() => [] as any[]),
      prisma.workOrder
        .findMany({
          where: {
            ...propertyFilter,
            companyId,
            status: { in: ['Completed', 'Closed'] as any },
          },
          include: { property: true, vendor: true },
        })
        .catch(() => [] as any[]),
      prisma.serviceRequest
        .findMany({
          where: {
            ...propertyFilter,
            companyId,
            status: { in: ['Completed', 'Closed', 'completed', 'closed'] },
          },
        })
        .catch(() => [] as any[]),
    ]);

    const activeTenantByIdMap = new Map(activeTenants.map((t) => [t.id, t]));
    const softDeletedPaymentsSet = new Set(softDeleted.payments);
    const softDeletedInvoicesSet = new Set(softDeleted.invoices);
    const softDeletedWorkOrdersSet = new Set(softDeleted.workOrders);
    const softDeletedServiceReqsSet = new Set(softDeleted.serviceRequests);
    const softDeletedLeasesSet = new Set(softDeleted.leases);

    const allTransactions: any[] = [];

    // Track total paid via RentPayment per tenant to prevent double-counting when Invoice is also marked Paid
    const remainingPaymentCreditByTenant = new Map<string, number>();

    const getTenantDedupKey = (tenantId?: string | null, tenantName?: string | null, propId?: string | null) => {
      if (tenantId) return `id:${tenantId}`;
      return `name:${String(tenantName || '').trim().toLowerCase()}_${propId || ''}`;
    };

    // 1. Process Real Paid Rent Payments (Strictly active properties, active units, active tenants)
    payments.forEach((p: any) => {
      if (!p || softDeletedPaymentsSet.has(p.id)) return;
      if (p.leaseId && softDeletedLeasesSet.has(p.leaseId)) return;
      // Skip tenant refund entries created in rent_payments
      if (p.referenceNumber && String(p.referenceNumber).toUpperCase().startsWith('REFUND-')) {
        return;
      }
      // Skip if linked unit was deleted or does not belong to active units
      const resolvedUnitId = p.unitId || p.tenant?.unitId || null;
      if (resolvedUnitId && !activeUnitIds.has(resolvedUnitId)) {
        return;
      }
      // Skip if linked tenant is inactive or soft-deleted
      if (p.tenantId && !activeTenantIds.has(p.tenantId)) {
        return;
      }
      if (p.tenant && (p.tenant as any).status === 'Inactive') {
        return;
      }

      const amt = Number(p.amount || 0);
      if (amt <= 0) return;

      const tenantObj = p.tenant || (p.tenantId ? activeTenantByIdMap.get(p.tenantId) : null);
      const tenantName = tenantObj
        ? `${tenantObj.firstName || ''} ${tenantObj.lastName || ''}`.trim()
        : '';
      const tKey = getTenantDedupKey(p.tenantId, tenantName, p.propertyId);
      remainingPaymentCreditByTenant.set(tKey, (remainingPaymentCreditByTenant.get(tKey) || 0) + amt);

      const dateObj = p.paidDate || p.dueDate;
      const dateStr = dateObj ? new Date(dateObj).toISOString().split('T')[0] : 'N/A';
      const unitObj = resolvedUnitId ? unitByIdMap.get(resolvedUnitId) : null;
      const rawUnitNum = p.unit?.unitNumber || unitObj?.unitNumber || '';

      allTransactions.push({
        id: p.id,
        date: dateStr,
        description: `Rent payment - ${tenantName || 'Tenant'}`,
        propertyId: p.propertyId,
        unitId: resolvedUnitId || '',
        tenantId: p.tenantId || '',
        tenantName: tenantName || 'N/A',
        propertyName: p.property?.name || (p.propertyId ? propNameMap.get(p.propertyId) : '') || 'Property',
        unitNumber: formatUnitDisplay(rawUnitNum),
        category: 'Rental Revenue',
        type: 'Income',
        amount: amt,
      });
    });

    // 2. Process Paid Invoices ONLY for amounts not already accounted for by RentPayment records
    invoices.forEach((inv: any) => {
      if (!inv || softDeletedInvoicesSet.has(inv.id)) return;
      if (inv.tenantId && inv.tenantId !== 'default' && !activeTenantIds.has(inv.tenantId)) {
        return;
      }
      const tenantObj = inv.tenantId ? activeTenantByIdMap.get(inv.tenantId) : null;

      const matchedUnit =
        (tenantObj?.unitId ? unitByIdMap.get(tenantObj.unitId) : null) ||
        resolveUnitFromPropAndNumber(inv.propertyId, inv.unitNumber);

      // If invoice specifies a unit or tenant unit that was deleted, skip
      if (tenantObj?.unitId && !activeUnitIds.has(tenantObj.unitId)) {
        return;
      }
      if (inv.unitNumber && !matchedUnit) {
        return;
      }

      // Skip security deposit invoices from P&L revenue (deposits are liabilities, not operating income)
      const notesLower = String(inv.notes || '').toLowerCase();
      const lineItemsLower = String(inv.lineItems || '').toLowerCase();
      if (
        (notesLower.includes('security deposit') || lineItemsLower.includes('security_deposit')) &&
        !notesLower.includes('rent') &&
        !lineItemsLower.includes('"rent"')
      ) {
        return;
      }

      const rawPaidAmt = Number(inv.paidAmount > 0 ? inv.paidAmount : inv.status === 'Paid' ? inv.amount : 0);
      if (rawPaidAmt <= 0) return;

      const tenantName =
        inv.tenantName ||
        (tenantObj ? `${tenantObj.firstName || ''} ${tenantObj.lastName || ''}`.trim() : '');
      const tKey = getTenantDedupKey(inv.tenantId, tenantName, inv.propertyId);
      const availableCredit = remainingPaymentCreditByTenant.get(tKey) || 0;

      if (availableCredit >= rawPaidAmt) {
        // Fully covered by a RentPayment record already added above
        remainingPaymentCreditByTenant.set(tKey, availableCredit - rawPaidAmt);
        return;
      }

      const unaccountedAmt = rawPaidAmt - availableCredit;
      remainingPaymentCreditByTenant.set(tKey, 0);

      if (unaccountedAmt <= 0.01) return;

      const dateStr = inv.dueDate
        ? inv.dueDate.includes('T')
          ? inv.dueDate.split('T')[0]
          : inv.dueDate
        : inv.createdAt
          ? new Date(inv.createdAt).toISOString().split('T')[0]
          : 'N/A';

      allTransactions.push({
        id: inv.id,
        date: dateStr,
        description: `Rent payment - ${tenantName || 'Tenant'}`,
        propertyId: inv.propertyId,
        unitId: matchedUnit?.id || tenantObj?.unitId || '',
        tenantId: inv.tenantId || '',
        tenantName: tenantName || 'N/A',
        propertyName: propNameMap.get(inv.propertyId) || inv.propertyName || 'Property',
        unitNumber: formatUnitDisplay(matchedUnit?.unitNumber || inv.unitNumber),
        category: 'Rental Revenue',
        type: 'Income',
        amount: Number(unaccountedAmt.toFixed(2)),
      });
    });

    // 3. Process Completed / Closed Work Orders & Service Requests as Operating Expenses (no Open/InProgress/Estimated/Deleted items)
    const seenExpenseIds = new Set<string>();
    const softDeletedUnitsSet = new Set(softDeleted.units);

    workOrders.forEach((wo: any) => {
      if (!wo || !wo.id || seenExpenseIds.has(wo.id) || softDeletedWorkOrdersSet.has(wo.id)) return;
      const st = String(wo.status || '').toLowerCase().replace(/[\s_-]/g, '');
      if (st !== 'completed' && st !== 'closed') return;

      const baseActual = Number(wo.actualCost ?? wo.labourCost ?? wo.cost ?? 0);
      const extra = Number(wo.extraExpenses || 0) + Number(wo.materialsCost || 0);
      const cost = baseActual + extra > 0 ? baseActual + extra : Number(wo.estimatedCost || 0);

      if (cost <= 0) return;

      const matchedUnit = resolveUnitFromPropAndNumber(wo.propertyId, wo.unitNumber);
      if (matchedUnit && softDeletedUnitsSet.has(matchedUnit.id)) return;
      seenExpenseIds.add(wo.id);

      const categoryName = wo.vendor?.serviceType
        ? `Maintenance - ${wo.vendor.serviceType}`
        : 'Property Maintenance & Repairs';

      allTransactions.push({
        id: wo.id,
        date: wo.createdAt ? new Date(wo.createdAt).toISOString().split('T')[0] : 'N/A',
        description: wo.title || 'Completed Work Order',
        propertyId: wo.propertyId,
        unitId: matchedUnit?.id || '',
        tenantId: '',
        tenantName: 'N/A',
        propertyName: wo.property?.name || propNameMap.get(wo.propertyId) || 'Property',
        unitNumber: formatUnitDisplay(matchedUnit?.unitNumber || wo.unitNumber),
        category: categoryName,
        type: 'Expense',
        amount: Number(cost.toFixed(2)),
      });
    });

    serviceRequests.forEach((sr: any) => {
      if (!sr || !sr.id || seenExpenseIds.has(sr.id) || softDeletedServiceReqsSet.has(sr.id)) return;
      const st = String(sr.status || '').toLowerCase().replace(/[\s_-]/g, '');
      if (st !== 'completed' && st !== 'closed') return;

      if (sr.tenantId && softDeleted.tenants.includes(sr.tenantId)) {
        return;
      }

      const matchedUnit = resolveUnitFromPropAndNumber(sr.propertyId, sr.unitNumber);
      if (matchedUnit && softDeletedUnitsSet.has(matchedUnit.id)) {
        return;
      }

      const baseActual = Number(sr.labourCost || sr.cost || 0);
      const extra = Number(sr.extraExpenses || 0);
      const cost = baseActual + extra > 0 ? baseActual + extra : Number(sr.estimatedCost || 0);

      if (cost <= 0) return;

      seenExpenseIds.add(sr.id);

      const categoryName =
        sr.category && sr.category !== 'General'
          ? `Maintenance - ${sr.category}`
          : 'Property Maintenance & Repairs';

      allTransactions.push({
        id: sr.id,
        date: sr.createdAt ? new Date(sr.createdAt).toISOString().split('T')[0] : 'N/A',
        description: sr.title || 'Completed Service Request',
        propertyId: sr.propertyId,
        unitId: matchedUnit?.id || '',
        tenantId: sr.tenantId || '',
        tenantName: sr.tenantName || 'N/A',
        propertyName: propNameMap.get(sr.propertyId) || sr.propertyName || 'Property',
        unitNumber: formatUnitDisplay(matchedUnit?.unitNumber || sr.unitNumber),
        category: categoryName,
        type: 'Expense',
        amount: Number(cost.toFixed(2)),
      });
    });

    // 4. Apply query-level filters (unitId, tenantId, status/type, startDate, endDate, search)
    const startMs = query.startDate ? new Date(query.startDate).getTime() : null;
    const endMs = query.endDate
      ? (() => {
          const d = new Date(query.endDate);
          d.setHours(23, 59, 59, 999);
          return d.getTime();
        })()
      : null;

    const selectedUnitObj = query.unitId ? unitByIdMap.get(query.unitId) : null;
    const selectedTenantObj = query.tenantId
      ? activeTenants.find((t) => t.id === query.tenantId)
      : null;

    const transactions = allTransactions.filter((t) => {
      if (query.unitId) {
        const idMatches = t.unitId && t.unitId === query.unitId;
        const numMatches =
          selectedUnitObj &&
          normalizeUnitNum(t.unitNumber) &&
          normalizeUnitNum(t.unitNumber) === normalizeUnitNum(selectedUnitObj.unitNumber);
        if (!idMatches && !numMatches) return false;
      }

      if (query.tenantId) {
        const idMatches = t.tenantId && t.tenantId === query.tenantId;
        const selectedName = selectedTenantObj
          ? `${selectedTenantObj.firstName || ''} ${selectedTenantObj.lastName || ''}`.trim().toLowerCase()
          : '';
        const nameMatches =
          selectedName && String(t.tenantName || '').trim().toLowerCase() === selectedName;
        if (!idMatches && !nameMatches) return false;
      }

      if (query.status && query.status !== 'All Statuses' && query.status !== 'all') {
        const sf = String(query.status).trim().toLowerCase();
        if (String(t.type || '').toLowerCase() !== sf) return false;
      }

      if (startMs !== null || endMs !== null) {
        if (!t.date || t.date === 'N/A') return false;
        const tMs = new Date(t.date).getTime();
        if (isNaN(tMs)) return false;
        if (startMs !== null && tMs < startMs) return false;
        if (endMs !== null && tMs > endMs) return false;
      }

      if (query.search) {
        const q = String(query.search).trim().toLowerCase();
        const hay = `${t.description || ''} ${t.propertyName || ''} ${t.unitNumber || ''} ${t.category || ''} ${t.type || ''} ${t.tenantName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    // 5. Sort transactions
    const sortBy = query.sortBy || 'date';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    transactions.sort((a, b) => {
      if (sortBy === 'amount') {
        return sortOrder === 'asc' ? a.amount - b.amount : b.amount - a.amount;
      }
      if (sortBy === 'propertyName' || sortBy === 'category' || sortBy === 'type' || sortBy === 'description') {
        const valA = String(a[sortBy] || '').toLowerCase();
        const valB = String(b[sortBy] || '').toLowerCase();
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      const dateA = a.date && a.date !== 'N/A' ? new Date(a.date).getTime() : 0;
      const dateB = b.date && b.date !== 'N/A' ? new Date(b.date).getTime() : 0;
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    // 6. Compute Category Breakdowns & Summary strictly from active filtered transactions (0 if empty, no fallback)
    const incomeMap: Record<string, number> = {};
    const expensesMap: Record<string, number> = {};

    transactions.forEach((t) => {
      const amt = Number(t.amount || 0);
      const cat = t.category || (t.type === 'Income' ? 'Rental Revenue' : 'Property Maintenance & Repairs');
      if (t.type === 'Income') {
        incomeMap[cat] = Number(((incomeMap[cat] || 0) + amt).toFixed(2));
      } else if (t.type === 'Expense') {
        expensesMap[cat] = Number(((expensesMap[cat] || 0) + amt).toFixed(2));
      }
    });

    const income = Object.keys(incomeMap).map((k) => ({ name: k, amount: incomeMap[k] }));
    const expenses = Object.keys(expensesMap).map((k) => ({ name: k, amount: expensesMap[k] }));

    const totalIncome = Number(income.reduce((acc, curr) => acc + curr.amount, 0).toFixed(2));
    const totalExpenses = Number(expenses.reduce((acc, curr) => acc + curr.amount, 0).toFixed(2));
    const netProfit = Number((totalIncome - totalExpenses).toFixed(2));

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
        totalPages: transactions.length > 0 ? 1 : 0,
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
        priority: w.priority === 'Normal' ? 'Medium' : (w.priority || 'Medium'),
        status: st,
        assignedPerson: w.vendor?.contactName || w.assignedTechnician || 'Unassigned',
        vendor: w.vendor?.companyName || w.vendorName || 'Unassigned',
        estimatedCost: est,
        actualCost: act,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
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
      let shouldQueryInvoices = true;
      if (query.paymentMethod && query.paymentMethod !== 'All Methods' && query.paymentMethod !== 'all') {
        const pmClean = query.paymentMethod.toLowerCase().replace(/[\s_-]/g, '');
        if (pmClean !== 'banktransfer') {
          shouldQueryInvoices = false;
        }
      }

      if (shouldQueryInvoices) {
        const invStatusFilter: any = {};
        if (query.status && query.status !== 'All Statuses' && query.status !== 'all') {
          const stClean = query.status.toLowerCase().replace(/[\s_-]/g, '');
          if (stClean === 'paid') {
            invStatusFilter.in = ['Paid', 'PAID', 'paid'];
          } else if (stClean === 'partiallypaid' || stClean === 'partially_paid') {
            invStatusFilter.in = ['Partially Paid', 'PartiallyPaid', 'PARTIALLY_PAID'];
          } else {
            invStatusFilter.in = [query.status];
          }
        } else {
          invStatusFilter.in = ['Paid', 'Partially Paid'];
        }

        const invoiceWhere: any = {
          companyId,
          propertyId: { in: query.propertyId ? [query.propertyId] : allowedProperties },
          status: invStatusFilter,
        };

        if (query.startDate || query.endDate) {
          invoiceWhere.updatedAt = {};
          if (query.startDate) {
            const s = new Date(query.startDate);
            s.setHours(0, 0, 0, 0);
            invoiceWhere.updatedAt.gte = s;
          }
          if (query.endDate) {
            const e = new Date(query.endDate);
            e.setHours(23, 59, 59, 999);
            invoiceWhere.updatedAt.lte = e;
          }
        }

        const paidInvoices = await prisma.invoice.findMany({
          where: invoiceWhere,
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
          paymentStatus: inv.status === 'Partially Paid' ? 'PartiallyPaid' : (inv.status || 'Paid'),
        }));
      }
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
