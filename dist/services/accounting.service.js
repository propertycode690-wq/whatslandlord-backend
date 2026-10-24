"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountingService = exports.AccountingService = void 0;
const database_1 = __importDefault(require("../config/database"));
const appError_1 = require("../utils/appError");
class AccountingService {
    async getChartOfAccounts(companyId) {
        const accounts = await database_1.default.coAAccount.findMany({
            where: companyId ? { companyId } : {},
            orderBy: { accountCode: 'asc' },
        });
        return accounts;
    }
    async createAccount(data, companyId) {
        const existing = await database_1.default.coAAccount.findFirst({
            where: companyId ? { companyId, accountCode: data.accountCode } : { accountCode: data.accountCode },
        });
        if (existing) {
            throw new appError_1.AppError(`Account Code "${data.accountCode}" already exists in your Chart of Accounts.`, 400);
        }
        return database_1.default.coAAccount.create({
            data: {
                accountCode: data.accountCode,
                accountName: data.accountName,
                type: data.type,
                balance: data.balance || 0,
                companyId,
            },
        });
    }
    async deleteAccount(id, companyId) {
        if (companyId) {
            const check = await database_1.default.coAAccount.findFirst({ where: { id, companyId } });
            if (!check)
                throw new appError_1.AppError('Account not found.', 404);
        }
        await database_1.default.journalEntryLine.deleteMany({
            where: { accountId: id },
        });
        return database_1.default.coAAccount.delete({
            where: { id },
        });
    }
    async getJournalEntries(companyId) {
        const entries = await database_1.default.journalEntry.findMany({
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
    async getGeneralLedger(companyId) {
        const ledger = await database_1.default.journalEntryLine.findMany({
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
    async getBankAccounts(companyId) {
        const accounts = await database_1.default.bankAccount.findMany({
            where: companyId ? { companyId } : {},
            orderBy: { name: 'asc' },
        });
        return accounts;
    }
    async createBankAccount(data, companyId) {
        return database_1.default.bankAccount.create({
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
    async deleteBankAccount(id, companyId) {
        if (companyId) {
            const check = await database_1.default.bankAccount.findFirst({ where: { id, companyId } });
            if (!check)
                throw new appError_1.AppError('Bank Account not found.', 404);
        }
        return database_1.default.bankAccount.delete({
            where: { id },
        });
    }
    async getBankReconciliation(companyId) {
        const bankAccounts = await this.getBankAccounts(companyId);
        return bankAccounts.map((ba) => ({
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
    async postJournalEntry(data, companyId) {
        const totalDebit = data.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
        const totalCredit = data.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
        if (Math.abs(totalDebit - totalCredit) > 0.001) {
            throw new appError_1.AppError('Double-entry validation failed: Total Debits must equal Total Credits.', 422, 'BALANCING_ERROR');
        }
        return database_1.default.journalEntry.create({
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
exports.AccountingService = AccountingService;
exports.accountingService = new AccountingService();
