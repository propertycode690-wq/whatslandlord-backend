"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const database_1 = __importDefault(require("./config/database"));
const node_cron_1 = __importDefault(require("node-cron"));
const companyHelper_js_1 = require("./utils/companyHelper.js");
const billingAutomation_service_1 = require("./services/billingAutomation.service");
async function bootstrapDb() {
    try {
        logger_1.logger.info('⚙️ Bootstrapping database schema with new columns...');
        const ownerCols = [
            'ALTER TABLE owner_documents ADD COLUMN ownerId VARCHAR(191) NULL;',
            'ALTER TABLE owner_documents ADD COLUMN propertyId VARCHAR(191) NULL;',
            'ALTER TABLE owner_documents ADD COLUMN companyId VARCHAR(191) NULL;'
        ];
        for (const sql of ownerCols) {
            await database_1.default.$executeRawUnsafe(sql).catch((e) => {
                // Ignore duplicate column error (1060) or already existing column warnings
                if (!e.message.includes('1060') && !e.message.includes('Duplicate column')) {
                    logger_1.logger.warn(`DDL execution warning: ${e.message}`);
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
            await database_1.default.$executeRawUnsafe(sql).catch((e) => {
                if (!e.message.includes('1060') && !e.message.includes('Duplicate column')) {
                    logger_1.logger.warn(`DDL execution warning: ${e.message}`);
                }
            });
        }
        // Ensure restore_bin table exists
        await database_1.default.$executeRawUnsafe(`
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
    `).catch((e) => {
            logger_1.logger.warn(`restore_bin table init warning: ${e.message}`);
        });
        // Clean up unwanted seeded mock Chart of Accounts from database
        const mockCoA = await database_1.default.coAAccount.findMany({
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
            await database_1.default.journalEntryLine.deleteMany({ where: { accountId: { in: mockIds } } });
            await database_1.default.coAAccount.deleteMany({ where: { id: { in: mockIds } } });
            logger_1.logger.info(`🧹 Cleaned up ${mockCoA.length} seeded mock Chart of Accounts from database.`);
        }
        const existingRohit = await database_1.default.owner.findFirst({ where: { email: 'rohit@example.com' } });
        if (!existingRohit) {
            const firstCompany = await database_1.default.company.findFirst();
            await database_1.default.owner.create({
                data: {
                    id: '584ff4e1-7950-4d89-9884-2a62372fbfb0',
                    name: 'rohit',
                    email: 'rohit@example.com',
                    phone: '1223345343',
                    payoutMethod: 'Check',
                    companyId: firstCompany?.id || null,
                },
            }).catch(() => { });
            logger_1.logger.info('✅ Restored owner rohit into database.');
        }
        // 🛡️ Auto-clean orphaned MoveOuts and Leases referencing deleted Units so queries never crash
        await database_1.default.$executeRawUnsafe(`
      DELETE FROM move_outs WHERE unitId IS NOT NULL AND unitId NOT IN (SELECT id FROM units);
    `).catch(() => { });
        await database_1.default.$executeRawUnsafe(`
      DELETE FROM leases WHERE unitId IS NOT NULL AND unitId NOT IN (SELECT id FROM units);
    `).catch(() => { });
        await database_1.default.$executeRawUnsafe(`
      DELETE FROM move_ins WHERE unitId IS NOT NULL AND unitId NOT IN (SELECT id FROM units);
    `).catch(() => { });
        logger_1.logger.info('🛡️ Orphaned leases and move_outs auto-cleaned successfully.');
        logger_1.logger.info('✅ Database schema bootstrap completed.');
    }
    catch (error) {
        logger_1.logger.error(error, '❌ Failed to bootstrap database schema:');
    }
}
// Connect and verify database connection
database_1.default.$connect()
    .then(async () => {
    logger_1.logger.info('🔌 MySQL Database connected successfully via Prisma Client!');
    await bootstrapDb();
    await (0, companyHelper_js_1.autoHealMissingCompanyIds)();
    // Start background auto-billing on server start (America/New_York)
    (0, billingAutomation_service_1.generateAutoInvoices)().catch(e => logger_1.logger.error(e, 'Auto-invoices startup error'));
    (0, billingAutomation_service_1.generateAutoLateFees)().catch(e => logger_1.logger.error(e, 'Auto-late-fees startup error'));
    // Schedule daily cron job at 00:05 AM US Eastern Time (America/New_York)
    node_cron_1.default.schedule('5 0 * * *', () => {
        logger_1.logger.info('⏰ Running daily midnight billing cron (America/New_York)...');
        (0, billingAutomation_service_1.generateAutoInvoices)().catch(e => logger_1.logger.error(e, 'Cron auto-invoices error'));
        (0, billingAutomation_service_1.generateAutoLateFees)().catch(e => logger_1.logger.error(e, 'Cron auto-late-fees error'));
    }, {
        timezone: 'America/New_York'
    });
    // Schedule 12:58 PM IST Test Cron
    node_cron_1.default.schedule('58 12 * * *', () => {
        logger_1.logger.info('⏰ Running scheduled 12:58 PM IST test billing cron...');
        (0, billingAutomation_service_1.generateAutoInvoices)().catch(e => logger_1.logger.error(e, '12:58 PM auto-invoices error'));
        (0, billingAutomation_service_1.generateAutoLateFees)().catch(e => logger_1.logger.error(e, '12:58 PM auto-late-fees error'));
    }, {
        timezone: 'Asia/Kolkata'
    });
})
    .catch((error) => {
    logger_1.logger.error(error, '❌ Failed to connect to the MySQL database:');
});
const server = app_1.default.listen(env_1.env.PORT, () => {
    logger_1.logger.info(`🚀 WhatsLandlord ERP Backend Server running on http://localhost:${env_1.env.PORT}${env_1.env.API_PREFIX}`);
    logger_1.logger.info(`Environment: ${env_1.env.NODE_ENV}`);
});
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        logger_1.logger.error(`❌ Port ${env_1.env.PORT} is already in use by another process.`);
        process.exit(1);
    }
    else {
        logger_1.logger.error(error, 'Server error:');
    }
});
process.on('unhandledRejection', (reason) => {
    logger_1.logger.error(reason, 'Unhandled Rejection caught:');
});
process.on('uncaughtException', (error) => {
    logger_1.logger.error(error, 'Uncaught Exception caught:');
    process.exit(1);
});
