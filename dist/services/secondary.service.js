"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.secondaryService = exports.SecondaryService = void 0;
const database_1 = __importDefault(require("../config/database"));
const env_1 = require("../config/env");
class SecondaryService {
    // Announcements
    async getAnnouncements(companyId) {
        return database_1.default.announcement.findMany({
            where: companyId ? { companyId } : {},
            orderBy: { createdAt: 'desc' },
        });
    }
    async createAnnouncement(data, companyId) {
        return database_1.default.announcement.create({
            data: {
                title: data.title,
                content: data.content,
                category: data.category || 'General',
                isPinned: data.isPinned || false,
                companyId,
            },
        });
    }
    // Insurance
    async getInsurancePolicies(companyId) {
        return database_1.default.insurancePolicy.findMany({
            where: companyId ? { companyId } : {},
            include: { tenant: true },
            orderBy: { createdAt: 'desc' },
        });
    }
    async createInsurancePolicy(data, companyId) {
        return database_1.default.insurancePolicy.create({
            data: {
                ...data,
                companyId,
            },
        });
    }
    // Promotions
    async getPromotions(companyId) {
        return database_1.default.promotion.findMany({
            where: companyId ? { companyId } : {},
            orderBy: { createdAt: 'desc' },
        });
    }
    async createPromotion(data, companyId) {
        return database_1.default.promotion.create({
            data: {
                ...data,
                companyId,
            },
        });
    }
    // Notifications
    async getNotifications(companyId, role) {
        const whereClause = {};
        if (companyId) {
            whereClause.companyId = companyId;
        }
        if (role) {
            whereClause.role = role;
        }
        return database_1.default.notification.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
        });
    }
    async markNotificationRead(id) {
        return database_1.default.notification.update({
            where: { id },
            data: { read: true },
        });
    }
    async markAllNotificationsRead(companyId, role) {
        const whereClause = companyId ? { companyId } : {};
        if (role) {
            whereClause.role = role;
        }
        return database_1.default.notification.updateMany({
            where: whereClause,
            data: { read: true },
        });
    }
    async clearNotifications(companyId, role) {
        const whereClause = companyId ? { companyId } : {};
        if (role) {
            whereClause.role = role;
        }
        return database_1.default.notification.deleteMany({
            where: whereClause,
        });
    }
    async deleteNotification(id) {
        return database_1.default.notification.deleteMany({
            where: { id },
        });
    }
    // Documents
    async getDocuments(companyId) {
        return database_1.default.document.findMany({
            where: companyId ? { companyId } : {},
            orderBy: { createdAt: 'desc' },
        });
    }
    async createDocument(data, companyId) {
        return database_1.default.document.create({
            data: {
                name: data.name,
                category: data.category || 'General',
                fileUrl: data.fileUrl,
                fileSize: data.fileSize || '1.5 MB',
                uploadedBy: data.uploadedBy || 'Property Manager',
                companyId,
            },
        });
    }
    // AI Assistant Chat Response with Strict Manager / Role Data Scoping & OpenAI Support
    async processAiChat(prompt, userPayload) {
        const userRole = userPayload?.roleName || 'Property Manager';
        const userId = userPayload?.userId;
        const userEmail = userPayload?.email;
        let companyId = userPayload?.companyId;
        if (userId && !companyId) {
            const dbUser = await database_1.default.user.findUnique({ where: { id: userId } });
            companyId = dbUser?.companyId || undefined;
        }
        let scopedContextText = '';
        let suggestedActions = [];
        let relatedRecords = [];
        // Detailed entities for rule-based parsing
        let ownersCount = 0;
        let ownerNames = '';
        let propertiesCount = 0;
        let propertyNames = '';
        let totalUnitsCount = 0;
        let occupiedUnitsCount = 0;
        let vacantUnitsCount = 0;
        let occupancyRateVal = 0;
        let tenantsCount = 0;
        let leasesCount = 0;
        let overduePaymentsCount = 0;
        let overdueTotalAmount = 0;
        let overdueTenantDetails = '';
        let workOrdersCount = 0;
        if (userRole === 'Tenant' && userEmail) {
            // --- TENANT DATA SCOPING ---
            const tenant = await database_1.default.tenant.findFirst({
                where: { email: userEmail },
                include: {
                    unit: { include: { property: true } },
                    leases: { orderBy: { startDate: 'desc' }, take: 1 },
                    payments: { orderBy: { dueDate: 'desc' }, take: 5 },
                },
            });
            if (tenant) {
                const lease = tenant.leases[0];
                const unitNum = tenant.unit?.unitNumber || 'N/A';
                const propName = tenant.unit?.property?.name || 'N/A';
                const unpaid = tenant.payments.filter((p) => p.status === 'Pending');
                const overdueSum = unpaid.reduce((sum, p) => sum + p.amount, 0);
                scopedContextText = `User Role: Tenant (${tenant.firstName} ${tenant.lastName}). Property: ${propName}, Unit: ${unitNum}. Active Lease: Rent $${lease?.rentAmount || 0}/mo ending ${lease?.endDate ? lease.endDate.toISOString().split('T')[0] : 'N/A'}. Outstanding Overdue Balance: $${overdueSum}.`;
                suggestedActions = ['Pay Overdue Rent', 'Submit Maintenance Request', 'View Lease Document'];
                relatedRecords = [`Unit: ${unitNum}`, `Property: ${propName}`];
            }
            else {
                scopedContextText = `User Role: Tenant (${userEmail}). No tenant record found.`;
            }
        }
        else if (userRole === 'Owner' && userEmail) {
            // --- OWNER DATA SCOPING ---
            const owner = await database_1.default.owner.findFirst({
                where: { email: userEmail },
                include: {
                    properties: true,
                    distributions: { take: 5, orderBy: { processedDate: 'desc' } },
                },
            });
            if (owner) {
                propertiesCount = owner.properties.length;
                propertyNames = owner.properties.map((p) => p.name).join(', ');
                const totalDistributions = owner.distributions.reduce((sum, d) => sum + d.amount, 0);
                scopedContextText = `User Role: Property Owner (${owner.name}). Properties Owned (${propertiesCount}): [${propertyNames}]. Total Distributions Received: $${totalDistributions}. Payout Method: ${owner.payoutMethod}.`;
                suggestedActions = ['View Owner Statement', 'Check Property Occupancy', 'Download Distribution Report'];
                relatedRecords = owner.properties.map((p) => `Property: ${p.name}`);
            }
            else {
                scopedContextText = `User Role: Property Owner (${userEmail}). No owner record found.`;
            }
        }
        else {
            // --- MANAGER / STAFF DATA SCOPING (STRICT BY COMPANY ID) ---
            const companyFilter = companyId ? { companyId } : {};
            const unitWhere = companyId ? { property: { companyId } } : {};
            const [properties, totalUnits, occupiedUnits, activeTenantsCount, activeLeasesCount, overduePayments, openWorkOrders, owners,] = await Promise.all([
                database_1.default.property.findMany({ where: companyFilter, select: { id: true, name: true, unitsCount: true } }),
                database_1.default.unit.count({ where: unitWhere }),
                database_1.default.unit.count({ where: { ...unitWhere, status: 'Occupied' } }),
                database_1.default.tenant.count({ where: companyFilter }),
                database_1.default.lease.count({ where: { ...companyFilter, status: 'Active' } }),
                database_1.default.rentPayment.findMany({
                    where: { ...companyFilter, status: 'Pending' },
                    include: { tenant: { select: { firstName: true, lastName: true } }, property: { select: { name: true } } },
                    take: 5,
                }),
                database_1.default.workOrder.findMany({
                    where: { ...companyFilter, status: 'Open' },
                    select: { title: true, priority: true },
                    take: 5,
                }),
                database_1.default.owner.findMany({
                    where: companyFilter,
                    select: { id: true, name: true, email: true, companyName: true },
                }),
            ]);
            ownersCount = owners.length;
            ownerNames = owners.map((o) => o.name || o.email || 'Unnamed Owner').filter(Boolean).join(', ');
            propertiesCount = properties.length;
            propertyNames = properties.map((p) => p.name).slice(0, 10).join(', ');
            totalUnitsCount = totalUnits;
            occupiedUnitsCount = occupiedUnits;
            vacantUnitsCount = Math.max(0, totalUnits - occupiedUnits);
            occupancyRateVal = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
            tenantsCount = activeTenantsCount;
            leasesCount = activeLeasesCount;
            overduePaymentsCount = overduePayments.length;
            overdueTotalAmount = overduePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            overdueTenantDetails = overduePayments
                .map((p) => `${p.tenant?.firstName || ''} ${p.tenant?.lastName || ''} ($${p.amount})`)
                .join(', ');
            workOrdersCount = openWorkOrders.length;
            scopedContextText = `User Role: ${userRole} (Company ID: ${companyId || 'Global'}). Company Owners (${ownersCount}): [${ownerNames || 'None'}]. Portfolio: ${propertiesCount} Properties ([${propertyNames || 'None'}]), ${totalUnitsCount} Total Units (${occupiedUnitsCount} Occupied, ${vacantUnitsCount} Vacant, ${occupancyRateVal}% Occupancy Rate), ${tenantsCount} Active Tenants, ${leasesCount} Active Leases. Overdue Rent: ${overduePaymentsCount} tenants owing total $${overdueTotalAmount} (${overdueTenantDetails || 'None'}). Open Work Orders: ${workOrdersCount} pending.`;
            suggestedActions = ['Show Overdue Rent Details', 'View Vacant Units', 'Check Maintenance Requests', 'Generate Rent Roll'];
            relatedRecords = properties.map((p) => `Property: ${p.name}`);
        }
        // --- CALL OPENAI API IF KEY IS CONFIGURED ---
        let responseText = '';
        const openAiApiKey = env_1.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
        if (openAiApiKey && openAiApiKey !== 'your_openai_api_key_here' && openAiApiKey.trim().length > 10) {
            try {
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openAiApiKey.trim()}`,
                };
                if (env_1.env.OPENAI_ORG_ID || process.env.OPENAI_ORG_ID) {
                    headers['OpenAI-Organization'] = (env_1.env.OPENAI_ORG_ID || process.env.OPENAI_ORG_ID || '').trim();
                }
                const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: env_1.env.OPENAI_MODEL || 'gpt-4o',
                        messages: [
                            {
                                role: 'system',
                                content: `You are the WhatsLandlord ERP AI Assistant. You assist property managers, owners, and tenants with rental operations. Answer user questions strictly based on the following isolated live database context. Never expose or reveal data from other companies or managers.\n\nLIVE SCOPED CONTEXT:\n${scopedContextText}`,
                            },
                            { role: 'user', content: prompt },
                        ],
                        temperature: 0.3,
                        max_tokens: 700,
                    }),
                });
                if (aiResponse.ok) {
                    const aiJson = await aiResponse.json();
                    responseText = aiJson.choices?.[0]?.message?.content?.trim() || '';
                }
                else {
                    console.warn('[AI Assistant] OpenAI API returned error status:', aiResponse.status);
                }
            }
            catch (err) {
                console.error('[AI Assistant] OpenAI API call failed, using fallback engine:', err);
            }
        }
        // --- SMART RULE-BASED FALLBACK RESPONDER (SPECIFIC PER QUESTION TYPE) ---
        if (!responseText) {
            const q = prompt.toLowerCase();
            if (q.includes('owner') || q.includes('owners')) {
                responseText = ownersCount > 0
                    ? `Owner Information: There are currently ${ownersCount} registered property owner(s) in your company: ${ownerNames}.`
                    : `Owner Information: There are no registered property owners currently found in your company.`;
            }
            else if (q.includes('property') || q.includes('properties') || q.includes('building')) {
                responseText = propertiesCount > 0
                    ? `Properties Overview: You currently manage ${propertiesCount} properties in your portfolio: ${propertyNames}.`
                    : `Properties Overview: No properties found in your company portfolio.`;
            }
            else if (q.includes('overdue') || q.includes('late') || q.includes('unpaid') || q.includes('delinquent')) {
                responseText = overduePaymentsCount > 0
                    ? `Overdue Rent Details: You have ${overduePaymentsCount} tenant(s) with overdue rent balances totaling $${overdueTotalAmount}. Pending accounts: ${overdueTenantDetails}.`
                    : `Overdue Rent Details: Excellent! There are no overdue rent balances currently recorded for your company.`;
            }
            else if (q.includes('occupancy') || q.includes('vacant') || q.includes('unit') || q.includes('units')) {
                responseText = `Units & Occupancy Summary: Your portfolio has ${totalUnitsCount} total units. Currently, ${occupiedUnitsCount} units are occupied and ${vacantUnitsCount} units are vacant (${occupancyRateVal}% occupancy rate).`;
            }
            else if (q.includes('maintenance') || q.includes('work order') || q.includes('repair') || q.includes('staff')) {
                responseText = workOrdersCount > 0
                    ? `Maintenance Work Orders: There are currently ${workOrdersCount} open maintenance work orders pending resolution.`
                    : `Maintenance Work Orders: All clear! There are no open maintenance work orders pending right now.`;
            }
            else if (q.includes('tenant') || q.includes('resident') || q.includes('lease')) {
                responseText = `Tenants & Leases Overview: Your company has ${tenantsCount} active tenants and ${leasesCount} active leases on file.`;
            }
            else if (q.includes('financial') || q.includes('revenue') || q.includes('report') || q.includes('statement')) {
                responseText = `Financial Metrics: Live double-entry accounting records are active. Total overdue rent outstanding is $${overdueTotalAmount} across ${overduePaymentsCount} delinquent accounts.`;
            }
            else {
                responseText = `Hello! I am your WhatsLandlord AI Assistant.\n\nYour Portfolio Status:\n- Properties: ${propertiesCount}\n- Total Units: ${totalUnitsCount} (${occupancyRateVal}% occupied, ${vacantUnitsCount} vacant)\n- Active Tenants: ${tenantsCount}\n- Registered Owners: ${ownersCount}\n- Open Work Orders: ${workOrdersCount}\n\nHow can I further assist you with your property management operations?`;
            }
        }
        // --- SAVE CHAT LOG IN DATABASE ---
        try {
            await database_1.default.aiChatLog.create({
                data: {
                    prompt,
                    response: responseText,
                    userId,
                    companyId,
                },
            });
        }
        catch (e) {
            console.warn('[AI Assistant] Could not save AiChatLog:', e);
        }
        return {
            prompt,
            response: responseText,
            suggestedActions,
            relatedRecords: relatedRecords.slice(0, 5),
        };
    }
}
exports.SecondaryService = SecondaryService;
exports.secondaryService = new SecondaryService();
