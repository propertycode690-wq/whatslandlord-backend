import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'astoriamgmt21@gmail.com' },
    include: { company: true },
  });

  const companyId = user!.companyId!;

  // 1. Check Journal Entries & Lines
  const journalEntries = await prisma.journalEntry.findMany({
    where: { companyId },
    include: {
      lines: {
        include: { account: true },
      },
    },
  });
  console.log('Journal Entries for company:', journalEntries.length);
  if (journalEntries.length > 0) {
    console.log('First journal entry:', JSON.stringify(journalEntries[0], null, 2));
  }

  // 2. Check Rent Payments
  const rentPayments = await prisma.rentPayment.findMany({
    where: { companyId },
    include: { property: true, tenant: true },
  });
  console.log('Rent payments for company:', rentPayments.length);
  const paidRentPayments = rentPayments.filter((p: any) => p.status === 'Completed' || p.status === 'Paid');
  console.log('Completed rent payments:', paidRentPayments.length, 'Total sum:', paidRentPayments.reduce((s, p) => s + p.amount, 0));

  // 3. Check Invoices
  const invoices = await prisma.invoice.findMany({
    where: { companyId },
  });
  console.log('Invoices for company:', invoices.length);
  const paidInvoices = invoices.filter((i) => i.status === 'Paid' || i.status === 'Partially Paid');
  console.log('Paid invoices count:', paidInvoices.length, 'Total paidAmount:', paidInvoices.reduce((s, i) => s + (i.paidAmount || (i.status === 'Paid' ? i.amount : 0)), 0));

  // 4. Check Work Orders (Expenses)
  const workOrders = await prisma.workOrder.findMany({
    where: { companyId },
    include: { property: true },
  });
  console.log('Work orders for company:', workOrders.length);
  const totalWOCost = workOrders.reduce((s, w: any) => s + (w.actualCost || w.cost || w.estimatedCost || 0), 0);
  console.log('Total work orders cost:', totalWOCost);

  // 5. Check Expenses
  const expenses = await prisma.expense.findMany({
    take: 10,
  });
  console.log('Expenses in DB count:', expenses.length);

  // 6. Active Properties & Units
  const activeProps = await prisma.property.findMany({
    where: {
      companyId,
      status: { notIn: ['Inactive', 'Deleted'] },
    },
    select: { id: true, name: true },
  });
  console.log('Active properties:', activeProps.length);
  const activePropIds = activeProps.map((p) => p.id);

  // Invoices for active props
  const activeInvoices = invoices.filter((i) => activePropIds.includes(i.propertyId));
  console.log('Active prop invoices:', activeInvoices.length);
  const activePaidInvoices = activeInvoices.filter((i) => i.status === 'Paid' || i.status === 'Partially Paid');
  const activePaidAmt = activePaidInvoices.reduce((s, i) => s + (i.paidAmount || (i.status === 'Paid' ? i.amount : 0)), 0);
  console.log('Active paid invoices:', activePaidInvoices.length, 'Total paid:', activePaidAmt);

  // Work orders for active props
  const activeWOs = workOrders.filter((w) => activePropIds.includes(w.propertyId));
  console.log('Active prop WOs:', activeWOs.length, 'Cost:', activeWOs.reduce((s, w: any) => s + (w.actualCost || w.cost || w.estimatedCost || 0), 0));
}

main().catch(console.error).finally(() => prisma.$disconnect());
