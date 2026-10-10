import { Router } from 'express';
import { portalController } from '../controllers/portal.controller';
import { uploadScreeningReportDoc, uploadDocument } from '../middlewares/upload.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { createCrmLeadSchema } from '../validations/crm.validation';

const router = Router();

// Tenant Portal Views
router.get('/tenant/leases', (req, res, next) => portalController.getTenantLeases(req, res, next));
router.get('/tenant/lease', (req, res, next) => portalController.getTenantLease(req, res, next));
router.post('/tenant/lease/ai-qa', (req, res, next) => portalController.askLeaseAi(req, res, next));
router.post('/tenant/ai-concierge', (req, res, next) => portalController.tenantAiConcierge(req, res, next));
router.get('/tenant/metrics', (req, res, next) => portalController.getTenantMetrics(req, res, next));
router.get('/tenant/profile', (req, res, next) => portalController.getTenantProfile(req, res, next));
router.post('/tenant/profile', (req, res, next) => portalController.updateTenantProfile(req, res, next));
router.get('/tenant/maintenance', (req, res, next) => portalController.getTenantMaintenance(req, res, next));
router.post('/tenant/maintenance', (req, res, next) => portalController.createTenantMaintenance(req, res, next));
router.get('/tenant/documents', (req, res, next) => portalController.getTenantDocuments(req, res, next));
router.post('/tenant/documents', uploadDocument.single('file'), (req, res, next) => portalController.uploadTenantDocument(req, res, next));
router.get('/tenant/messages', (req, res, next) => portalController.getTenantMessages(req, res, next));
router.post('/tenant/messages', (req, res, next) => portalController.createTenantMessage(req, res, next));
router.get('/tenant/notifications', (req, res, next) => portalController.getTenantNotifications(req, res, next));
router.patch('/tenant/notifications/:id/read', (req, res, next) => portalController.markTenantNotificationRead(req, res, next));
router.delete('/tenant/notifications', (req, res, next) => portalController.clearTenantNotifications(req, res, next));

// Owner Portal Views
router.get('/owner/financials', (req, res, next) => portalController.getOwnerFinancials(req, res, next));
router.get('/owner/distributions', (req, res, next) => portalController.getOwnerDistributions(req, res, next));
router.get('/owner/statements', (req, res, next) => portalController.getOwnerStatements(req, res, next));
router.get('/owner/maintenance', (req, res, next) => portalController.getOwnerMaintenance(req, res, next));
router.get('/owner/documents', (req, res, next) => portalController.getOwnerDocuments(req, res, next));
router.post('/owner/documents', uploadDocument.single('file'), (req, res, next) => portalController.uploadOwnerDocument(req, res, next));
router.get('/owner/messages', (req, res, next) => portalController.getOwnerMessages(req, res, next));
router.post('/owner/messages', (req, res, next) => portalController.composeOwnerMessage(req, res, next));
router.get('/owner/reports', (req, res, next) => portalController.getOwnerReports(req, res, next));
router.get('/owner/profile', (req, res, next) => portalController.getOwnerProfile(req, res, next));
router.post('/owner/profile', (req, res, next) => portalController.updateOwnerProfile(req, res, next));
router.get('/owner/metrics', (req, res, next) => portalController.getOwnerMetrics(req, res, next));

// Super Admin Portal Views
router.get('/superadmin/billing', (req, res, next) => portalController.getSuperAdminBilling(req, res, next));
router.get('/superadmin/security', (req, res, next) => portalController.getSuperAdminSecurity(req, res, next));
router.get('/superadmin/audit', (req, res, next) => portalController.getSuperAdminAuditLogs(req, res, next));

// CRM, Screening, Violations & Collections
router.get('/collections/payment-plans', (req, res, next) => portalController.getCollectionPaymentPlans(req, res, next));
router.post('/collections/payment-plans', (req, res, next) => portalController.createCollectionPaymentPlan(req, res, next));

router.get('/crm/leads', (req, res, next) => portalController.getCrmLeads(req, res, next));
router.post('/crm/leads', validateRequest(createCrmLeadSchema), (req, res, next) => portalController.createCrmLead(req, res, next));

router.get('/screening/reports', (req, res, next) => portalController.getScreeningReports(req, res, next));
router.get('/screening/reports/:id', (req, res, next) => portalController.getScreeningReportById(req, res, next));
router.post('/screening/reports', (req, res, next) => portalController.createScreeningReport(req, res, next));
router.put('/screening/reports/:id', (req, res, next) => portalController.updateScreeningReport(req, res, next));
router.post('/screening/reports/:id/upload', uploadScreeningReportDoc.single('document'), (req, res, next) => portalController.uploadScreeningDocument(req, res, next));

