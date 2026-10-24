"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const portal_controller_1 = require("../controllers/portal.controller");
const upload_middleware_1 = require("../middlewares/upload.middleware");
const validate_middleware_1 = require("../middlewares/validate.middleware");
const crm_validation_1 = require("../validations/crm.validation");
const router = (0, express_1.Router)();
// Tenant Portal Views
router.get('/tenant/leases', (req, res, next) => portal_controller_1.portalController.getTenantLeases(req, res, next));
router.get('/tenant/lease', (req, res, next) => portal_controller_1.portalController.getTenantLease(req, res, next));
router.post('/tenant/lease/ai-qa', (req, res, next) => portal_controller_1.portalController.askLeaseAi(req, res, next));
router.post('/tenant/ai-concierge', (req, res, next) => portal_controller_1.portalController.tenantAiConcierge(req, res, next));
router.get('/tenant/metrics', (req, res, next) => portal_controller_1.portalController.getTenantMetrics(req, res, next));
router.get('/tenant/profile', (req, res, next) => portal_controller_1.portalController.getTenantProfile(req, res, next));
router.post('/tenant/profile', (req, res, next) => portal_controller_1.portalController.updateTenantProfile(req, res, next));
router.get('/tenant/maintenance', (req, res, next) => portal_controller_1.portalController.getTenantMaintenance(req, res, next));
router.post('/tenant/maintenance', (req, res, next) => portal_controller_1.portalController.createTenantMaintenance(req, res, next));
router.get('/tenant/documents', (req, res, next) => portal_controller_1.portalController.getTenantDocuments(req, res, next));
router.post('/tenant/documents', upload_middleware_1.uploadDocument.single('file'), (req, res, next) => portal_controller_1.portalController.uploadTenantDocument(req, res, next));
router.get('/tenant/messages', (req, res, next) => portal_controller_1.portalController.getTenantMessages(req, res, next));
router.post('/tenant/messages', (req, res, next) => portal_controller_1.portalController.createTenantMessage(req, res, next));
router.get('/tenant/notifications', (req, res, next) => portal_controller_1.portalController.getTenantNotifications(req, res, next));
router.patch('/tenant/notifications/:id/read', (req, res, next) => portal_controller_1.portalController.markTenantNotificationRead(req, res, next));
router.delete('/tenant/notifications/:id', (req, res, next) => portal_controller_1.portalController.deleteTenantNotification(req, res, next));
router.delete('/tenant/notifications', (req, res, next) => portal_controller_1.portalController.clearTenantNotifications(req, res, next));
// Owner Portal Views
router.get('/owner/financials', (req, res, next) => portal_controller_1.portalController.getOwnerFinancials(req, res, next));
router.get('/owner/distributions', (req, res, next) => portal_controller_1.portalController.getOwnerDistributions(req, res, next));
router.get('/owner/statements', (req, res, next) => portal_controller_1.portalController.getOwnerStatements(req, res, next));
router.get('/owner/maintenance', (req, res, next) => portal_controller_1.portalController.getOwnerMaintenance(req, res, next));
router.get('/owner/documents', (req, res, next) => portal_controller_1.portalController.getOwnerDocuments(req, res, next));
router.post('/owner/documents', upload_middleware_1.uploadDocument.single('file'), (req, res, next) => portal_controller_1.portalController.uploadOwnerDocument(req, res, next));
router.get('/owner/messages', (req, res, next) => portal_controller_1.portalController.getOwnerMessages(req, res, next));
router.post('/owner/messages', (req, res, next) => portal_controller_1.portalController.composeOwnerMessage(req, res, next));
router.get('/owner/reports', (req, res, next) => portal_controller_1.portalController.getOwnerReports(req, res, next));
router.get('/owner/profile', (req, res, next) => portal_controller_1.portalController.getOwnerProfile(req, res, next));
router.post('/owner/profile', (req, res, next) => portal_controller_1.portalController.updateOwnerProfile(req, res, next));
router.get('/owner/metrics', (req, res, next) => portal_controller_1.portalController.getOwnerMetrics(req, res, next));
// Super Admin Portal Views
router.get('/superadmin/billing', (req, res, next) => portal_controller_1.portalController.getSuperAdminBilling(req, res, next));
router.get('/superadmin/security', (req, res, next) => portal_controller_1.portalController.getSuperAdminSecurity(req, res, next));
router.get('/superadmin/audit', (req, res, next) => portal_controller_1.portalController.getSuperAdminAuditLogs(req, res, next));
// CRM, Screening, Violations & Collections
router.get('/collections/payment-plans', (req, res, next) => portal_controller_1.portalController.getCollectionPaymentPlans(req, res, next));
router.post('/collections/payment-plans', (req, res, next) => portal_controller_1.portalController.createCollectionPaymentPlan(req, res, next));
router.get('/crm/leads', (req, res, next) => portal_controller_1.portalController.getCrmLeads(req, res, next));
router.post('/crm/leads', (0, validate_middleware_1.validateRequest)(crm_validation_1.createCrmLeadSchema), (req, res, next) => portal_controller_1.portalController.createCrmLead(req, res, next));
router.get('/screening/reports', (req, res, next) => portal_controller_1.portalController.getScreeningReports(req, res, next));
router.get('/screening/reports/:id', (req, res, next) => portal_controller_1.portalController.getScreeningReportById(req, res, next));
router.post('/screening/reports', (req, res, next) => portal_controller_1.portalController.createScreeningReport(req, res, next));
router.put('/screening/reports/:id', (req, res, next) => portal_controller_1.portalController.updateScreeningReport(req, res, next));
router.post('/screening/reports/:id/upload', upload_middleware_1.uploadScreeningReportDoc.single('document'), (req, res, next) => portal_controller_1.portalController.uploadScreeningDocument(req, res, next));
router.get('/violations', (req, res, next) => portal_controller_1.portalController.getViolations(req, res, next));
router.post('/violations', (req, res, next) => portal_controller_1.portalController.createViolation(req, res, next));
router.get('/violations/sync-dob', (req, res, next) => portal_controller_1.portalController.syncNycDobViolations(req, res, next));
router.post('/violations/sync-dob', (req, res, next) => portal_controller_1.portalController.syncNycDobViolations(req, res, next));
router.get('/violations/sync-nyc-dob', (req, res, next) => portal_controller_1.portalController.syncNycDobViolations(req, res, next));
router.post('/violations/sync-nyc-dob', (req, res, next) => portal_controller_1.portalController.syncNycDobViolations(req, res, next));
router.get('/violations/sync-all-nyc-dob', (req, res, next) => portal_controller_1.portalController.syncAllNycDobViolations(req, res, next));
router.post('/violations/sync-all-nyc-dob', (req, res, next) => portal_controller_1.portalController.syncAllNycDobViolations(req, res, next));
router.post('/violations/dispatch', (req, res, next) => portal_controller_1.portalController.dispatchViolation(req, res, next));
// General Dashboard User Profile Views
router.get('/user/profile', (req, res, next) => portal_controller_1.portalController.getUserProfile(req, res, next));
router.post('/user/profile', (req, res, next) => portal_controller_1.portalController.updateUserProfile(req, res, next));
// Maintenance Staff Profile & Tasks Views
router.get('/staff/profile', (req, res, next) => portal_controller_1.portalController.getStaffProfile(req, res, next));
router.post('/staff/profile', (req, res, next) => portal_controller_1.portalController.updateStaffProfile(req, res, next));
router.get('/staff/tasks', (req, res, next) => portal_controller_1.portalController.getStaffTasks(req, res, next));
router.post('/staff/tasks/:id/status', (req, res, next) => portal_controller_1.portalController.updateStaffTaskStatus(req, res, next));
// Invoices
router.get('/invoices', (req, res, next) => portal_controller_1.portalController.getInvoices(req, res, next));
router.post('/invoices', (req, res, next) => portal_controller_1.portalController.createInvoice(req, res, next));
router.delete('/invoices/:id', (req, res, next) => portal_controller_1.portalController.deleteInvoice(req, res, next));
// Charges
router.get('/charges', (req, res, next) => portal_controller_1.portalController.getCharges(req, res, next));
router.post('/charges', (req, res, next) => portal_controller_1.portalController.createCharge(req, res, next));
router.delete('/charges/:id', (req, res, next) => portal_controller_1.portalController.deleteCharge(req, res, next));
// Deposits
router.get('/deposits', (req, res, next) => portal_controller_1.portalController.getDeposits(req, res, next));
router.post('/deposits', (req, res, next) => portal_controller_1.portalController.createDeposit(req, res, next));
router.delete('/deposits/:id', (req, res, next) => portal_controller_1.portalController.deleteDeposit(req, res, next));
// Expenses
router.get('/expenses', (req, res, next) => portal_controller_1.portalController.getExpenses(req, res, next));
router.post('/expenses', (req, res, next) => portal_controller_1.portalController.createExpense(req, res, next));
router.delete('/expenses/:id', (req, res, next) => portal_controller_1.portalController.deleteExpense(req, res, next));
// Maintenance Requests
router.get('/maintenance/requests', (req, res, next) => portal_controller_1.portalController.getMaintenanceRequests(req, res, next));
router.post('/maintenance/requests', (req, res, next) => portal_controller_1.portalController.createMaintenanceRequest(req, res, next));
router.put('/maintenance/requests/:id', (req, res, next) => portal_controller_1.portalController.updateMaintenanceRequest(req, res, next));
router.delete('/maintenance/requests/:id', (req, res, next) => portal_controller_1.portalController.deleteMaintenanceRequest(req, res, next));
// Inspections
router.get('/inspections', (req, res, next) => portal_controller_1.portalController.getInspections(req, res, next));
router.post('/inspections', (req, res, next) => portal_controller_1.portalController.createInspection(req, res, next));
router.put('/inspections/:id', (req, res, next) => portal_controller_1.portalController.updateInspection(req, res, next));
router.delete('/inspections/:id', (req, res, next) => portal_controller_1.portalController.deleteInspection(req, res, next));
// Income
router.get('/income', (req, res, next) => portal_controller_1.portalController.getIncome(req, res, next));
router.post('/income', (req, res, next) => portal_controller_1.portalController.createIncome(req, res, next));
router.delete('/income/:id', (req, res, next) => portal_controller_1.portalController.deleteIncome(req, res, next));
// Signatures
router.get('/signatures', (req, res, next) => portal_controller_1.portalController.getSignatures(req, res, next));
router.post('/signatures', (req, res, next) => portal_controller_1.portalController.createSignature(req, res, next));
router.post('/signatures/:id/cancel', (req, res, next) => portal_controller_1.portalController.cancelSignature(req, res, next));
exports.default = router;
