import prisma from '../config/database';
import { AppError } from '../utils/appError';

export class AccountingService {
  async getChartOfAccounts(companyId?: string) {
    const accounts = await prisma.coAAccount.findMany({
      where: companyId ? { companyId } : {},
      orderBy: { accountCode: 'asc' },
    });
    return accounts;
  }

  async createAccount(data: { accountCode: string; accountName: string; type: string; balance?: number }, companyId?: string) {
    const existing = await prisma.coAAccount.findFirst({
      where: companyId ? { companyId, accountCode: data.accountCode } : { accountCode: data.accountCode },
    });
    if (existing) {
      throw new AppError(`Account Code "${data.accountCode}" already exists in your Chart of Accounts.`, 400);
    }
    return prisma.coAAccount.create({
      data: {
        accountCode: data.accountCode,
        accountName: data.accountName,
        type: data.type,
        balance: data.balance || 0,
        companyId,
      },
    });
  }

  async deleteAccount(id: string, companyId?: string) {
    if (companyId) {
      const check = await prisma.coAAccount.findFirst({ where: { id, companyId } });
      if (!check) throw new AppError('Account not found.', 404);
    }
    await prisma.journalEntryLine.deleteMany({
      where: { accountId: id },
    });
    return prisma.coAAccount.delete({
      where: { id },
    });
  }

  async getJournalEntries(companyId?: string) {
    const entries = await prisma.journalEntry.findMany({
      where: companyId ? { companyId } : {},
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });
    return entries;
  }

  async getGeneralLedger(companyId?: string) {
    const ledger = await prisma.journalEntryLine.findMany({
      where: companyId ? {
        journalEntry: { companyId }
      } : {},
      include: {
        account: true,
        journalEntry: true,
      },
      orderBy: {
        journalEntry: {
          date: 'desc',
        },
      },
    });
    return ledger;
  }

  async getBankAccounts(companyId?: string) {
    const accounts = await prisma.bankAccount.findMany({
      where: companyId ? { companyId } : {},
      orderBy: { name: 'asc' },
    });
    return accounts;
  }

  async createBankAccount(data: any, companyId?: string) {
    return prisma.bankAccount.create({
      data: {
        name: data.name,
        institution: data.institution,
        accountNumber: data.accountNumber,
        balance: parseFloat(data.balance || '0'),
        type: data.type || 'Checking',
        status: data.status || 'Active',
        companyId,
      },
    });
  }

  async deleteBankAccount(id: string, companyId?: string) {
    if (companyId) {
      const check = await prisma.bankAccount.findFirst({ where: { id, companyId } });
      if (!check) throw new AppError('Bank Account not found.', 404);
    }
    return prisma.bankAccount.delete({
      where: { id },
    });
  }

  async getBankReconciliation(companyId?: string) {
    const bankAccounts = await this.getBankAccounts(companyId);
    return bankAccounts.map((ba: any) => ({
      id: `rec-${ba.id}`,
      bankAccountId: ba.id,
      bankAccountName: ba.name,
      statementDate: new Date(),
      statementEndingBalance: ba.balance,
      clearedBalance: ba.balance,
      difference: 0.00,
      status: 'Reconciled',
    }));
  }

  async postJournalEntry(data: { description: string; lines: Array<{ accountId: string; debit: number; credit: number }> }, companyId?: string) {
    const totalDebit = data.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
    const totalCredit = data.lines.reduce((sum, l) => sum + (l.credit || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new AppError('Double-entry validation failed: Total Debits must equal Total Credits.', 422, 'BALANCING_ERROR');
    }

    return prisma.journalEntry.create({
      data: {
        entryNumber: `JE-${Math.floor(10000 + Math.random() * 90000)}`,
        date: new Date(),
        description: data.description,
        companyId,
        lines: {
          create: data.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit || 0,
            credit: l.credit || 0,
          })),
        },
      },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });
  }
}

export const accountingService = new AccountingService();
