"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPaymentSchema = void 0;
const zod_1 = require("zod");
const validationHelpers_1 = require("./validationHelpers");
const paymentMethodEnum = zod_1.z.enum([
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
exports.createPaymentSchema = zod_1.z.object({
    body: zod_1.z.object({
        amount: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().gt(0, 'Payment amount must be greater than zero')),
        referenceNumber: zod_1.z.string().trim().max(100).optional(),
        invoiceId: zod_1.z.string().uuid('Invalid invoice ID format').optional().nullable(),
        tenantId: zod_1.z.string().uuid('Invalid tenant ID format').optional().nullable(),
        propertyId: zod_1.z.string().uuid('Invalid property ID format').optional().nullable(),
        unitId: zod_1.z.string().uuid('Invalid unit ID format').optional().nullable(),
        leaseId: zod_1.z.string().uuid('Invalid lease ID format').optional().nullable(),
        paymentMethod: paymentMethodEnum.default('ACH'),
        dueDate: (0, validationHelpers_1.safeDateSchema)().optional(),
        paidDate: (0, validationHelpers_1.safeDateSchema)().optional(),
    }),
});
