import app from './app';
import http from 'http';
import { Server } from 'socket.io';
import { verifyAccessToken } from './utils/jwt.js';
import { chatService } from './services/chat.service.js';
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

    const tenantTableCols = [
      'ALTER TABLE tenants ADD COLUMN gender VARCHAR(191) NULL;',
      'ALTER TABLE tenants ADD COLUMN previousBalance DOUBLE NULL DEFAULT 0;',
      'ALTER TABLE tenants ADD COLUMN openingBalance DOUBLE NULL DEFAULT 0;'
    ];

    for (const sql of tenantTableCols) {
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

    // Ensure conversations and chat_messages tables exist
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS conversations (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        participantType VARCHAR(191) NOT NULL,
        tenantId VARCHAR(191) NULL,
        ownerId VARCHAR(191) NULL,
        staffId VARCHAR(191) NULL,
        lastMessageAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        status VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `).catch((e: any) => {
      logger.warn(`conversations table init warning: ${e.message}`);
    });

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        conversationId VARCHAR(191) NOT NULL,
        senderRole VARCHAR(191) NOT NULL,
        senderId VARCHAR(191) NOT NULL,
        recipientRole VARCHAR(191) NOT NULL,
        recipientId VARCHAR(191) NOT NULL,
        body TEXT NOT NULL,
        status VARCHAR(191) NOT NULL DEFAULT 'SENT',
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        readAt DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `).catch((e: any) => {
      logger.warn(`chat_messages table init warning: ${e.message}`);
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
      }).catch(() => { });
      logger.info('✅ Restored owner rohit into database.');
    }

    // 🛡️ Auto-clean orphaned MoveOuts and Leases referencing deleted Units so queries never crash
    await prisma.$executeRawUnsafe(`
      DELETE FROM move_outs WHERE unitId IS NOT NULL AND unitId NOT IN (SELECT id FROM units);
    `).catch(() => { });
    await prisma.$executeRawUnsafe(`
      DELETE FROM leases WHERE unitId IS NOT NULL AND unitId NOT IN (SELECT id FROM units);
    `).catch(() => { });
    await prisma.$executeRawUnsafe(`
      DELETE FROM move_ins WHERE unitId IS NOT NULL AND unitId NOT IN (SELECT id FROM units);
    `).catch(() => { });
    await prisma.$executeRawUnsafe(`
      DELETE FROM rent_payments WHERE leaseId IS NOT NULL AND leaseId NOT IN (SELECT id FROM leases);
    `).catch(() => { });
    await prisma.$executeRawUnsafe(`
      DELETE FROM rent_payments WHERE unitId IS NOT NULL AND unitId NOT IN (SELECT id FROM units);
    `).catch(() => { });
    logger.info('🛡️ Orphaned leases, move_outs, and rent_payments auto-cleaned successfully.');

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

    // Background auto-billing scheduled via daily cron (America/New_York)



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

const httpServer = http.createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
  if (!token) {
    return next(new Error('Authentication token missing'));
  }
  try {
    const payload = verifyAccessToken(token);
    socket.data.user = payload;
    next();
  } catch (err: any) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const user = socket.data.user;
  if (!user) return;

  const companyRoom = user.companyId ? `company:${user.companyId}` : null;
  const userRoom = user.userId ? `user:${user.userId}` : null;

  if (companyRoom) socket.join(companyRoom);
  if (userRoom) socket.join(userRoom);

  socket.on('join:conversation', (conversationId: string) => {
    socket.join(`conversation:${conversationId}`);
  });

  socket.on('leave:conversation', (conversationId: string) => {
    socket.leave(`conversation:${conversationId}`);
  });

  socket.on('message:send', async (data: { conversationId: string; body: string }) => {
    try {
      const savedMsg = await chatService.sendMessage(data.conversationId, data.body, user);
      io.to(`conversation:${data.conversationId}`).emit('message:new', savedMsg);
      if (companyRoom) {
        io.to(companyRoom).emit('conversation:updated', {
          conversationId: data.conversationId,
          lastMessage: savedMsg.body,
          lastMessageAt: savedMsg.createdAt,
          senderId: savedMsg.senderId,
        });
      }
      socket.emit('message:status', {
        messageId: savedMsg.id,
        status: 'DELIVERED',
      });
    } catch (err: any) {
      socket.emit('message:error', { error: err.message });
    }
  });

  socket.on('message:read', async (data: { conversationId: string }) => {
    try {
      await chatService.markAsRead(data.conversationId, user);
      io.to(`conversation:${data.conversationId}`).emit('message:read_receipt', {
        conversationId: data.conversationId,
      });
    } catch (err: any) {
      // ignore
    }
  });
});

const server = httpServer.listen(env.PORT, () => {
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
