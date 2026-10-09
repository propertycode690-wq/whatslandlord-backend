import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const pendingRentPayments = await prisma.rentPayment.findMany({
    where: { status: 'Pending' },
    include: { tenant: { select: { firstName: true, lastName: true } } }
  });
  
  const overdueInvoices = await prisma.invoice.findMany({
    where: { status: { in: ['Overdue', 'Unpaid'] } },
    include: { tenant: { select: { firstName: true, lastName: true } } }
  });
  
  const allInvoices = await prisma.invoice.findMany({
    select: { status: true }
  });

  console.log("Pending RentPayments:");
  console.dir(pendingRentPayments, { depth: null });
  
  console.log("Overdue/Unpaid Invoices:");
  console.dir(overdueInvoices, { depth: null });

  console.log("Invoice statuses:");
  const statusCounts: Record<string, number> = {};
  for (const inv of allInvoices) {
      statusCounts[inv.status] = (statusCounts[inv.status] || 0) + 1;
  }
  console.log(statusCounts);
}

main().catch(console.error).finally(() => prisma.$disconnect());
