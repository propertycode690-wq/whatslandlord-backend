import { z } from 'zod';
import { safeNumberSchema } from './validationHelpers';

export const createCrmLeadSchema = z.object({
  body: z.object({
    id: z.string().uuid('Invalid Lead ID format').optional(),
    name: z.string().trim().max(150).optional(),
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    email: z.string().trim().email('Invalid email address format').max(255).optional(),
    phone: z.string().trim().max(30).optional(),
    source: z.string().trim().max(100).optional(),
    status: z.string().trim().max(50).optional(),
    budget: safeNumberSchema(z.number().min(0, 'Budget cannot be negative')).optional().nullable(),
    moveInDate: z.string().trim().max(50).optional().nullable(),
    priority: z.string().trim().max(50).optional(),
    assignedAgent: z.string().trim().max(150).optional().nullable(),
    notes: z.string().optional().nullable(),
    property: z.string().trim().max(255).optional().nullable(),
    companyId: z.string().uuid('Invalid company ID format').optional().nullable(),
  }),
});
