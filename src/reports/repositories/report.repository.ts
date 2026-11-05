import prisma from '../../config/database';

export class ReportRepository {
  // Helper: Fetch soft-deleted entity IDs from restore_bin so soft-deleted records are never counted
  async getSoftDeletedIds(companyId?: string): Promise<{
    properties: string[];
    units: string[];
    leases: string[];
    tenants: string[];
  }> {
    const result = {
      properties: [] as string[],
      units: [] as string[],
      leases: [] as string[],
      tenants: [] as string[],
    };
    try {
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT entityType, entityId FROM restore_bin ${companyId ? 'WHERE companyId = ? OR companyId IS NULL' : ''}`,
        ...(companyId ? [companyId] : [])
      );
      for (const r of rows || []) {
        const type = String(r.entityType || '').toLowerCase();
        const id = String(r.entityId || '');
        if (!id) continue;
        if (type === 'property') result.properties.push(id);
        else if (type === 'unit') result.units.push(id);
        else if (type === 'lease') result.leases.push(id);
        else if (type === 'tenant') result.tenants.push(id);
      }
    } catch {
      // restore_bin table may not exist yet; ignore safely
    }
    return result;
  }

  // 1. Rent Roll Report Data
  async getRentRollData(params: {
    companyId?: string;
    propertyIds: string[];
    propertyId?: string;
    unitId?: string;
    tenantId?: string;
    leaseStatus?: string;
    startDate?: Date;
    endDate?: Date;
    search?: string;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { propertyIds, propertyId, unitId, tenantId, leaseStatus, startDate, endDate, search, page, limit, sortBy, sortOrder = 'asc' } = params;
    const softDeleted = await this.getSoftDeletedIds(params.companyId);

    const activePropertyIds = (propertyId ? [propertyId] : propertyIds).filter(
      (id) => !softDeleted.properties.includes(id)
    );

    if (activePropertyIds.length === 0) {
      return {
        units: [],
        totalRecords: 0,
        summary: {
          totalMonthlyRent: 0,
          totalPotentialRent: 0,
          totalVacancyLoss: 0,
          totalSecurityDeposits: 0,
          occupiedCount: 0,
          vacantCount: 0,
          totalUnits: 0,
        },
      };
    }

    // 1. Build whereClause for filtered list of active, non-deleted units
    const whereClause: any = {
      propertyId: { in: activePropertyIds },
      ...(softDeleted.units.length > 0 ? { id: { notIn: softDeleted.units } } : {}),
      property: {
        status: { notIn: ['Inactive', 'Deleted', 'Draft'] },
        ...(params.companyId ? { companyId: params.companyId } : {}),
      },
    };

    if (unitId) {
      if (softDeleted.units.includes(unitId)) {
        return {
          units: [],
          totalRecords: 0,
          summary: {
            totalMonthlyRent: 0,
            totalPotentialRent: 0,
            totalVacancyLoss: 0,
            totalSecurityDeposits: 0,
            occupiedCount: 0,
            vacantCount: 0,
            totalUnits: 0,
          },
        };
      }
      whereClause.id = unitId;
    }

    if (tenantId) {
      whereClause.OR = [
        { tenants: { some: { id: tenantId, status: { not: 'Inactive' } } } },
        { leases: { some: { tenantId, status: { notIn: ['Terminated', 'Cancelled'] } } } },
      ];
    }

    if (leaseStatus) {
      const ls = leaseStatus.toLowerCase().trim();
      if (ls === 'active' || ls === 'occupied') {
        whereClause.OR = [
          {
            leases: {
              some: {
                status: 'Active',
                ...(softDeleted.leases.length > 0 ? { id: { notIn: softDeleted.leases } } : {}),
              },
            },
          },
          {
            status: 'Occupied',
            tenants: {
              some: {
                status: 'Active',
                ...(softDeleted.tenants.length > 0 ? { id: { notIn: softDeleted.tenants } } : {}),
              },
            },
          },
        ];
      } else if (ls === 'vacant') {
        whereClause.AND = [
          {
            leases: {
              none: {
                status: 'Active',
                ...(softDeleted.leases.length > 0 ? { id: { notIn: softDeleted.leases } } : {}),
              },
            },
          },
          {
            OR: [
              { status: { not: 'Occupied' } },
              { tenants: { none: { status: 'Active' } } },
            ],
          },
        ];
      } else if (ls === 'pending' || ls === 'pending_move_in' || ls === 'pending move in' || ls === 'reserved') {
        whereClause.OR = [
          { leases: { some: { status: 'Pending_Move_In' } } },
          { status: 'Reserved' },
        ];
      } else if (ls === 'ended' || ls === 'expired' || ls === 'terminated' || ls === 'draft') {
        const targetStatus = leaseStatus.charAt(0).toUpperCase() + leaseStatus.slice(1).toLowerCase();
        whereClause.leases = {
          some: {
            status: targetStatus as any,
            ...(softDeleted.leases.length > 0 ? { id: { notIn: softDeleted.leases } } : {}),
          },
        };
      } else if (ls !== 'all' && ls !== 'all statuses' && ls !== 'all_statuses') {
        whereClause.OR = [
          { leases: { some: { status: leaseStatus as any } } },
          { status: leaseStatus as any },
        ];
      }
    }

    if (startDate || endDate) {
      const leaseDateFilter: any = {};
      if (startDate) leaseDateFilter.gte = startDate;
      if (endDate) leaseDateFilter.lte = endDate;

      const dateConditions = [
        { leases: { some: { startDate: leaseDateFilter } } },
        { leases: { some: { endDate: leaseDateFilter } } },
      ];

      if (whereClause.AND) {
        whereClause.AND.push({ OR: dateConditions });
      } else {
        whereClause.AND = [{ OR: dateConditions }];
      }
    }

    if (search) {
      const searchConditions = [
        { unitNumber: { contains: search } },
        { property: { name: { contains: search } } },
        { tenants: { some: { status: { not: 'Inactive' }, OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }] } } },
        { leases: { some: { tenant: { status: { not: 'Inactive' }, OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }] } } } },
      ];

      if (whereClause.AND) {
        whereClause.AND.push({ OR: searchConditions });
      } else {
        whereClause.AND = [{ OR: searchConditions }];
      }
    }

    const skip = (page - 1) * limit;

    let orderBy: any = [
      { property: { name: 'asc' } },
      { unitNumber: 'asc' },
    ];
    if (sortBy === 'rentAmount' || sortBy === 'monthlyRent' || sortBy === 'potentialRent') orderBy = { rentAmount: sortOrder };
    if (sortBy === 'securityDeposit') orderBy = { securityDeposit: sortOrder };
    if (sortBy === 'unitNumber') orderBy = { unitNumber: sortOrder };

    const leaseWhereFilter: any = {
      ...(softDeleted.leases.length > 0 ? { id: { notIn: softDeleted.leases } } : {}),
    };

    const [rawUnits, totalRecords, summaryUnits] = await Promise.all([
      prisma.unit.findMany({
        where: whereClause,
        include: {
          property: true,
          tenants: true,
          leases: {
            where: leaseWhereFilter,
            orderBy: { startDate: 'desc' },
          },
        },
        orderBy,
        skip,
        take: limit,
      }).catch(async () => {
        const fallbackUnits = await prisma.unit.findMany({
          where: whereClause,
          include: {
            tenants: true,
            leases: {
              where: leaseWhereFilter,
              orderBy: { startDate: 'desc' },
            },
          },
          orderBy,
          skip,
          take: limit,
        });
        const propIds = Array.from(new Set(fallbackUnits.map((u) => u.propertyId).filter(Boolean)));
        const props = propIds.length ? await prisma.property.findMany({ where: { id: { in: propIds } } }) : [];
        const propMap = new Map(props.map((p) => [p.id, p]));
        return fallbackUnits.map((u) => ({
          ...u,
          property: propMap.get(u.propertyId) || null,
        }));
      }),
      prisma.unit.count({ where: whereClause }),
      prisma.unit.findMany({
        where: whereClause,
        include: {
          tenants: true,
          leases: {
            where: leaseWhereFilter,
            orderBy: { startDate: 'desc' },
          },
        },
      }),
    ]);

    const allLeaseTenantIds = Array.from(
      new Set(
        [...rawUnits, ...summaryUnits]
          .flatMap((u: any) => u.leases || [])
          .map((l: any) => l.tenantId)
          .filter((id: any) => Boolean(id) && !softDeleted.tenants.includes(String(id)))
      )
    ) as string[];

    const leaseTenants = allLeaseTenantIds.length
      ? await prisma.tenant.findMany({
          where: {
            id: { in: allLeaseTenantIds },
            status: { notIn: ['Inactive'] as any },
          },
        })
      : [];
    const leaseTenantMap = new Map(leaseTenants.map((t) => [t.id, t]));

    // Auto-clean orphaned active leases whose tenant was deleted or soft-deleted
    const orphanedLeaseIds = [...rawUnits, ...summaryUnits]
      .flatMap((u: any) => u.leases || [])
      .filter((l: any) => l.status === 'Active' && (!l.tenantId || !leaseTenantMap.has(l.tenantId)))
      .map((l: any) => l.id);

    if (orphanedLeaseIds.length > 0) {
      await prisma.lease
        .updateMany({
          where: { id: { in: Array.from(new Set(orphanedLeaseIds)) } },
          data: { status: 'Ended' },
        })
        .catch(() => {});
    }

    const ghostOccupiedUnitIds: string[] = [];

    const units = rawUnits.map((u: any) => {
      const validTenants = (u.tenants || []).filter(
        (t: any) => t && t.status === 'Active' && !softDeleted.tenants.includes(t.id)
      );
      const validLeases = (u.leases || [])
        .filter((l: any) => l.tenantId && leaseTenantMap.has(l.tenantId) && !softDeleted.leases.includes(l.id))
        .map((l: any) => ({
          ...l,
          tenant: leaseTenantMap.get(l.tenantId) || null,
        }));

      const activeLease = validLeases.find((l: any) => l.status === 'Active') || null;
      const hasRealOccupant = Boolean(activeLease) || (u.status === 'Occupied' && validTenants.length > 0);

      if (u.status === 'Occupied' && !hasRealOccupant) {
        ghostOccupiedUnitIds.push(u.id);
      }

      return {
        ...u,
        status: hasRealOccupant ? 'Occupied' : (u.status === 'Occupied' ? 'Vacant' : u.status),
        tenants: validTenants,
        leases: validLeases,
      };
    });

    if (ghostOccupiedUnitIds.length > 0) {
      await prisma.unit
        .updateMany({
          where: { id: { in: Array.from(new Set(ghostOccupiedUnitIds)) } },
          data: { status: 'Vacant' },
        })
        .catch(() => {});
    }

    let totalMonthlyRent = 0;
    let totalPotentialRent = 0;
    let totalVacancyLoss = 0;
    let totalSecurityDeposits = 0;
    let occupiedCount = 0;
    let vacantCount = 0;

    summaryUnits.forEach((u: any) => {
      const validTenants = (u.tenants || []).filter(
        (t: any) => t && t.status === 'Active' && !softDeleted.tenants.includes(t.id)
      );
      const validLeases = (u.leases || []).filter(
        (l: any) => l.tenantId && leaseTenantMap.has(l.tenantId) && !softDeleted.leases.includes(l.id)
      );
      const activeLease = validLeases.find((l: any) => l.status === 'Active') || null;

      // Strict Occupancy Check: Unit is Occupied ONLY if it has a valid Active Lease OR (unit is Occupied AND has an Active non-deleted Tenant)
      const isOccupied = Boolean(activeLease) || (u.status === 'Occupied' && validTenants.length > 0);

      const unitMarketRent = Number(u.rentAmount || 0);
      const activeRent = activeLease ? Number(activeLease.rentAmount ?? unitMarketRent) : unitMarketRent;

      const actualMonthlyRent = isOccupied ? activeRent : 0;
      const potentialRent = isOccupied ? activeRent : unitMarketRent;
      const vacancyLoss = isOccupied ? 0 : unitMarketRent;
      const depositHeld = isOccupied
        ? Number(activeLease ? (activeLease.depositAmount ?? u.securityDeposit ?? 0) : (u.securityDeposit ?? 0))
        : 0;

      if (isOccupied) {
        occupiedCount++;
      } else {
        vacantCount++;
      }

      totalMonthlyRent += actualMonthlyRent;
      totalPotentialRent += potentialRent;
      totalVacancyLoss += vacancyLoss;
      totalSecurityDeposits += depositHeld;
    });

    return {
      units,
      totalRecords,
      summary: {
        totalMonthlyRent,
        totalPotentialRent,
        totalVacancyLoss,
        totalSecurityDeposits,
        occupiedCount,
        vacantCount,
        totalUnits: totalRecords,
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
    unitId?: string;
    tenantId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { propertyIds, propertyId, unitId, tenantId, status, startDate, endDate, page, limit, sortBy, sortOrder = 'desc' } = params;
    const activePropertyIds = propertyId ? [propertyId] : propertyIds;

    if (activePropertyIds.length === 0) {
      return { invoices: [], totalRecords: 0, summary: { totalDelinquentBalance: 0, totalOriginalAmount: 0, totalDelinquentTenants: 0, totalDelinquentInvoices: 0, averageDaysLate: 0 } };
    }

    // Auto-reconcile invoices with actual rentPayment records
    try {
      const propertyInvoices = await prisma.invoice.findMany({
        where: {
          propertyId: { in: activePropertyIds },
          ...(params.companyId ? { companyId: params.companyId } : {}),
          ...(tenantId ? { tenantId } : {}),
        },
      });

      const propertyPayments: any[] = await prisma.rentPayment.findMany({
        where: {
          propertyId: { in: activePropertyIds },
          ...(params.companyId ? { companyId: params.companyId } : {}),
          ...(tenantId ? { tenantId } : {}),
          status: { in: ['Paid', 'PartiallyPaid'] as any },
        },
        include: {
          tenant: true,
        },
      });

      for (const inv of propertyInvoices) {
        const invMonth = String(inv.dueDate || '').slice(0, 7);
        if (!invMonth) continue;

        const matchedPayments = propertyPayments.filter((p: any) => {
          if (p.invoiceId && p.invoiceId === inv.id) return true;
          const pMonth = p.paidDate ? new Date(p.paidDate).toISOString().slice(0, 7) : '';
          const pTenantName = p.tenant ? `${p.tenant.firstName} ${p.tenant.lastName}` : (p.tenantName || '');
          const tMatch = (p.tenantId && inv.tenantId && p.tenantId === inv.tenantId) ||
            (pTenantName && inv.tenantName && pTenantName.trim().toLowerCase() === inv.tenantName.trim().toLowerCase());
          return tMatch && pMonth === invMonth;
        });

        if (matchedPayments.length > 0 || propertyPayments.some(p => p.tenantId === inv.tenantId)) {
          const actualPaid = matchedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
          const actualBalance = Math.max(0, Number(inv.amount || 0) - actualPaid);
          const newStatus = actualBalance === 0 ? 'Paid' : (actualPaid > 0 ? 'Partially Paid' : 'Overdue');

          if (Math.abs(Number(inv.paidAmount || 0) - actualPaid) > 0.01 || Math.abs(Number(inv.balance || 0) - actualBalance) > 0.01 || inv.status !== newStatus) {
            await prisma.invoice.update({
              where: { id: inv.id },
              data: {
                paidAmount: actualPaid,
                balance: actualBalance,
                status: newStatus,
              },
            });
            inv.paidAmount = actualPaid;
            inv.balance = actualBalance;
            inv.status = newStatus;
          }
        }
      }
    } catch (e) {
      console.warn('Delinquency auto-reconciliation warning:', e);
    }

    const whereClause: any = {
      propertyId: { in: activePropertyIds },
      ...(params.companyId ? { companyId: params.companyId } : {}),
    };

    if (tenantId) {
      whereClause.tenantId = tenantId;
    }

    let unitNumberToMatch: string | null = null;
    if (unitId) {
      const u = await prisma.unit.findUnique({
        where: { id: unitId },
        select: { id: true, unitNumber: true },
      });
      if (u?.unitNumber) {
        unitNumberToMatch = u.unitNumber.replace(/^unit\s*/i, '').trim();
      }
    }

    const andConditions: any[] = [];
    if (unitId) {
      andConditions.push({
        OR: [
          { tenant: { unitId } },
          ...(unitNumberToMatch ? [
            { unitNumber: { equals: unitNumberToMatch, mode: 'insensitive' } },
            { unitNumber: { contains: unitNumberToMatch, mode: 'insensitive' } },
          ] : []),
        ],
      });
    }

    if (status && status !== 'All Statuses' && status !== 'all') {
      andConditions.push({ status });
    } else {
      andConditions.push({
        OR: [
          { status: { in: ['Unpaid', 'Overdue', 'Partially Paid', 'OVERDUE', 'UNPAID', 'PARTIAL', 'PartiallyPaid'] } },
          { balance: { gt: 0 } },
        ],
      });
    }

    if (andConditions.length > 0) {
      whereClause.AND = andConditions;
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
          tenant: {
            include: {
              unit: true,
            },
          },
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
    unitId?: string;
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
      unitId,
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

    if (unitId) {
      whereClause.OR = [
        { unitId },
        { tenant: { unitId } },
      ];
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