router.get('/violations', (req, res, next) => portalController.getViolations(req, res, next));
router.post('/violations', (req, res, next) => portalController.createViolation(req, res, next));
router.get('/violations/sync-dob', (req, res, next) => portalController.syncNycDobViolations(req, res, next));
router.post('/violations/sync-dob', (req, res, next) => portalController.syncNycDobViolations(req, res, next));
router.get('/violations/sync-nyc-dob', (req, res, next) => portalController.syncNycDobViolations(req, res, next));
router.post('/violations/sync-nyc-dob', (req, res, next) => portalController.syncNycDobViolations(req, res, next));
router.get('/violations/sync-all-nyc-dob', (req, res, next) => portalController.syncAllNycDobViolations(req, res, next));
router.post('/violations/sync-all-nyc-dob', (req, res, next) => portalController.syncAllNycDobViolations(req, res, next));
router.post('/violations/dispatch', (req, res, next) => portalController.dispatchViolation(req, res, next));

// General Dashboard User Profile Views
router.get('/user/profile', (req, res, next) => portalController.getUserProfile(req, res, next));
router.post('/user/profile', (req, res, next) => portalController.updateUserProfile(req, res, next));

// Maintenance Staff Profile & Tasks Views
router.get('/staff/profile', (req, res, next) => portalController.getStaffProfile(req, res, next));
router.post('/staff/profile', (req, res, next) => portalController.updateStaffProfile(req, res, next));
router.get('/staff/tasks', (req, res, next) => portalController.getStaffTasks(req, res, next));
router.post('/staff/tasks/:id/status', (req, res, next) => portalController.updateStaffTaskStatus(req, res, next));

// Invoices
router.get('/invoices', (req, res, next) => portalController.getInvoices(req, res, next));
router.post('/invoices', (req, res, next) => portalController.createInvoice(req, res, next));
router.delete('/invoices/:id', (req, res, next) => portalController.deleteInvoice(req, res, next));

// Charges
router.get('/charges', (req, res, next) => portalController.getCharges(req, res, next));
router.post('/charges', (req, res, next) => portalController.createCharge(req, res, next));
router.delete('/charges/:id', (req, res, next) => portalController.deleteCharge(req, res, next));

// Deposits
router.get('/deposits', (req, res, next) => portalController.getDeposits(req, res, next));
router.post('/deposits', (req, res, next) => portalController.createDeposit(req, res, next));
router.delete('/deposits/:id', (req, res, next) => portalController.deleteDeposit(req, res, next));

// Expenses
router.get('/expenses', (req, res, next) => portalController.getExpenses(req, res, next));
router.post('/expenses', (req, res, next) => portalController.createExpense(req, res, next));
router.delete('/expenses/:id', (req, res, next) => portalController.deleteExpense(req, res, next));

// Maintenance Requests
router.get('/maintenance/requests', (req, res, next) => portalController.getMaintenanceRequests(req, res, next));
router.post('/maintenance/requests', (req, res, next) => portalController.createMaintenanceRequest(req, res, next));
router.put('/maintenance/requests/:id', (req, res, next) => portalController.updateMaintenanceRequest(req, res, next));
router.delete('/maintenance/requests/:id', (req, res, next) => portalController.deleteMaintenanceRequest(req, res, next));

// Inspections
router.get('/inspections', (req, res, next) => portalController.getInspections(req, res, next));
router.post('/inspections', (req, res, next) => portalController.createInspection(req, res, next));
router.put('/inspections/:id', (req, res, next) => portalController.updateInspection(req, res, next));
router.delete('/inspections/:id', (req, res, next) => portalController.deleteInspection(req, res, next));

// Income
router.get('/income', (req, res, next) => portalController.getIncome(req, res, next));
router.post('/income', (req, res, next) => portalController.createIncome(req, res, next));
router.delete('/income/:id', (req, res, next) => portalController.deleteIncome(req, res, next));

// Signatures
router.get('/signatures', (req, res, next) => portalController.getSignatures(req, res, next));
router.post('/signatures', (req, res, next) => portalController.createSignature(req, res, next));
router.post('/signatures/:id/cancel', (req, res, next) => portalController.cancelSignature(req, res, next));

export default router;
