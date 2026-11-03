"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'astoriamgmt21@gmail.com' },
    });
    const companyId = user.companyId;
    const activeProps = await prisma.property.findMany({
        where: {
            companyId,
            status: { notIn: ['Inactive', 'Deleted'] },
        },
        select: { id: true, name: true },
    });
    const activePropIds = activeProps.map((p) => p.id);
    // Check service requests for active properties
    const srs = await prisma.serviceRequest.findMany({
        where: {
            propertyId: { in: activePropIds },
        },
    });
    console.log('Service requests on active properties:', srs.length);
    srs.forEach((s) => console.log(`- SR: ${s.title} | Prop: ${s.propertyName} | Cost: $${s.cost} | EstCost: $${s.estimatedCost}`));
    // Check all service requests in DB
    const allSrs = await prisma.serviceRequest.findMany();
    console.log('Total SRs in DB:', allSrs.length);
    allSrs.forEach((s) => console.log(`- Any SR: ${s.title} | PropId: ${s.propertyId} | Prop: ${s.propertyName} | Cost: $${s.cost} | Est: $${s.estimatedCost}`));
    // Check rent payments for active properties
    const payments = await prisma.rentPayment.findMany({
        where: {
            propertyId: { in: activePropIds },
            status: 'Paid',
        },
    });
    console.log('Paid rent payments on active properties:', payments.length, 'Sum:', payments.reduce((s, p) => s + p.amount, 0));
    // Check invoices paid on active properties
    const paidInvoices = await prisma.invoice.findMany({
        where: {
            propertyId: { in: activePropIds },
            status: { in: ['Paid', 'Partially Paid'] },
        },
    });
    console.log('Paid invoices on active props:', paidInvoices.length);
    let totalPaid = 0;
    paidInvoices.forEach((inv) => {
        const amt = inv.paidAmount > 0 ? inv.paidAmount : inv.amount;
        totalPaid += amt;
    });
    console.log('Total paid amount on active props:', totalPaid);
}
main().catch(console.error).finally(() => prisma.$disconnect());
