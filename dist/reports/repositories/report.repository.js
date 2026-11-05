"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportRepository = void 0;
const database_1 = __importDefault(require("../../config/database"));
class ReportRepository {
    // 1. Rent Roll Report Data
    async getRentRollData(params) {
        const { propertyIds, propertyId, unitId, tenantId, leaseStatus, startDate, endDate, search, page, limit, sortBy, sortOrder = 'asc' } = params;
        const activePropertyIds = propertyId ? [propertyId] : propertyIds;
        if (activePropertyIds.length === 0) {
            return { units: [], totalRecords: 0, summary: { totalMonthlyRent: 0, totalSecurityDeposits: 0, occupiedCount: 0, vacantCount: 0, totalUnits: 0 } };
        }
        // 1. Build whereClause for filtered list of units
        const whereClause = {
            propertyId: { in: activePropertyIds },
            property: {
                status: { notIn: ['Inactive', 'Deleted'] },
                ...(params.companyId ? { companyId: params.companyId } : {}),
            },
        };
        if (unitId) {
            whereClause.id = unitId;
        }
        if (tenantId) {
            whereClause.OR = [
                { tenants: { some: { id: tenantId } } },
                { leases: { some: { tenantId } } },
            ];
        }
        if (leaseStatus) {
            const ls = leaseStatus.toLowerCase().trim();
            if (ls === 'active' || ls === 'occupied') {
                whereClause.OR = [
                    { leases: { some: { status: 'Active' } } },
                    { status: 'Occupied' },
                ];
            }
            else if (ls === 'vacant') {
                whereClause.AND = [
                    { leases: { none: { status: 'Active' } } },
                    { status: { not: 'Occupied' } },
                ];
            }
            else if (ls === 'pending' || ls === 'pending_move_in') {
                whereClause.leases = { some: { status: 'Pending_Move_In' } };
            }
            else if (ls === 'ended' || ls === 'expired' || ls === 'terminated') {
                whereClause.leases = { some: { status: { in: ['Ended', 'Expired', 'Terminated'] } } };
            }
            else if (ls !== 'all' && ls !== 'all statuses' && ls !== 'all_statuses') {
                whereClause.OR = [
                    { leases: { some: { status: leaseStatus } } },
                    { status: leaseStatus },
                ];
            }
        }
        if (startDate || endDate) {
            const leaseDateFilter = {};
            if (startDate)
                leaseDateFilter.gte = startDate;
            if (endDate)
                leaseDateFilter.lte = endDate;
            const dateConditions = [
                { leases: { some: { startDate: leaseDateFilter } } },
                { leases: { some: { endDate: leaseDateFilter } } },
            ];
            if (whereClause.AND) {
                whereClause.AND.push({ OR: dateConditions });
            }
            else {
                whereClause.AND = [{ OR: dateConditions }];
            }
        }
        if (search) {
            const searchConditions = [
                { unitNumber: { contains: search } },
                { property: { name: { contains: search } } },
                { tenants: { some: { OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }] } } },
                { leases: { some: { tenant: { OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }] } } } },
            ];
            if (whereClause.AND) {
                whereClause.AND.push({ OR: searchConditions });
            }
            else {
                whereClause.AND = [{ OR: searchConditions }];
            }
        }
        const skip = (page - 1) * limit;
        let orderBy = [
            { property: { name: 'asc' } },
            { unitNumber: 'asc' },
        ];
        if (sortBy === 'rentAmount')
            orderBy = { rentAmount: sortOrder };
        if (sortBy === 'securityDeposit')
            orderBy = { securityDeposit: sortOrder };
        if (sortBy === 'unitNumber')
            orderBy = { unitNumber: sortOrder };
        const [units, totalRecords, summaryUnits] = await Promise.all([
            database_1.default.unit.findMany({
                where: whereClause,
                include: {
                    property: true,
                    tenants: true,
                    leases: {
                        where: { status: 'Active' },
                        include: { tenant: true },
                        orderBy: { startDate: 'desc' },
                        take: 1,
                    },
                },
                orderBy,
                skip,
                take: limit,
            }),
            database_1.default.unit.count({ where: whereClause }),
            database_1.default.unit.findMany({
                where: whereClause,
                include: {
                    leases: {
                        where: { status: 'Active' },
                        orderBy: { startDate: 'desc' },
                        take: 1,
                    },
                },
            }),
        ]);
        let totalMonthlyRent = 0;
        let totalSecurityDeposits = 0;
        let occupiedCount = 0;
        let vacantCount = 0;
        summaryUnits.forEach((u) => {
            const activeLease = u.leases && u.leases.length > 0 ? u.leases[0] : null;
            const isOccupied = Boolean(activeLease) || u.status === 'Occupied';
            if (isOccupied) {
                occupiedCount++;
            }
            else {
                vacantCount++;
            }
            const rent = activeLease ? Number(activeLease.rentAmount || u.rentAmount || 0) : Number(u.rentAmount || 0);
            const deposit = activeLease ? Number(activeLease.depositAmount || u.securityDeposit || 0) : Number(u.securityDeposit || 0);
            totalMonthlyRent += rent;
            totalSecurityDeposits += deposit;
        });
        return {
            units,
            totalRecords,
            summary: {
                totalMonthlyRent,
                totalSecurityDeposits,
                occupiedCount,
                vacantCount,
                totalUnits: totalRecords,
            },
        };
    }
    // 2. Occupancy Report Data
    async getOccupancyData(params) {
        const { propertyIds, propertyId, page, limit } = params;
        const activePropertyIds = propertyId ? [propertyId] : propertyIds;
        if (activePropertyIds.length === 0) {
            return { properties: [], totalRecords: 0, summary: { portfolioTotalUnits: 0, portfolioOccupiedUnits: 0, portfolioVacantUnits: 0, portfolioMaintenanceUnits: 0, overallOccupancyPercentage: 0, totalProperties: 0 } };
        }
        const whereClause = {
            id: { in: activePropertyIds },
            status: { notIn: ['Inactive', 'Deleted'] },
        };
        const skip = (page - 1) * limit;
        const [properties, totalRecords, allUnits] = await Promise.all([
            database_1.default.property.findMany({
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
            database_1.default.property.count({ where: whereClause }),
            database_1.default.unit.findMany({
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
            }
            else if (u.status === 'UnderMaintenance') {
                portfolioMaintenanceUnits++;
            }
            else {
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
    async getDelinquencyData(params) {
        const { propertyIds, propertyId, unitId, tenantId, status, startDate, endDate, page, limit, sortBy, sortOrder = 'desc' } = params;
        const activePropertyIds = propertyId ? [propertyId] : propertyIds;
        if (activePropertyIds.length === 0) {
            return { invoices: [], totalRecords: 0, summary: { totalDelinquentBalance: 0, totalOriginalAmount: 0, totalDelinquentTenants: 0, totalDelinquentInvoices: 0, averageDaysLate: 0 } };
        }
        // Auto-reconcile invoices with actual rentPayment records
        try {
            const propertyInvoices = await database_1.default.invoice.findMany({
                where: {
                    propertyId: { in: activePropertyIds },
                    ...(params.companyId ? { companyId: params.companyId } : {}),
                    ...(tenantId ? { tenantId } : {}),
                },
            });
            const propertyPayments = await database_1.default.rentPayment.findMany({
                where: {
                    propertyId: { in: activePropertyIds },
                    ...(params.companyId ? { companyId: params.companyId } : {}),
                    ...(tenantId ? { tenantId } : {}),
                    status: { in: ['Paid', 'PartiallyPaid'] },
                },
                include: {
                    tenant: true,
                },
            });
            for (const inv of propertyInvoices) {
                const invMonth = String(inv.dueDate || '').slice(0, 7);
                if (!invMonth)
                    continue;
                const matchedPayments = propertyPayments.filter((p) => {
                    if (p.invoiceId && p.invoiceId === inv.id)
                        return true;
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
                        await database_1.default.invoice.update({
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
        }
        catch (e) {
            console.warn('Delinquency auto-reconciliation warning:', e);
        }
        const whereClause = {
            propertyId: { in: activePropertyIds },
            ...(params.companyId ? { companyId: params.companyId } : {}),
        };
        if (tenantId) {
            whereClause.tenantId = tenantId;
        }
        let unitNumberToMatch = null;
        if (unitId) {
            const u = await database_1.default.unit.findUnique({
                where: { id: unitId },
                select: { id: true, unitNumber: true },
            });
            if (u?.unitNumber) {
                unitNumberToMatch = u.unitNumber.replace(/^unit\s*/i, '').trim();
            }
        }
        const andConditions = [];
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
        }
        else {
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
            if (startDate)
                whereClause.dueDate.gte = startDate instanceof Date ? startDate.toISOString().split('T')[0] : String(startDate).split('T')[0];
            if (endDate)
                whereClause.dueDate.lte = endDate instanceof Date ? endDate.toISOString().split('T')[0] : String(endDate).split('T')[0];
        }
        const skip = (page - 1) * limit;
        let orderBy = { dueDate: sortOrder };
        if (sortBy === 'balance')
            orderBy = { balance: sortOrder };
        if (sortBy === 'amount')
            orderBy = { amount: sortOrder };
        const [invoices, totalRecords] = await Promise.all([
            database_1.default.invoice.findMany({
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
            database_1.default.invoice.count({ where: whereClause }),
        ]);
        const allDelinquentInvoices = await database_1.default.invoice.findMany({
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
        const uniqueTenantIds = new Set();
        const todayMs = new Date().getTime();
        allDelinquentInvoices.forEach((inv) => {
            const bal = Number(inv.balance ?? (Number(inv.amount || 0) - Number(inv.paidAmount || 0)));
            totalDelinquentBalance += Math.max(0, bal);
            totalOriginalAmount += Number(inv.amount || 0);
            if (inv.tenantId)
                uniqueTenantIds.add(inv.tenantId);
            else if (inv.tenantName)
                uniqueTenantIds.add(inv.tenantName);
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
    async getProfitLossData(params) {
        const { propertyIds, propertyId, startDate, endDate } = params;
        const activePropertyIds = propertyId ? [propertyId] : propertyIds;
        if (activePropertyIds.length === 0) {
            return [];
        }
        const whereClause = {
            ...(params.companyId ? { journalEntry: { companyId: params.companyId } } : {}),
        };
        if (startDate || endDate) {
            whereClause.journalEntry = whereClause.journalEntry || {};
            whereClause.journalEntry.date = {};
            if (startDate)
                whereClause.journalEntry.date.gte = startDate;
            if (endDate)
                whereClause.journalEntry.date.lte = endDate;
        }
        try {
            const lines = await database_1.default.journalEntryLine.findMany({
                where: whereClause,
                include: {
                    account: true,
                    journalEntry: true,
                },
            });
            return lines;
        }
        catch (e) {
            console.warn('Failed to fetch journalEntryLine for P&L:', e);
            return [];
        }
    }
    // 5. Maintenance Report Data
    async getMaintenanceData(params) {
        const { propertyIds, propertyId, status, priority, startDate, endDate, page, limit, sortBy, sortOrder = 'desc' } = params;
        const activePropertyIds = propertyId ? [propertyId] : propertyIds;
        if (activePropertyIds.length === 0) {
            return { workOrders: [], totalRecords: 0, summary: { totalWorkOrders: 0, totalEstimatedCost: 0, totalActualCost: 0, completedCount: 0, inProgressCount: 0, openCount: 0, completionRate: 0 } };
        }
        const woWhere = {
            propertyId: { in: activePropertyIds },
            property: {
                status: { notIn: ['Inactive', 'Deleted'] },
            },
            ...(params.companyId ? { companyId: params.companyId } : {}),
        };
        const srWhere = {
            propertyId: { in: activePropertyIds },
            ...(params.companyId ? { companyId: params.companyId } : {}),
        };
        if (propertyId) {
            woWhere.propertyId = propertyId;
            srWhere.propertyId = propertyId;
        }
        if (status && status !== 'All Statuses' && status !== 'all') {
            const sf = status.toLowerCase().replace(/[\s_-]/g, '');
            let statusFilter;
            if (sf === 'inprogress' || sf === 'inprocess') {
                statusFilter = { in: ['InProgress', 'In Progress', 'in_progress', 'IN_PROGRESS', 'Assigned', 'assigned'] };
            }
            else if (sf === 'completed' || sf === 'closed') {
                statusFilter = { in: ['Completed', 'completed', 'Closed', 'closed'] };
            }
            else if (sf === 'notstarted' || sf === 'open' || sf === 'new') {
                statusFilter = { in: ['Not Started', 'not_started', 'Open', 'open', 'New', 'new', 'Pending'] };
            }
            else {
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
            const dateFilter = {};
            if (startDate)
                dateFilter.gte = startDate;
            if (endDate)
                dateFilter.lte = endDate;
            woWhere.createdAt = dateFilter;
            srWhere.createdAt = dateFilter;
        }
        const [allWorkOrders, allServiceRequests] = await Promise.all([
            database_1.default.workOrder.findMany({
                where: woWhere,
                include: {
                    property: true,
                    vendor: true,
                },
            }),
            database_1.default.serviceRequest.findMany({
                where: srWhere,
            }),
        ]);
        const formattedWOs = allWorkOrders.map((w) => {
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
        const formattedSRs = allServiceRequests.map((sr) => {
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
        combined.forEach((w) => {
            totalEstimatedCost += Number(w.estimatedCost || 0);
            totalActualCost += Number(w.actualCost || w.cost || 0);
            const st = (w.status || '').toLowerCase().replace(/[\s_-]/g, '');
            if (st === 'completed' || st === 'closed')
                completedCount++;
            else if (st === 'inprogress' || st === 'assigned')
                inProgressCount++;
            else
                openCount++;
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
    async getPaymentHistoryData(params) {
        const { propertyIds, propertyId, unitId, tenantId, paymentMethod, status, startDate, endDate, page, limit, sortBy, sortOrder = 'desc', } = params;
        const activePropertyIds = propertyId ? [propertyId] : propertyIds;
        if (activePropertyIds.length === 0) {
            return { payments: [], totalRecords: 0, summary: { totalCollectedAmount: 0, totalTransactions: 0, averageTransaction: 0, methodMap: {} } };
        }
        const whereClause = {
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
            if (startDate)
                whereClause.paidDate.gte = startDate;
            if (endDate)
                whereClause.paidDate.lte = endDate;
        }
        const skip = (page - 1) * limit;
        let orderBy = { paidDate: sortOrder };
        if (sortBy === 'amount')
            orderBy = { amount: sortOrder };
        const [payments, totalRecords, allPayments] = await Promise.all([
            database_1.default.rentPayment.findMany({
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
            database_1.default.rentPayment.count({ where: whereClause }),
            database_1.default.rentPayment.findMany({
                where: whereClause,
            }),
        ]);
        let totalCollectedAmount = 0;
        const methodMap = {};
        allPayments.forEach((p) => {
            if (['Paid', 'PartiallyPaid', 'Cleared'].includes(p.status) || !p.status) {
                const amt = Number(p.amount || 0);
                totalCollectedAmount += amt;
            }
            const m = p.paymentMethod || 'ACH';
            methodMap[m] = (methodMap[m] || 0) + 1;
        });
        // If rentPayment is empty, aggregate paid invoices
        if (allPayments.length === 0) {
            const paidInvoices = await database_1.default.invoice.findMany({
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
    static inMemoryExports = [];
    async createExport(data) {
        try {
            if (database_1.default.reportExport) {
                return await database_1.default.reportExport.create({ data });
            }
        }
        catch (e) {
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
    async saveExport(data) {
        return this.createExport(data);
    }
    async getExports(companyId, userId, page, limit) {
        try {
            if (database_1.default.reportExport) {
                const skip = (page - 1) * limit;
                const [exports, totalRecords] = await Promise.all([
                    database_1.default.reportExport.findMany({
                        where: companyId ? { OR: [{ companyId }, { companyId: null }] } : {},
                        orderBy: { createdAt: 'desc' },
                        skip,
                        take: limit,
                    }),
                    database_1.default.reportExport.count({
                        where: companyId ? { OR: [{ companyId }, { companyId: null }] } : {},
                    }),
                ]);
                if (exports && exports.length > 0) {
                    return { exports, totalRecords };
                }
            }
        }
        catch (e) {
            console.warn('DB reportExport findMany failed, returning in-memory store:', e);
        }
        const filtered = ReportRepository.inMemoryExports.filter((item) => !companyId || !item.companyId || item.companyId === companyId);
        const skip = (page - 1) * limit;
        const paginated = filtered.slice(skip, skip + limit);
        return { exports: paginated, totalRecords: filtered.length };
    }
    async updateExportStatus(id, status, fileUrl, errorMessage) {
        try {
            if (database_1.default.reportExport) {
                return await database_1.default.reportExport.update({
                    where: { id },
                    data: {
                        status,
                        fileUrl,
                        errorMessage,
                    },
                });
            }
        }
        catch (e) {
            console.warn('DB reportExport update failed, updating in-memory store:', e);
        }
        const item = ReportRepository.inMemoryExports.find((x) => x.id === id);
        if (item) {
            item.status = status;
            if (fileUrl)
                item.fileUrl = fileUrl;
            if (errorMessage)
                item.errorMessage = errorMessage;
            item.updatedAt = new Date();
        }
        return item;
    }
}
exports.ReportRepository = ReportRepository;
