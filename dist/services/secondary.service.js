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
    buildNotificationWhere(companyId, role, userContext) {
        const whereClause = {};
        if (companyId) {
            whereClause.OR = [{ companyId }, { companyId: null }];
        }
        if (role) {
            const lower = role.toLowerCase().trim();
            if (lower.includes('tenant')) {
                whereClause.role = 'Tenant';
                const targetIds = [userContext?.tenantId, userContext?.id].filter(Boolean);
                if (targetIds.length > 0) {
                    whereClause.AND = [
                        {
                            OR: [
                                { targetId: { in: targetIds } },
                                { userId: { in: targetIds } },
                                { targetId: null, userId: null },
                            ],
                        },
                    ];
                }
            }
            else if (lower.includes('owner')) {
                whereClause.role = 'Owner';
                if (userContext?.ownerId || userContext?.id) {
                    const ownerIds = [userContext.ownerId, userContext.id].filter(Boolean);
                    whereClause.AND = [
                        {
                            OR: [
                                { targetId: { in: ownerIds } },
                                { userId: { in: ownerIds } },
                                { targetId: null, userId: null },
                            ],
                        },
                    ];
                }
            }
            else if (lower.includes('maintenance')) {
                whereClause.role = { in: ['Maintenance Staff', 'Staff'] };
            }
            else if (lower.includes('collection')) {
                whereClause.role = 'Collection Manager';
            }
            else {
                whereClause.role = { in: ['Property Manager', 'Manager', 'Super Admin'] };
            }
        }
        return whereClause;
    }
    async getNotifications(companyId, role, userContext) {
        const whereClause = this.buildNotificationWhere(companyId, role, userContext);
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
    async markAllNotificationsRead(companyId, role, userContext) {
        const whereClause = this.buildNotificationWhere(companyId, role, userContext);
        return database_1.default.notification.updateMany({
            where: whereClause,
            data: { read: true },
        });
    }
    async clearNotifications(companyId, role, userContext) {
        const whereClause = this.buildNotificationWhere(companyId, role, userContext);
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
    async processAiChat(prompt, userPayload, chatId) {
        const userRole = userPayload?.roleName || 'Property Manager';
        const userId = userPayload?.userId;
        const userEmail = userPayload?.email;
        const activeChatId = chatId || 'default-chat';
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
        let expiringLeasesCount = 0;
        let activeLeasesList = [];
        let expiringLeasesList = [];
        let vacantUnitsDetails = 'None';
        let overduePaymentsCount = 0;
        let overdueTotalAmount = 0;
        let overdueTenantDetails = '';
        let workOrdersCount = 0;
        let workOrderDetails = '';
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
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
            let properties = [];
            let totalUnits = 0;
            let occupiedUnits = 0;
            let vacantUnitsList = [];
            let activeTenantsCount = 0;
            let activeLeasesCount = 0;
            let overdueInvoices = [];
            let openWorkOrdersCount = 0;
            let openWorkOrdersList = [];
            let owners = [];
            [
                properties,
                totalUnits,
                occupiedUnits,
                vacantUnitsList,
                activeTenantsCount,
                activeLeasesCount,
                activeLeasesList,
                overdueInvoices,
                openWorkOrdersCount,
                openWorkOrdersList,
                owners,
            ] = await Promise.all([
                database_1.default.property.findMany({ where: companyFilter, select: { id: true, name: true, unitsCount: true } }),
                database_1.default.unit.count({ where: unitWhere }),
                database_1.default.unit.count({ where: { ...unitWhere, status: 'Occupied' } }),
                database_1.default.unit.findMany({
                    where: { ...unitWhere, status: 'Vacant' },
                    include: { property: { select: { name: true } } },
                    take: 10,
                }),
                database_1.default.tenant.count({ where: companyFilter }),
                database_1.default.lease.count({ where: { ...companyFilter, status: 'Active' } }),
                database_1.default.lease.findMany({
                    where: { ...companyFilter, status: { in: ['Active', 'Pending'] } },
                    include: {
                        tenant: { select: { firstName: true, lastName: true, email: true, phone: true } },
                        property: { select: { name: true } },
                        unit: { select: { unitNumber: true } },
                    },
                    orderBy: { endDate: 'asc' },
                    take: 30,
                }),
                database_1.default.invoice.findMany({
                    where: { ...companyFilter, status: { in: ['Overdue', 'Unpaid'] } },
                    select: {
                        tenantName: true,
                        propertyName: true,
                        unitNumber: true,
                        dueDate: true,
                        amount: true,
                        balance: true,
                    },
                    take: 15,
                }),
                database_1.default.workOrder.count({
                    where: { ...companyFilter, status: 'Open' },
                }),
                database_1.default.workOrder.findMany({
                    where: { ...companyFilter, status: 'Open' },
                    select: { title: true, priority: true, description: true },
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
            // Filter leases expiring in current month
            expiringLeasesList = activeLeasesList.filter((l) => {
                if (!l.endDate)
                    return false;
                const d = new Date(l.endDate);
                return d >= startOfMonth && d < endOfMonth;
            });
            expiringLeasesCount = expiringLeasesList.length;
            const expiringLeasesDetails = expiringLeasesList.length > 0
                ? expiringLeasesList.map((l, i) => {
                    const tName = l.tenant ? `${l.tenant.firstName || ''} ${l.tenant.lastName || ''}`.trim() : 'Resident';
                    const pName = l.property?.name || 'Property';
                    const uNum = l.unit?.unitNumber ? (String(l.unit.unitNumber).toLowerCase().startsWith('unit') ? l.unit.unitNumber : `Unit ${l.unit.unitNumber}`) : 'Unit N/A';
                    const expDate = l.endDate ? new Date(l.endDate).toISOString().split('T')[0] : 'N/A';
                    return `  ${i + 1}. Tenant Name: ${tName} | Property: ${pName} | Unit: ${uNum} | End Date: ${expDate} | Monthly Rent: $${l.rentAmount} | Status: ${l.status}`;
                }).join('\n')
                : 'None expiring in the calendar month.';
            const allActiveLeasesDetails = activeLeasesList.length > 0
                ? activeLeasesList.map((l, i) => {
                    const tName = l.tenant ? `${l.tenant.firstName || ''} ${l.tenant.lastName || ''}`.trim() : 'Resident';
                    const pName = l.property?.name || 'Property';
                    const uNum = l.unit?.unitNumber ? (String(l.unit.unitNumber).toLowerCase().startsWith('unit') ? l.unit.unitNumber : `Unit ${l.unit.unitNumber}`) : 'Unit N/A';
                    const expDate = l.endDate ? new Date(l.endDate).toISOString().split('T')[0] : 'N/A';
                    return `  ${i + 1}. Tenant: ${tName} | Property: ${pName} | Unit: ${uNum} | End Date: ${expDate} | Rent: $${l.rentAmount}`;
                }).join('\n')
                : 'None';
            vacantUnitsDetails = vacantUnitsList.length > 0
                ? vacantUnitsList.map((u) => `Unit ${u.unitNumber} (${u.property?.name || 'Property'}, Rent: $${u.rentAmount || 0})`).join(', ')
                : 'None';
            overduePaymentsCount = overdueInvoices.length;
            overdueTotalAmount = overdueInvoices.reduce((sum, inv) => sum + (inv.balance || inv.amount || 0), 0);
            overdueTenantDetails = overdueInvoices
                .map((inv) => {
                const tName = inv.tenantName || 'Tenant';
                const loc = [inv.propertyName, inv.unitNumber ? `Unit ${inv.unitNumber}` : ''].filter(Boolean).join(' ');
                const amt = inv.balance || inv.amount || 0;
                return `- ${tName}${loc ? ` (${loc})` : ''}: $${amt} overdue (Due: ${inv.dueDate || 'N/A'})`;
            })
                .join('\n');
            workOrdersCount = openWorkOrdersCount;
            workOrderDetails = openWorkOrdersList.map((wo) => `${wo.title} (${wo.priority})`).join(', ');
            scopedContextText = `User Role: ${userRole} (Company ID: ${companyId || 'Global'}).
Company Owners (${ownersCount}): [${ownerNames || 'None'}].
Portfolio Overview: ${propertiesCount} Properties ([${propertyNames || 'None'}]), ${totalUnitsCount} Total Units (${occupiedUnitsCount} Occupied, ${vacantUnitsCount} Vacant, ${occupancyRateVal}% Occupancy Rate).
Vacant Units List: ${vacantUnitsDetails}.
Active Tenants: ${tenantsCount}.
Total Active Leases: ${leasesCount}.

EXACT LEASES EXPIRING THIS MONTH (${expiringLeasesCount}):
${expiringLeasesDetails}

ALL ACTIVE LEASES & EXPIRATION DATES:
${allActiveLeasesDetails}

Overdue Rent: ${overduePaymentsCount} delinquent invoice(s) totaling $${overdueTotalAmount}.
Delinquent Details:
${overdueTenantDetails || 'None'}

Open Work Orders (${workOrdersCount}):
${workOrderDetails || 'None'}`;
            suggestedActions = ['Show Expiring Leases', 'Show Overdue Rent Details', 'View Vacant Units', 'Check Maintenance Requests'];
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
                // Multi-turn conversation memory: Fetch prior messages for this chat thread
                let priorConversationHistory = [];
                try {
                    const recentLogs = await database_1.default.aiChatLog.findMany({
                        where: {
                            prompt: { startsWith: `[CHAT:${activeChatId}]` },
                            ...(companyId ? { companyId } : {}),
                        },
                        orderBy: { createdAt: 'desc' },
                        take: 6,
                    });
                    recentLogs.reverse();
                    priorConversationHistory = recentLogs.flatMap((log) => [
                        { role: 'user', content: log.prompt.replace(/^\[CHAT:[^\]]+\]\s*/, '').trim() },
                        { role: 'assistant', content: log.response },
                    ]);
                }
                catch (e) {
                    console.warn('[AI Assistant] Could not fetch prior chat history:', e);
                }
                const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: env_1.env.OPENAI_MODEL || 'gpt-4o',
                        messages: [
                            {
                                role: 'system',
                                content: `You are the WhatsLandlord ERP AI Assistant. You assist property managers, owners, and tenants with rental operations. Answer user questions directly, accurately, and specifically based on the following isolated live database context.

CRITICAL INSTRUCTIONS:
- You maintain conversation context across user prompts. When the user asks a follow-up question (e.g. "can you give the details?", "what about his unit?", "only which lease is expiring", "give more info"), answer based on both the previous conversation history and the live context.
- When the user asks about expiring leases ("Which leases expire this month?", "Which leads to expire this month", "Give the details", "Only which lease is expiring", etc.), ALWAYS provide the complete specific details:
  * Tenant Name
  * Property Name
  * Unit Number
  * Expiration / End Date
  * Monthly Rent
- NEVER say that specific details like tenant names or unit numbers are not available or tell the user to refer to their lease management system, because the exact details are provided in the LIVE SCOPED CONTEXT below.
- If the user asks for "only the details" or follow-up details of expiring leases, list only the relevant fields concisely.
- For questions about overdue rent, vacant units, maintenance, or portfolio stats, use the exact figures and names provided.
- Format responses cleanly using markdown bullet points and bold text.

LIVE SCOPED CONTEXT:
${scopedContextText}`,
                            },
                            ...priorConversationHistory,
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
                    ? `**Overdue Rent Details (${overduePaymentsCount} delinquent accounts, total $${overdueTotalAmount}):**\n\n${overdueTenantDetails}`
                    : `Overdue Rent Details: Excellent! There are no overdue rent balances currently recorded for your company.`;
            }
            else if (q.includes('occupancy') || q.includes('vacant') || q.includes('unit') || q.includes('units')) {
                responseText = `Units & Occupancy Summary: Your portfolio has ${totalUnitsCount} total units. Currently, ${occupiedUnitsCount} units are occupied and ${vacantUnitsCount} units are vacant (${occupancyRateVal}% occupancy rate).\n\nVacant units: ${vacantUnitsDetails}`;
            }
            else if (q.includes('maintenance') || q.includes('work order') || q.includes('repair') || q.includes('staff')) {
                responseText = workOrdersCount > 0
                    ? `Maintenance Work Orders: There are currently ${workOrdersCount} open maintenance work orders pending resolution (${workOrderDetails || 'None'}).`
                    : `Maintenance Work Orders: All clear! There are no open maintenance work orders pending right now.`;
            }
            else if (q.includes('lease') ||
                q.includes('leads') ||
                q.includes('expire') ||
                q.includes('expiring') ||
                ((q.includes('detail') || q.includes('only') || q.includes('which')) && (q.includes('this month') || q.includes('month') || q.includes('lease') || q.includes('expir')))) {
                if (expiringLeasesList.length > 0) {
                    responseText = `**Leases Expiring This Month (${expiringLeasesList.length}):**\n\n` +
                        expiringLeasesList.map((l, idx) => {
                            const tName = l.tenant ? `${l.tenant.firstName || ''} ${l.tenant.lastName || ''}`.trim() : 'Resident';
                            const pName = l.property?.name || 'Property';
                            const uNum = l.unit?.unitNumber ? (String(l.unit.unitNumber).toLowerCase().startsWith('unit') ? l.unit.unitNumber : `Unit ${l.unit.unitNumber}`) : 'Unit N/A';
                            const expDate = l.endDate ? new Date(l.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
                            return `**${idx + 1}. ${tName}**\n- **Property:** ${pName}\n- **Unit:** ${uNum}\n- **Expiration Date:** ${expDate}\n- **Monthly Rent:** $${l.rentAmount?.toLocaleString() || 0}\n- **Status:** ${l.status || 'Active'}`;
                        }).join('\n\n');
                }
                else if (activeLeasesList.length > 0) {
                    responseText = `There are no leases expiring in the current month. The upcoming lease expirations in your portfolio are:\n\n` +
                        activeLeasesList.slice(0, 3).map((l, idx) => {
                            const tName = l.tenant ? `${l.tenant.firstName || ''} ${l.tenant.lastName || ''}`.trim() : 'Resident';
                            const pName = l.property?.name || 'Property';
                            const uNum = l.unit?.unitNumber ? (String(l.unit.unitNumber).toLowerCase().startsWith('unit') ? l.unit.unitNumber : `Unit ${l.unit.unitNumber}`) : 'Unit N/A';
                            const expDate = l.endDate ? new Date(l.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
                            return `**${idx + 1}. ${tName}** - ${pName}, ${uNum} (Ending: ${expDate}, Rent: $${l.rentAmount})`;
                        }).join('\n');
                }
                else {
                    responseText = `Tenants & Leases Overview: You currently have ${tenantsCount} active tenants and ${leasesCount} active leases. None are expiring this month.`;
                }
            }
            else if (q.includes('tenant') || q.includes('resident')) {
                responseText = `Tenants & Leases Overview: Your company has ${tenantsCount} active tenants and ${leasesCount} active leases on file (${expiringLeasesCount} expiring this month).`;
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
                    prompt: `[CHAT:${activeChatId}] ${prompt}`,
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
            chatId: activeChatId,
        };
    }
    // --- AI CONVERSATION MANAGEMENT & PERSISTENCE ---
    async getAiConversations(userPayload) {
        const companyId = userPayload?.companyId;
        const userId = userPayload?.userId;
        const whereClause = {};
        if (companyId)
            whereClause.companyId = companyId;
        else if (userId)
            whereClause.userId = userId;
        const logs = await database_1.default.aiChatLog.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        const convMap = new Map();
        logs.forEach((log) => {
            const match = log.prompt.match(/^\[CHAT:([^\]]+)\]/);
            const chatId = match ? match[1] : 'default-chat';
            const cleanPrompt = log.prompt.replace(/^\[CHAT:[^\]]+\]\s*/, '').trim();
            if (!convMap.has(chatId)) {
                const title = cleanPrompt.length > 32 ? cleanPrompt.substring(0, 32) + '...' : cleanPrompt || 'General Discussion';
                convMap.set(chatId, {
                    id: chatId,
                    name: title,
                    module: 'General',
                    createdAt: log.createdAt.toISOString().split('T')[0],
                    status: 'Active',
                });
            }
        });
        const list = Array.from(convMap.values());
        if (list.length === 0) {
            list.push({
                id: 'default-chat',
                name: 'General Discussion',
                module: 'General',
                createdAt: new Date().toISOString().split('T')[0],
                status: 'Active',
            });
        }
        return list;
    }
    async getAiConversationMessages(chatId, userPayload) {
        const companyId = userPayload?.companyId;
        const userId = userPayload?.userId;
        const whereClause = {
            prompt: { startsWith: `[CHAT:${chatId}]` },
        };
        if (companyId)
            whereClause.companyId = companyId;
        else if (userId)
            whereClause.userId = userId;
        let logs = await database_1.default.aiChatLog.findMany({
            where: whereClause,
            orderBy: { createdAt: 'asc' },
            take: 50,
        });
        if (logs.length === 0 && chatId === 'default-chat') {
            logs = await database_1.default.aiChatLog.findMany({
                where: {
                    ...(companyId ? { companyId } : {}),
                    NOT: { prompt: { startsWith: '[CHAT:' } },
                },
                orderBy: { createdAt: 'asc' },
                take: 50,
            });
        }
        const messages = [];
        logs.forEach((log) => {
            const cleanPrompt = log.prompt.replace(/^\[CHAT:[^\]]+\]\s*/, '').trim();
            messages.push({
                id: `${log.id}-user`,
                sender: 'User',
                text: cleanPrompt,
                timestamp: log.createdAt.toISOString(),
            });
            messages.push({
                id: `${log.id}-ai`,
                sender: 'AI',
                text: log.response,
                timestamp: log.createdAt.toISOString(),
            });
        });
        return messages;
    }
    async createAiConversation(name, module, userPayload) {
        const newChatId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        return {
            id: newChatId,
            name: name || 'New Discussion',
            module: module || 'General',
            createdAt: new Date().toISOString().split('T')[0],
            status: 'Active',
        };
    }
    async deleteAiConversation(chatId, userPayload) {
        const companyId = userPayload?.companyId;
        const userId = userPayload?.userId;
        const companyOrUser = companyId ? { companyId } : userId ? { userId } : {};
        if (chatId === 'default-chat') {
            await database_1.default.aiChatLog.deleteMany({
                where: {
                    ...companyOrUser,
                    OR: [
                        { prompt: { startsWith: '[CHAT:default-chat]' } },
                        { NOT: { prompt: { startsWith: '[CHAT:' } } },
                    ],
                },
            });
        }
        else {
            await database_1.default.aiChatLog.deleteMany({
                where: {
                    ...companyOrUser,
                    prompt: { startsWith: `[CHAT:${chatId}]` },
                },
            });
        }
        return true;
    }
    // --- 1-to-1 Direct Messaging (Strict Role/User filtering - Zero Leakage) ---
    async getUserDisplayNameAndRole(payload) {
        let name = payload.email.split('@')[0];
        let role = payload.roleName || 'User';
        if (payload.roleName === 'Tenant') {
            const tenant = await database_1.default.tenant.findFirst({ where: { email: payload.email } });
            if (tenant) {
                name = `${tenant.firstName} ${tenant.lastName}`;
                role = 'Tenant';
            }
        }
        else if (payload.roleName === 'Owner') {
            const owner = await database_1.default.owner.findFirst({ where: { email: payload.email } });
            if (owner) {
                name = owner.name;
                role = 'Owner';
            }
        }
        else if (payload.roleName === 'Maintenance Staff') {
            const staff = await database_1.default.staffProfile.findFirst({ where: { email: payload.email } });
            if (staff) {
                name = staff.name;
            }
            role = 'Maintenance Staff';
        }
        else if (payload.roleName?.includes('Collection')) {
            role = 'Collection Staff';
        }
        else if (payload.roleName?.includes('Manager') || payload.roleName?.includes('Admin')) {
            role = 'Property Manager';
        }
        if (payload.userId) {
            const u = await database_1.default.user.findUnique({ where: { id: payload.userId } });
            if (u && (u.firstName || u.lastName)) {
                name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || name;
            }
        }
        return { name, role, email: payload.email };
    }
    async getDirectContacts(payload) {
        const { role } = await this.getUserDisplayNameAndRole(payload);
        const contacts = [];
        // All roles can communicate with Property Manager
        if (role !== 'Property Manager') {
            contacts.push({ id: 'contact-manager', name: 'Property Manager', role: 'Property Manager' });
        }
        if (role === 'Tenant') {
            contacts.push({ id: 'contact-collection', name: 'Collection Staff', role: 'Collection Staff' }, { id: 'contact-maintenance', name: 'Maintenance Staff', role: 'Maintenance Staff' }, { id: 'contact-owner', name: 'Property Owner', role: 'Owner' });
        }
        else if (role === 'Owner') {
            contacts.push({ id: 'contact-collection', name: 'Collection Staff', role: 'Collection Staff' }, { id: 'contact-maintenance', name: 'Maintenance Staff', role: 'Maintenance Staff' });
            const tenants = await database_1.default.tenant.findMany({
                take: 30,
                select: { id: true, firstName: true, lastName: true, email: true },
            });
            tenants.forEach((t) => {
                contacts.push({
                    id: `tenant-${t.id}`,
                    name: `${t.firstName} ${t.lastName}`,
                    role: 'Tenant',
                    email: t.email,
                });
            });
        }
        else if (role === 'Collection Staff') {
            contacts.push({ id: 'contact-maintenance', name: 'Maintenance Staff', role: 'Maintenance Staff' });
            const tenants = await database_1.default.tenant.findMany({
                take: 30,
                select: { id: true, firstName: true, lastName: true, email: true },
            });
            tenants.forEach((t) => {
                contacts.push({
                    id: `tenant-${t.id}`,
                    name: `${t.firstName} ${t.lastName}`,
                    role: 'Tenant',
                    email: t.email,
                });
            });
        }
        else if (role === 'Maintenance Staff') {
            contacts.push({ id: 'contact-collection', name: 'Collection Staff', role: 'Collection Staff' });
            const tenants = await database_1.default.tenant.findMany({
                take: 30,
                select: { id: true, firstName: true, lastName: true, email: true },
            });
            tenants.forEach((t) => {
                contacts.push({
                    id: `tenant-${t.id}`,
                    name: `${t.firstName} ${t.lastName}`,
                    role: 'Tenant',
                    email: t.email,
                });
            });
        }
        else {
            // Property Manager: fetch real staff, tenants, and owners from DB
            const [staffUsers, tenants, owners] = await Promise.all([
                database_1.default.user.findMany({
                    where: {
                        role: {
                            name: {
                                in: ['Maintenance Staff', 'Collection Manager', 'Collection Staff'],
                            },
                        },
                    },
                    include: { role: true },
                    take: 20,
                }),
                database_1.default.tenant.findMany({
                    take: 50,
                    select: { id: true, firstName: true, lastName: true, email: true },
                }),
                database_1.default.owner.findMany({
                    take: 30,
                    select: { id: true, name: true, email: true },
                }),
            ]);
            staffUsers.forEach((s) => {
                const staffName = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.email;
                contacts.push({
                    id: `staff-${s.id}`,
                    name: staffName,
                    role: s.role?.name || 'Staff',
                    email: s.email,
                });
            });
            // If no collection staff user is registered yet, provide the direct desk
            if (!staffUsers.some((s) => (s.role?.name || '').includes('Collection'))) {
                contacts.push({ id: 'contact-collection', name: 'Collection Desk', role: 'Collection Staff' });
            }
            tenants.forEach((t) => {
                const tName = `${t.firstName || ''} ${t.lastName || ''}`.trim();
                if (tName) {
                    contacts.push({
                        id: `tenant-${t.id}`,
                        name: tName,
                        role: 'Tenant',
                        email: t.email,
                    });
                }
            });
            owners.forEach((o) => {
                const oName = o.name?.trim();
                if (oName) {
                    contacts.push({
                        id: `owner-${o.id}`,
                        name: oName,
                        role: 'Owner',
                        email: o.email,
                    });
                }
            });
        }
        return contacts;
    }
    async getDirectMessages(payload) {
        const { name, role, email } = await this.getUserDisplayNameAndRole(payload);
        // ZERO LEAKAGE: Query messages where sender or recipient matches user or user's role
        const rawMessages = await database_1.default.tenantMessage.findMany({
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
        // Match if sender or recipient matches user's email, exact name, or role title
        const userTokens = [
            email.toLowerCase(),
            name.toLowerCase(),
            role.toLowerCase(),
        ];
        const isMatch = (fieldStr) => {
            const lower = (fieldStr || '').toLowerCase();
            return userTokens.some((t) => lower.includes(t));
        };
        const userMessages = rawMessages.filter((m) => {
            return isMatch(m.sender) || isMatch(m.recipient);
        });
        return userMessages.map((m) => {
            const isOutbound = isMatch(m.sender);
            return {
                id: m.id,
                sender: m.sender,
                recipient: m.recipient,
                subject: m.subject,
                body: m.body,
                createdAt: m.createdAt,
                isOutbound,
                contactName: isOutbound ? m.recipient : m.sender,
            };
        });
    }
    async sendDirectMessage(payload, data) {
        const { name, role } = await this.getUserDisplayNameAndRole(payload);
        const sender = `${name} (${role})`;
        const newMsg = await database_1.default.tenantMessage.create({
            data: {
                sender,
                recipient: data.recipient,
                subject: data.subject || 'Direct Chat',
                body: data.body,
            },
        });
        return {
            id: newMsg.id,
            sender: newMsg.sender,
            recipient: newMsg.recipient,
            subject: newMsg.subject,
            body: newMsg.body,
            createdAt: newMsg.createdAt,
            isOutbound: true,
            contactName: newMsg.recipient,
        };
    }
}
exports.SecondaryService = SecondaryService;
exports.secondaryService = new SecondaryService();
