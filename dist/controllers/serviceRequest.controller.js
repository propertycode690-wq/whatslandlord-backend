"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceRequestController = void 0;
const database_1 = __importDefault(require("../config/database"));
const apiResponse_1 = require("../utils/apiResponse");
const notification_helper_1 = require("../services/notification.helper");
class ServiceRequestController {
    async getAll(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            let requests = await database_1.default.serviceRequest.findMany({
                where: companyId ? { companyId } : {},
                orderBy: { createdAt: 'desc' },
            });
            // Seed sample service requests if DB is empty for this company
            if (requests.length === 0) {
                const property = await database_1.default.property.findFirst({
                    where: companyId ? { companyId } : {},
                });
                const tenant = await database_1.default.tenant.findFirst({
                    where: companyId ? { companyId } : {},
                });
                const vendor = await database_1.default.vendor.findFirst();
                const propertyId = property?.id || 'default-property';
                const propertyName = property?.name || 'Oakridge Heights';
                const tenantId = tenant?.id;
                const tenantName = tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Alex Mercer';
                const vendorName = vendor?.companyName || 'ProFix Solutions';
                const vendorId = vendor?.id;
                const seeds = [
                    {
                        title: 'AC Not Cooling – Unit 204',
                        description: 'Tenant reports the HVAC unit is not producing cool air. Temperature inside exceeds 85°F.',
                        propertyId, propertyName, unitNumber: '204', tenantId, tenantName,
                        priority: 'High', status: 'In Progress', category: 'HVAC',
                        assignedVendorId: vendorId, assignedVendorName: vendorName,
                        assignedTechnician: 'Technician Lead 1',
                        estimatedCost: 350, cost: 350, scheduledDate: new Date().toISOString().split('T')[0],
                        messages: JSON.stringify([
                            { id: 'msg-1', senderName: tenantName, role: 'Tenant', text: 'AC stopped working last night. Very hot inside.', timestamp: '2026-07-24 09:12 AM' },
                            { id: 'msg-2', senderName: 'Property Manager', role: 'Manager', text: 'Vendor dispatched. They will arrive by 2 PM.', timestamp: '2026-07-24 10:30 AM' },
                        ]),
                        companyId,
                    },
                    {
                        title: 'Water Leak Under Kitchen Sink',
                        description: 'Slow drip under kitchen sink. Tenant reports cabinet floor is wet.',
                        propertyId, propertyName, unitNumber: '102', tenantId, tenantName,
                        priority: 'Emergency', status: 'New', category: 'Plumbing',
                        estimatedCost: 180, cost: 0,
                        messages: JSON.stringify([]),
                        companyId,
                    },
                    {
                        title: 'Broken Window Latch – Unit 303',
                        description: 'Window latch broken, cannot secure window. Security concern.',
                        propertyId, propertyName, unitNumber: '303', tenantId, tenantName,
                        priority: 'Normal', status: 'Completed', category: 'General',
                        assignedVendorId: vendorId, assignedVendorName: vendorName,
                        estimatedCost: 120, cost: 95, scheduledDate: '2026-07-20',
                        messages: JSON.stringify([
                            { id: 'msg-3', senderName: 'Property Manager', role: 'Manager', text: 'Repair completed. Window latch replaced.', timestamp: '2026-07-20 03:45 PM' },
                        ]),
                        companyId,
                    },
                    {
                        title: 'Dryer Not Heating – Unit 408',
                        description: 'Laundry dryer runs but does not heat. Tenant cannot dry clothes.',
                        propertyId, propertyName, unitNumber: '408', tenantId, tenantName,
                        priority: 'Normal', status: 'Assigned', category: 'Electrical',
                        assignedVendorId: vendorId, assignedVendorName: vendorName,
                        estimatedCost: 200, cost: 200, scheduledDate: new Date().toISOString().split('T')[0],
                        messages: JSON.stringify([]),
                        companyId,
                    },
                    {
                        title: 'Hallway Light Flickering',
                        description: 'Common area hallway light on 2nd floor is flickering. Possible wiring issue.',
                        propertyId, propertyName, unitNumber: 'Common', tenantId, tenantName,
                        priority: 'Low', status: 'New', category: 'Electrical',
                        messages: JSON.stringify([]),
                        companyId,
                    },
                ];
                await database_1.default.serviceRequest.createMany({ data: seeds });
                requests = await database_1.default.serviceRequest.findMany({
                    where: companyId ? { companyId } : {},
                    orderBy: { createdAt: 'desc' },
                });
            }
            const formatted = requests.map((r, index) => ({
                ...r,
                id: r.id,
                requestNumber: `SR-${2001 + index}`,
                messages: (() => {
                    try {
                        return JSON.parse(r.messages);
                    }
                    catch {
                        return [];
                    }
                })(),
                createdAt: r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            }));
            return (0, apiResponse_1.sendSuccess)({ res, data: formatted });
        }
        catch (error) {
            next(error);
        }
    }
    async getById(req, res, next) {
        try {
            const id = req.params.id;
            const companyId = req.user?.companyId;
            const request = await database_1.default.serviceRequest.findFirst({
                where: companyId ? { id, companyId } : { id },
            });
            if (!request) {
                return res.status(404).json({ success: false, error: { message: 'Service request not found' } });
            }
            return (0, apiResponse_1.sendSuccess)({ res, data: {
                    ...request,
                    messages: (() => {
                        try {
                            return JSON.parse(request.messages);
                        }
                        catch {
                            return [];
                        }
                    })(),
                } });
        }
        catch (error) {
            next(error);
        }
    }
    async create(req, res, next) {
        try {
            const { title, description, propertyId, propertyName, unitNumber, tenantId, tenantName, priority, status, category, assignedVendorId, assignedVendorName, assignedTechnician, estimatedCost, cost, scheduledDate, notes, } = req.body;
            const companyId = req.user?.companyId;
            let finalVendorId = assignedVendorId || null;
            let finalVendorName = assignedVendorName || null;
            let finalTechnician = assignedTechnician || null;
            // Auto-assign matching vendor if not manually specified
            if (!finalVendorId) {
                const reqCategory = (category || 'General').toLowerCase();
                const vendor = await database_1.default.vendor.findFirst({
                    where: companyId
                        ? { companyId, serviceType: { contains: reqCategory } }
                        : { serviceType: { contains: reqCategory } },
                    orderBy: { rating: 'desc' },
                });
                if (vendor) {
                    finalVendorId = vendor.id;
                    finalVendorName = vendor.companyName;
                    finalTechnician = `${vendor.contactName} (Lead Technician)`;
                }
                else {
                    const fallbackVendor = await database_1.default.vendor.findFirst({
                        where: companyId ? { companyId } : {},
                        orderBy: { rating: 'desc' },
                    });
                    if (fallbackVendor) {
                        finalVendorId = fallbackVendor.id;
                        finalVendorName = fallbackVendor.companyName;
                        finalTechnician = `${fallbackVendor.contactName} (Lead Technician)`;
                    }
                }
            }
            const request = await database_1.default.serviceRequest.create({
                data: {
                    title: title || 'Untitled Request',
                    description: description || '',
                    propertyId: propertyId || 'default',
                    propertyName: propertyName || 'Unknown Property',
                    unitNumber: unitNumber || '',
                    tenantId: tenantId || null,
                    tenantName: tenantName || 'Unknown Tenant',
                    priority: priority || 'Normal',
                    status: status || (finalVendorId ? 'Assigned' : 'New'),
                    category: category || 'General',
                    assignedVendorId: finalVendorId,
                    assignedVendorName: finalVendorName,
                    assignedTechnician: finalTechnician,
                    estimatedCost: estimatedCost ? parseFloat(estimatedCost) : null,
                    cost: cost ? parseFloat(cost) : null,
                    scheduledDate: scheduledDate || null,
                    notes: notes || null,
                    messages: '[]',
                    companyId,
                },
            });
            // Dispatch Notifications
            await (0, notification_helper_1.createNotification)({
                title: 'New Service Request',
                message: `Request "${title || 'Maintenance'}" submitted by ${tenantName || 'Resident'} for ${propertyName || 'Property'} (Unit ${unitNumber || 'N/A'})`,
                role: 'Property Manager',
                companyId,
                targetId: request.id,
            });
            await (0, notification_helper_1.createNotification)({
                title: 'New Service Request Logged',
                message: `${priority || 'Normal'} priority: "${title || 'Maintenance'}" at ${propertyName || 'Property'} Unit ${unitNumber || 'N/A'}`,
                role: 'Maintenance Staff',
                companyId,
                targetId: request.id,
            });
            await (0, notification_helper_1.createNotification)({
                title: 'Request Received',
                message: `Your maintenance request "${title || 'Maintenance'}" has been logged successfully.`,
                role: 'Tenant',
                companyId,
                targetId: tenantId || req.user?.userId || req.user?.id,
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: { ...request, messages: [], requestNumber: `SR-${Date.now()}` } });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const id = req.params.id;
            const { newMessage, status, priority, assignedVendorId, assignedVendorName, assignedTechnician, estimatedCost, cost, scheduledDate, notes } = req.body;
            const companyId = req.user?.companyId;
            if (companyId) {
                const check = await database_1.default.serviceRequest.findFirst({
                    where: { id, companyId },
                });
                if (!check)
                    throw new Error('ServiceRequest not found.');
            }
            // Get current messages if adding a new one
            let messagesData;
            if (newMessage) {
                const current = await database_1.default.serviceRequest.findUnique({ where: { id } });
                let msgs = [];
                try {
                    msgs = JSON.parse(current?.messages || '[]');
                }
                catch { }
                msgs.push({
                    id: `msg-${Date.now()}`,
                    senderName: newMessage.senderName,
                    role: newMessage.role,
                    text: newMessage.text,
                    timestamp: new Date().toLocaleString(),
                });
                messagesData = JSON.stringify(msgs);
            }
            const request = await database_1.default.serviceRequest.update({
                where: { id },
                data: {
                    ...(status && { status }),
                    ...(priority && { priority }),
                    ...(assignedVendorId !== undefined && { assignedVendorId }),
                    ...(assignedVendorName !== undefined && { assignedVendorName }),
                    ...(assignedTechnician !== undefined && { assignedTechnician }),
                    ...(estimatedCost !== undefined && { estimatedCost: parseFloat(estimatedCost) }),
                    ...(cost !== undefined && { cost: parseFloat(cost) }),
                    ...(scheduledDate !== undefined && { scheduledDate }),
                    ...(notes !== undefined && { notes }),
                    ...(messagesData !== undefined && { messages: messagesData }),
                },
            });
            // Automatically generate Expense when Maintenance Service Request is marked Completed with a cost
            if (request.status === 'Completed' && request.cost && request.cost > 0) {
                const descSearch = `ID: ${request.id}`;
                const existingExpense = await database_1.default.expense.findFirst({
                    where: {
                        description: {
                            contains: descSearch,
                        },
                    },
                });
                if (!existingExpense) {
                    await database_1.default.$transaction(async (tx) => {
                        const expense = await tx.expense.create({
                            data: {
                                category: 'Maintenance',
                                amount: request.cost || 0,
                                date: new Date(),
                                description: `Maintenance Request: ${request.title} (ID: ${request.id})`,
                            },
                        });
                        // 1. Debit Maintenance Expense account: e.g. "5010" or first Account of type "Expense"
                        const expenseAccount = await tx.coAAccount.findFirst({
                            where: request.companyId
                                ? { companyId: request.companyId, OR: [{ accountCode: '5010' }, { type: 'Expense' }] }
                                : { OR: [{ accountCode: '5010' }, { type: 'Expense' }] }
                        });
                        if (expenseAccount) {
                            await tx.coAAccount.update({
                                where: { id: expenseAccount.id },
                                data: { balance: { increment: expense.amount } }
                            });
                        }
                        // 2. Credit Checking Account: e.g. "1010" or first Account of type "Asset"
                        const checkingAccount = await tx.coAAccount.findFirst({
                            where: request.companyId
                                ? { companyId: request.companyId, OR: [{ accountCode: '1010' }, { type: 'Asset' }] }
                                : { OR: [{ accountCode: '1010' }, { type: 'Asset' }] }
                        });
                        if (checkingAccount) {
                            await tx.coAAccount.update({
                                where: { id: checkingAccount.id },
                                data: { balance: { decrement: expense.amount } }
                            });
                        }
                    });
                }
            }
            return (0, apiResponse_1.sendSuccess)({ res, data: {
                    ...request,
                    messages: (() => {
                        try {
                            return JSON.parse(request.messages);
                        }
                        catch {
                            return [];
                        }
                    })(),
                } });
        }
        catch (error) {
            next(error);
        }
    }
    async remove(req, res, next) {
        try {
            const id = req.params.id;
            const companyId = req.user?.companyId;
            if (companyId) {
                const check = await database_1.default.serviceRequest.findFirst({
                    where: { id, companyId },
                });
                if (!check)
                    throw new Error('ServiceRequest not found.');
            }
            await database_1.default.serviceRequest.delete({ where: { id } });
            return (0, apiResponse_1.sendSuccess)({ res, data: { deleted: true } });
        }
        catch (error) {
            next(error);
        }
    }
    // --- AI INSTANT DIY TROUBLESHOOTING SUGGESTIONS ---
    async troubleshoot(req, res, next) {
        try {
            const { title, description, category } = req.body;
            const textToAnalyze = `${title || ''} ${description || ''}`.trim();
            const openAiApiKey = process.env.OPENAI_API_KEY || '';
            let tips = [];
            let detectedCategory = category || 'General';
            let emergencyAlert = false;
            const lower = textToAnalyze.toLowerCase();
            if (lower.includes('leak') || lower.includes('water') || lower.includes('drip') || lower.includes('flood') || lower.includes('clog') || lower.includes('toilet') || lower.includes('sink')) {
                detectedCategory = 'Plumbing';
                if (lower.includes('flood') || lower.includes('burst') || lower.includes('ceiling')) {
                    emergencyAlert = true;
                }
            }
            else if (lower.includes('ac') || lower.includes('hvac') || lower.includes('heat') || lower.includes('cold') || lower.includes('cooling') || lower.includes('thermostat')) {
                detectedCategory = 'HVAC';
            }
            else if (lower.includes('power') || lower.includes('light') || lower.includes('plug') || lower.includes('breaker') || lower.includes('outlet') || lower.includes('spark') || lower.includes('wire')) {
                detectedCategory = 'Electrical';
                if (lower.includes('spark') || lower.includes('smoke') || lower.includes('fire')) {
                    emergencyAlert = true;
                }
            }
            else if (lower.includes('disposal') || lower.includes('dryer') || lower.includes('washer') || lower.includes('fridge') || lower.includes('refrigerator') || lower.includes('stove') || lower.includes('oven')) {
                detectedCategory = 'Appliance';
            }
            if (openAiApiKey && openAiApiKey !== 'your_openai_api_key_here' && openAiApiKey.trim().length > 10) {
                try {
                    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${openAiApiKey.trim()}`,
                        },
                        body: JSON.stringify({
                            model: process.env.OPENAI_MODEL || 'gpt-4o',
                            messages: [
                                {
                                    role: 'system',
                                    content: 'You are an expert home maintenance technician. A resident reported an issue. Provide 3 short, practical, safe DIY troubleshooting steps the resident can try right now before a contractor is dispatched. Output ONLY 3 bullet points, each under 18 words.',
                                },
                                { role: 'user', content: `Issue: ${textToAnalyze}` },
                            ],
                            temperature: 0.3,
                            max_tokens: 250,
                        }),
                    });
                    if (aiResponse.ok) {
                        const aiJson = await aiResponse.json();
                        const rawContent = aiJson.choices?.[0]?.message?.content?.trim() || '';
                        tips = rawContent
                            .split('\n')
                            .map((line) => line.replace(/^[-*•\d.]+\s*/, '').trim())
                            .filter((line) => line.length > 5);
                    }
                }
                catch (e) {
                    console.warn('[AI DIY Troubleshooting] OpenAI call failed, using rule engine:', e);
                }
            }
            // Rule-based fallback if OpenAI is unconfigured or failed
            if (tips.length === 0) {
                if (detectedCategory === 'Plumbing') {
                    tips = [
                        'Locate shutoff valve under sink or toilet and turn clockwise to stop active water flow.',
                        'For clogged drains or toilets, use a plunger firmly with 5-10 smooth plunges.',
                        'Place a bucket or towels underneath to catch drips while waiting for technician.',
                    ];
                }
                else if (detectedCategory === 'HVAC') {
                    tips = [
                        'Check thermostat settings: ensure mode is set to COOL/HEAT and batteries are fresh.',
                        'Verify HVAC return vent filter is clean and not blocked by dust or furniture.',
                        'Inspect main electrical panel to see if the AC/Heat circuit breaker tripped.',
                    ];
                }
                else if (detectedCategory === 'Electrical') {
                    tips = [
                        'Press the red/TEST & RESET button on GFCI wall outlets (commonly in kitchens/baths).',
                        'Check main circuit breaker panel for any switches flipped to the middle or OFF position.',
                        'Unplug high-draw appliances from the circuit to test if breaker is overloaded.',
                    ];
                }
                else if (detectedCategory === 'Appliance') {
                    tips = [
                        'Garbage disposal: press the small red RESET button located underneath the disposal body under sink.',
                        'Dryer: clean lint trap filter thoroughly and inspect rear exhaust duct connection.',
                        'Unplug appliance for 60 seconds to reset internal electronic control boards.',
                    ];
                }
                else {
                    tips = [
                        'Check for any loose screws, obstructions, or debris blocking hinges/tracks.',
                        'Ensure power cords or switches nearby are securely plugged in.',
                        'Take a clear photo/video of the issue to attach to your ticket for faster service.',
                    ];
                }
            }
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    tips,
                    category: detectedCategory,
                    emergencyAlert,
                    suggestionTitle: `Instant DIY Troubleshooting Tips for ${detectedCategory}`,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    // --- AI AUTO VENDOR ASSIGNMENT ---
    async autoAssign(req, res, next) {
        try {
            const { title, description, category } = req.body;
            const companyId = req.user?.companyId;
            let vendors = await database_1.default.vendor.findMany({
                where: companyId ? { companyId } : {},
            });
            if (vendors.length === 0) {
                vendors = await database_1.default.vendor.findMany({ take: 10 });
            }
            const reqCategory = (category || 'General').toLowerCase();
            const textToAnalyze = `${title || ''} ${description || ''}`.toLowerCase();
            const scoredVendors = vendors.map((v) => {
                let matchScore = 70;
                const serviceTypeLower = (v.serviceType || '').toLowerCase();
                if (serviceTypeLower.includes(reqCategory) || reqCategory.includes(serviceTypeLower)) {
                    matchScore += 20;
                }
                if (textToAnalyze.includes('leak') || textToAnalyze.includes('pipe') || textToAnalyze.includes('toilet') || textToAnalyze.includes('sink')) {
                    if (serviceTypeLower.includes('plumbing'))
                        matchScore += 15;
                }
                else if (textToAnalyze.includes('ac') || textToAnalyze.includes('hvac') || textToAnalyze.includes('heat') || textToAnalyze.includes('cooling')) {
                    if (serviceTypeLower.includes('hvac') || serviceTypeLower.includes('air'))
                        matchScore += 15;
                }
                else if (textToAnalyze.includes('power') || textToAnalyze.includes('light') || textToAnalyze.includes('wire') || textToAnalyze.includes('outlet')) {
                    if (serviceTypeLower.includes('electric'))
                        matchScore += 15;
                }
                matchScore += Math.round((v.rating || 4.5) * 2);
                matchScore = Math.min(99, Math.max(75, matchScore));
                return {
                    vendorId: v.id,
                    vendorName: v.companyName,
                    contactName: v.contactName,
                    email: v.email,
                    phone: v.phone,
                    serviceType: v.serviceType,
                    rating: v.rating,
                    matchScore,
                    suggestedTechnician: `${v.contactName} (Lead Specialist)`,
                    reasoning: `${v.companyName} is a top-rated ${v.serviceType} contractor with a ${v.rating}★ rating, ideal for resolving ${category || 'general'} maintenance tickets.`,
                };
            });
            scoredVendors.sort((a, b) => b.matchScore - a.matchScore);
            const bestVendor = scoredVendors[0] || null;
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    recommendedVendor: bestVendor,
                    allMatches: scoredVendors,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.serviceRequestController = new ServiceRequestController();
