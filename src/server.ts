import app from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import prisma from './config/database';
import cron from 'node-cron';
import { autoHealMissingCompanyIds } from './utils/companyHelper.js';
import { generateAutoInvoices, generateAutoLateFees } from './services/billingAutomation.service';

async function bootstrapDb() {
  try {
    logger.info('⚙️ Bootstrapping database schema with new columns...');
    
    const ownerCols = [
      'ALTER TABLE owner_documents ADD COLUMN ownerId VARCHAR(191) NULL;',
      'ALTER TABLE owner_documents ADD COLUMN propertyId VARCHAR(191) NULL;',
      'ALTER TABLE owner_documents ADD COLUMN companyId VARCHAR(191) NULL;'
    ];

    for (const sql of ownerCols) {
      await prisma.$executeRawUnsafe(sql).catch((e: any) => {
        // Ignore duplicate column error (1060) or already existing column warnings
        if (!e.message.includes('1060') && !e.message.includes('Duplicate column')) {
          logger.warn(`DDL execution warning: ${e.message}`);
        }
      });
    }

    const tenantCols = [
      'ALTER TABLE tenant_documents ADD COLUMN tenantId VARCHAR(191) NULL;',
      'ALTER TABLE tenant_documents ADD COLUMN propertyId VARCHAR(191) NULL;',
      'ALTER TABLE tenant_documents ADD COLUMN buildingId VARCHAR(191) NULL;',
      'ALTER TABLE tenant_documents ADD COLUMN unitId VARCHAR(191) NULL;',
      'ALTER TABLE tenant_documents ADD COLUMN companyId VARCHAR(191) NULL;'
    ];

    for (const sql of tenantCols) {
      await prisma.$executeRawUnsafe(sql).catch((e: any) => {
        if (!e.message.includes('1060') && !e.message.includes('Duplicate column')) {
          logger.warn(`DDL execution warning: ${e.message}`);
        }
      });
    }

    // Ensure restore_bin table exists
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS restore_bin (
        id VARCHAR(191) PRIMARY KEY,
        entityType VARCHAR(100) NOT NULL,
        entityId VARCHAR(191) NOT NULL,
        title VARCHAR(255) NOT NULL,
        subtitle VARCHAR(255) NULL,
        data LONGTEXT NOT NULL,
        deletedBy VARCHAR(191) NULL,
        companyId VARCHAR(191) NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deletedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_rb_company (companyId),
        INDEX idx_rb_entity (entityType, entityId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `).catch((e: any) => {
      logger.warn(`restore_bin table init warning: ${e.message}`);
    });

    // Clean up unwanted seeded mock Chart of Accounts from database
    const mockCoA = await prisma.coAAccount.findMany({
      where: {
        accountName: {
          in: [
            'Operating Checking Account',
            'Security Deposit Escrow Account',
            'Accounts Payable (AP)',
            'Tenant Security Deposit Liability',
            "Owner's Equity Capital",
            'Rental Revenue Income',
            'Maintenance & Repair Expense',
          ],
        },
      },
    });
    if (mockCoA.length > 0) {
      const mockIds = mockCoA.map((a) => a.id);
      await prisma.journalEntryLine.deleteMany({ where: { accountId: { in: mockIds } } });
      await prisma.coAAccount.deleteMany({ where: { id: { in: mockIds } } });
      logger.info(`🧹 Cleaned up ${mockCoA.length} seeded mock Chart of Accounts from database.`);
    }

    const existingRohit = await prisma.owner.findFirst({ where: { email: 'rohit@example.com' } });
    if (!existingRohit) {
      const firstCompany = await prisma.company.findFirst();
      await prisma.owner.create({
        data: {
          id: '584ff4e1-7950-4d89-9884-2a62372fbfb0',
          name: 'rohit',
          email: 'rohit@example.com',
          phone: '1223345343',
          payoutMethod: 'Check',
          companyId: firstCompany?.id || null,
        },
      }).catch(() => {});
      logger.info('✅ Restored owner rohit into database.');
    }

    logger.info('✅ Database schema bootstrap completed.');
  } catch (error) {
    logger.error(error, '❌ Failed to bootstrap database schema:');
  }
}

// Connect and verify database connection
prisma.$connect()
  .then(async () => {
    logger.info('🔌 MySQL Database connected successfully via Prisma Client!');
    await bootstrapDb();
    await autoHealMissingCompanyIds();

    // Start background auto-billing on server start (America/New_York)
    generateAutoInvoices().catch(e => logger.error(e, 'Auto-invoices startup error'));
    generateAutoLateFees().catch(e => logger.error(e, 'Auto-late-fees startup error'));

    // Schedule daily cron job at 00:05 AM US Eastern Time (America/New_York)
    cron.schedule('5 0 * * *', () => {
      logger.info('⏰ Running daily midnight billing cron (America/New_York)...');
      generateAutoInvoices().catch(e => logger.error(e, 'Cron auto-invoices error'));
      generateAutoLateFees().catch(e => logger.error(e, 'Cron auto-late-fees error'));
    }, {
      timezone: 'America/New_York'
    });

    // Schedule 12:58 PM IST Test Cron
    cron.schedule('58 12 * * *', () => {
      logger.info('⏰ Running scheduled 12:58 PM IST test billing cron...');
      generateAutoInvoices().catch(e => logger.error(e, '12:58 PM auto-invoices error'));
      generateAutoLateFees().catch(e => logger.error(e, '12:58 PM auto-late-fees error'));
    }, {
      timezone: 'Asia/Kolkata'
    });
  })
  .catch((error: Error) => {
    logger.error(error, '❌ Failed to connect to the MySQL database:');
  });

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 WhatsLandlord ERP Backend Server running on http://localhost:${env.PORT}${env.API_PREFIX}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
});

server.on('error', (error: any) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`❌ Port ${env.PORT} is already in use by another process.`);
    process.exit(1);
  } else {
    logger.error(error, 'Server error:');
  }
});

process.on('unhandledRejection', (reason: Error) => {
  logger.error(reason, 'Unhandled Rejection caught:');
});

process.on('uncaughtException', (error: Error) => {
  logger.error(error, 'Uncaught Exception caught:');
  process.exit(1);
});
