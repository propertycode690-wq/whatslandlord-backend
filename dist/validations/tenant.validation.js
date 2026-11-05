"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTenantSchema = exports.createTenantSchema = void 0;
const zod_1 = require("zod");
const tenantStatusEnum = zod_1.z.enum(['Active', 'Inactive', 'Pending']);
exports.createTenantSchema = zod_1.z.object({
    body: zod_1.z.object({
        firstName: zod_1.z.string({ required_error: 'First name is required' }).trim().min(1, 'First name is required').max(100),
        lastName: zod_1.z.string({ required_error: 'Last name is required' }).trim().min(1, 'Last name is required').max(100),
        email: zod_1.z.string({ required_error: 'Email is required' }).trim().email('Invalid email address format').max(255),
        phone: zod_1.z.string({ required_error: 'Phone number is required' }).trim().min(1, 'Phone number is required').max(30),
        unitId: zod_1.z.string().uuid('Invalid Unit ID format').optional().nullable(),
        status: tenantStatusEnum.default('Pending'),
        password: zod_1.z.string({ required_error: 'Password is required' }).min(6, 'Password must be at least 6 characters'),
        dob: zod_1.z.string().optional().nullable(),
        preferredName: zod_1.z.string().optional().nullable(),
        altPhone: zod_1.z.string().optional().nullable(),
        moveInDate: zod_1.z.string().optional().nullable(),
        invoiceStartDate: zod_1.z.string().optional().nullable(),
        gender: zod_1.z.string().optional().nullable(),
        previousBalance: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
        openingBalance: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
    }),
});
exports.updateTenantSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid('Invalid tenant ID format'),
    }),
    body: zod_1.z.object({
        firstName: zod_1.z.string().trim().min(1, 'First name cannot be empty').max(100).optional(),
        lastName: zod_1.z.string().trim().min(1, 'Last name cannot be empty').max(100).optional(),
        email: zod_1.z.string().trim().email('Invalid email address format').max(255).optional(),
        phone: zod_1.z.string().trim().min(1, 'Phone number cannot be empty').max(30).optional(),
        unitId: zod_1.z.string().uuid('Invalid Unit ID format').optional().nullable(),
        status: tenantStatusEnum.optional(),
        password: zod_1.z.string().min(6, 'Password must be at least 6 characters').optional().nullable().or(zod_1.z.literal('')),
        dob: zod_1.z.string().optional().nullable(),
        nationality: zod_1.z.string().optional().nullable(),
        idType: zod_1.z.string().optional().nullable(),
        idNumber: zod_1.z.string().optional().nullable(),
        emergencyName: zod_1.z.string().optional().nullable(),
        emergencyRelationship: zod_1.z.string().optional().nullable(),
        emergencyPhone: zod_1.z.string().optional().nullable(),
        employer: zod_1.z.string().optional().nullable(),
        position: zod_1.z.string().optional().nullable(),
        monthlyIncome: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
        employmentStatus: zod_1.z.string().optional().nullable(),
        currentAddress: zod_1.z.string().optional().nullable(),
        previousAddress: zod_1.z.string().optional().nullable(),
        preferredName: zod_1.z.string().optional().nullable(),
        altPhone: zod_1.z.string().optional().nullable(),
        gender: zod_1.z.string().optional().nullable(),
        previousBalance: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
        openingBalance: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
    }),
});
