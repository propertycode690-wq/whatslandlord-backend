import { z } from 'zod';
import { safeNumberSchema, safeDateSchema } from './validationHelpers';

const unitStatusEnum = z.enum([
  'Occupied',
  'Vacant',
  'Reserved',
  'UnderMaintenance',
  'Vacant_Needs_Preparation',
  'Under Maintenance',
  'Vacant Needs Preparation',
]);

export const createUnitSchema = z.object({
  body: z.object({
    propertyId: z.string({ required_error: 'Property ID is required' }).uuid('Invalid Property ID format'),
    buildingId: z.string().uuid('Invalid Building ID format').optional(),
    unitNumber: z.string({ required_error: 'Unit number is required' }).min(1, 'Unit number is required').max(50),
    floor: safeNumberSchema(z.number().int('Floor must be an integer')).default(1),
    bedrooms: safeNumberSchema(z.number().int('Bedrooms must be an integer').min(0, 'Bedrooms cannot be negative')).default(1),
    bathrooms: safeNumberSchema(z.number().min(0, 'Bathrooms cannot be negative')).default(1),
    squareFootage: safeNumberSchema(z.number().min(0, 'Square footage cannot be negative')).default(0),
    rentAmount: safeNumberSchema(z.number().min(0, 'Rent amount cannot be negative')).default(0),
    securityDeposit: safeNumberSchema(z.number().min(0, 'Security deposit cannot be negative')).default(0),
    availabilityDate: safeDateSchema().default(() => new Date()),
    status: unitStatusEnum.default('Vacant'),
    isLateFeeEnabled: z.boolean().optional().default(false),
    lateFeeType: z.enum(['FLAT', 'PERCENTAGE']).optional().default('FLAT'),
    lateFeeAmount: safeNumberSchema(z.number().min(0)).optional().nullable(),
    lateFeeGraceDays: safeNumberSchema(z.number().int().min(0)).optional().nullable(),
  }),
});

export const updateUnitSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid unit ID format'),
  }),
  body: z.object({
    propertyId: z.string().uuid('Invalid Property ID format').optional(),
    buildingId: z.string().uuid('Invalid Building ID format').optional().nullable(),
    unitNumber: z.string().min(1, 'Unit number cannot be empty').max(50).optional(),
    floor: safeNumberSchema(z.number().int('Floor must be an integer')).optional(),
    bedrooms: safeNumberSchema(z.number().int('Bedrooms must be an integer').min(0, 'Bedrooms cannot be negative')).optional(),
    bathrooms: safeNumberSchema(z.number().min(0, 'Bathrooms cannot be negative')).optional(),
    squareFootage: safeNumberSchema(z.number().min(0, 'Square footage cannot be negative')).optional(),
    rentAmount: safeNumberSchema(z.number().min(0, 'Rent amount cannot be negative')).optional(),
    securityDeposit: safeNumberSchema(z.number().min(0, 'Security deposit cannot be negative')).optional(),
    availabilityDate: safeDateSchema().optional(),
    status: unitStatusEnum.optional(),
    isLateFeeEnabled: z.boolean().optional(),
    lateFeeType: z.enum(['FLAT', 'PERCENTAGE']).optional(),
    lateFeeAmount: safeNumberSchema(z.number().min(0)).optional().nullable(),
    lateFeeGraceDays: safeNumberSchema(z.number().int().min(0)).optional().nullable(),
  }),
});
