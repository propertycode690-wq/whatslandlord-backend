"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUnitSchema = exports.createUnitSchema = void 0;
const zod_1 = require("zod");
const validationHelpers_1 = require("./validationHelpers");
const unitStatusEnum = zod_1.z.enum([
    'Occupied',
    'Vacant',
    'Reserved',
    'UnderMaintenance',
    'Vacant_Needs_Preparation',
    'Under Maintenance',
    'Vacant Needs Preparation',
]);
exports.createUnitSchema = zod_1.z.object({
    body: zod_1.z.object({
        propertyId: zod_1.z.string({ required_error: 'Property ID is required' }).uuid('Invalid Property ID format'),
        buildingId: zod_1.z.string().uuid('Invalid Building ID format').optional(),
        unitNumber: zod_1.z.string({ required_error: 'Unit number is required' }).min(1, 'Unit number is required').max(50),
        floor: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().int('Floor must be an integer')).default(1),
        bedrooms: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().int('Bedrooms must be an integer').min(0, 'Bedrooms cannot be negative')).default(1),
        bathrooms: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Bathrooms cannot be negative')).default(1),
        squareFootage: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Square footage cannot be negative')).default(0),
        rentAmount: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Rent amount cannot be negative')).default(0),
        securityDeposit: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Security deposit cannot be negative')).default(0),
        availabilityDate: (0, validationHelpers_1.safeDateSchema)().default(() => new Date()),
        status: unitStatusEnum.default('Vacant'),
        isLateFeeEnabled: zod_1.z.boolean().optional().default(false),
        lateFeeType: zod_1.z.enum(['FLAT', 'PERCENTAGE']).optional().default('FLAT'),
        lateFeeAmount: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0)).optional().nullable(),
        lateFeeGraceDays: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().int().min(0)).optional().nullable(),
    }),
});
exports.updateUnitSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid('Invalid unit ID format'),
    }),
    body: zod_1.z.object({
        propertyId: zod_1.z.string().uuid('Invalid Property ID format').optional(),
        buildingId: zod_1.z.string().uuid('Invalid Building ID format').optional().nullable(),
        unitNumber: zod_1.z.string().min(1, 'Unit number cannot be empty').max(50).optional(),
        floor: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().int('Floor must be an integer')).optional(),
        bedrooms: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().int('Bedrooms must be an integer').min(0, 'Bedrooms cannot be negative')).optional(),
        bathrooms: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Bathrooms cannot be negative')).optional(),
        squareFootage: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Square footage cannot be negative')).optional(),
        rentAmount: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Rent amount cannot be negative')).optional(),
        securityDeposit: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Security deposit cannot be negative')).optional(),
        availabilityDate: (0, validationHelpers_1.safeDateSchema)().optional(),
        status: unitStatusEnum.optional(),
        isLateFeeEnabled: zod_1.z.boolean().optional(),
        lateFeeType: zod_1.z.enum(['FLAT', 'PERCENTAGE']).optional(),
        lateFeeAmount: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0)).optional().nullable(),
        lateFeeGraceDays: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().int().min(0)).optional().nullable(),
    }),
});
