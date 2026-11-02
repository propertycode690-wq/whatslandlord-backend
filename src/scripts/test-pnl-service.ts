import { PrismaClient } from '@prisma/client';
import { ReportService } from '../reports/services/report.service';

const prisma = new PrismaClient();
const reportService = new ReportService();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'astoriamgmt21@gmail.com' },
    include: { role: true, company: true },
  });

  const res = await reportService.getProfitLoss(user, {});
  console.log('Profit & Loss Summary:', (res as any).data?.summary || (res as any).summary);
  console.log('Income categories:', (res as any).data?.income);
  console.log('Expense categories:', (res as any).data?.expenses);
  console.log('Transactions count:', (res as any).data?.transactions?.length || (res as any).transactions?.length);
  if ((res as any).data?.transactions?.length > 0) {
    console.log('Sample 3 transactions:', (res as any).data?.transactions.slice(0, 3));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
