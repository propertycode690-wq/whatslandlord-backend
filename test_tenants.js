require('dotenv').config({ path: './.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, companyId: true, role: true } });
  console.log('USERS:', JSON.stringify(users, null, 2));

  const tenants = await prisma.tenant.findMany({
    select: { id: true, firstName: true, lastName: true, companyId: true, unitId: true, status: true },
  });
  console.log('TENANTS:', JSON.stringify(tenants, null, 2));

  const rentPayments = await prisma.rentPayment.findMany({
    select: { id: true, tenantId: true, amount: true, status: true },
  });
  console.log('RENT PAYMENTS:', JSON.stringify(rentPayments, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

