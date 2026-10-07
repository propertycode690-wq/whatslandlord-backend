import { z } from 'zod';
import { safeNumberSchema, safeDateSchema } from './validationHelpers';

const paymentMethodEnum = z.enum([
  'ACH',
  'CreditCard',
  'DebitCard',
  'BankTransfer',
  'WireTransfer',
  'Cash',
  'Check',
  'MoneyOrder',
  'Zelle',
  'Offline',
  'Offline (Partial)',
]);

export const createPaymentSchema = z.object({
  body: z.object({
    amount: safeNumberSchema(z.number().gt(0, 'Payment amount must be greater than zero')),
    referenceNumber: z.string().trim().max(100).optional(),
    invoiceId: z.string().uuid('Invalid invoice ID format').optional().nullable(),
    tenantId: z.string().uuid('Invalid tenant ID format').optional().nullable(),
    propertyId: z.string().uuid('Invalid property ID format').optional().nullable(),
    unitId: z.string().uuid('Invalid unit ID format').optional().nullable(),
    leaseId: z.string().uuid('Invalid lease ID format').optional().nullable(),
    paymentMethod: paymentMethodEnum.default('ACH'),
    dueDate: safeDateSchema().optional(),
    paidDate: safeDateSchema().optional(),
  }),
});
