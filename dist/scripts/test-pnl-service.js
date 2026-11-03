"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const report_service_1 = require("../reports/services/report.service");
const prisma = new client_1.PrismaClient();
const reportService = new report_service_1.ReportService();
async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'astoriamgmt21@gmail.com' },
        include: { role: true, company: true },
    });
    const res = await reportService.getProfitLoss(user, {});
    console.log('Profit & Loss Summary:', res.data?.summary || res.summary);
    console.log('Income categories:', res.data?.income);
    console.log('Expense categories:', res.data?.expenses);
    console.log('Transactions count:', res.data?.transactions?.length || res.transactions?.length);
    if (res.data?.transactions?.length > 0) {
        console.log('Sample 3 transactions:', res.data?.transactions.slice(0, 3));
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
