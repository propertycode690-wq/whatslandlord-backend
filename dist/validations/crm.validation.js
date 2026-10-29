"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCrmLeadSchema = void 0;
const zod_1 = require("zod");
const validationHelpers_1 = require("./validationHelpers");
exports.createCrmLeadSchema = zod_1.z.object({
    body: zod_1.z.object({
        id: zod_1.z.string().uuid('Invalid Lead ID format').optional(),
        name: zod_1.z.string().trim().max(150).optional(),
        firstName: zod_1.z.string().trim().max(100).optional(),
        lastName: zod_1.z.string().trim().max(100).optional(),
        email: zod_1.z.string().trim().email('Invalid email address format').max(255).optional(),
        phone: zod_1.z.string().trim().max(30).optional(),
        source: zod_1.z.string().trim().max(100).optional(),
        status: zod_1.z.string().trim().max(50).optional(),
        budget: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Budget cannot be negative')).optional().nullable(),
        moveInDate: zod_1.z.string().trim().max(50).optional().nullable(),
        priority: zod_1.z.string().trim().max(50).optional(),
        assignedAgent: zod_1.z.string().trim().max(150).optional().nullable(),
        notes: zod_1.z.string().optional().nullable(),
        property: zod_1.z.string().trim().max(255).optional().nullable(),
        companyId: zod_1.z.string().uuid('Invalid company ID format').optional().nullable(),
    }),
});
