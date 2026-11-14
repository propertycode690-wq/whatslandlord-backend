import prisma from '../config/database';
import { decrypt } from '../utils/crypto';

export interface SendEmailOptions {
  companyId: string;
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  /**
   * Send an email via company's configured Twilio SendGrid integration
   */
  async sendEmail(options: {
    companyId: string;
    to: string;
    toName?: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<{ success: boolean; messageId?: string; reason?: string }> {
    const { companyId, to, toName, subject, html, text } = options;

    if (!to || !to.includes('@')) {
      return { success: false, reason: `Invalid recipient email: ${to}` };
    }

    if (!companyId) {
      return { success: false, reason: 'Missing companyId for email notification.' };
    }

    try {
      // Strictly query manager/company's own SendGrid integration
      const integration = await prisma.companyIntegration.findFirst({
        where: {
          companyId,
          provider: 'SENDGRID',
          status: 'Active',
        },
      });

      if (!integration) {
        console.log(`[SendGrid Email] Company ${companyId} has no active SendGrid integration. Skipping email.`);
        return { success: false, reason: 'SendGrid integration is inactive or not configured for this company.' };
      }

      if (!integration.encryptedAuthToken || !integration.encryptionIv) {
        console.warn(`[SendGrid Email] Company ${companyId} SendGrid integration is missing API Key.`);
        return { success: false, reason: 'SendGrid API key is missing.' };
      }

      let apiKey = '';
      try {
        apiKey = decrypt(integration.encryptedAuthToken, integration.encryptionIv);
      } catch (err: any) {
        console.error(`[SendGrid Email] Decryption failed for company ${companyId}:`, err.message);
        return { success: false, reason: 'Failed to decrypt SendGrid API key.' };
      }

      const senderEmail = integration.senderId?.trim();
      const senderName = integration.accountSid?.trim() || 'Property Management';

      if (!senderEmail || !senderEmail.includes('@')) {
        console.warn(`[SendGrid Email] Company ${companyId} has invalid Sender Email: ${senderEmail}`);
        return { success: false, reason: 'Verified sender email is invalid or missing.' };
      }

      const payload = {
        personalizations: [
          {
            to: [
              {
                email: to.trim(),
                name: toName?.trim() || undefined,
              },
            ],
            subject,
          },
        ],
        from: {
          email: senderEmail,
          name: senderName,
        },
        content: [
          {
            type: 'text/html',
            value: html,
          },
          ...(text ? [{ type: 'text/plain', value: text }] : []),
        ],
      };

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 202 || response.status === 200) {
        const messageId = response.headers.get('x-message-id') || undefined;
        console.log(`[SendGrid Email] Email "${subject}" sent to ${to} for company ${companyId}.`);
        return { success: true, messageId };
      } else {
        const errBody: any = await response.json().catch(() => ({}));
        const errMsg = errBody?.errors?.[0]?.message || `SendGrid returned status ${response.status}`;
        console.error(`[SendGrid Email] Failed to send email to ${to}: ${errMsg}`);
        return { success: false, reason: errMsg };
      }
    } catch (error: any) {
      console.error(`[SendGrid Email] Network / execution error for company ${companyId}:`, error.message);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Trigger 1: Tenant Welcome & Account Registration Email
   */
  async sendTenantWelcomeEmail(
    companyId: string,
    tenant: {
      firstName?: string | null;
      lastName?: string | null;
      email: string;
      phone?: string | null;
      unitId?: string | null;
    },
    temporaryPassword?: string
  ) {
    if (!tenant.email) return;

    try {
      // Lookup company and unit info for context
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      });

      let unitDetails = '';
      if (tenant.unitId) {
        const unit = await prisma.unit.findUnique({
          where: { id: tenant.unitId },
          include: { property: true },
        });
        if (unit) {
          unitDetails = `Unit ${unit.unitNumber} at ${unit.property?.name || 'Property'}`;
        }
      }

      const tenantFullName = `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || 'Resident';
      const companyName = company?.name || 'Property Management';
      const subject = `Welcome to ${companyName} - Tenant Registration Details`;

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    
    <!-- Header -->
    <div style="background-color: #0f172a; padding: 28px 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">${companyName}</h1>
      <p style="color: #94a3b8; margin: 6px 0 0; font-size: 13px;">Tenant Portal Registration</p>
    </div>

    <!-- Body -->
    <div style="padding: 28px 24px;">
      <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 12px; color: #0f172a;">Welcome, ${tenantFullName}!</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px;">
        Your tenant profile has been successfully registered with <strong>${companyName}</strong>. You can now access your tenant portal to view your lease, pay rent online, and submit maintenance requests.
      </p>

      <!-- Details Box -->
      <div style="background-color: #f1f5f9; border-radius: 8px; padding: 18px; margin-bottom: 24px;">
        <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin: 0 0 12px; font-weight: 700;">Account Summary</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 40%;">Full Name:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${tenantFullName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Login Email:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${tenant.email}</td>
          </tr>
          ${tenant.phone ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Phone:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${tenant.phone}</td>
          </tr>` : ''}
          ${unitDetails ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Assigned Residence:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${unitDetails}</td>
          </tr>` : ''}
          ${temporaryPassword ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Temporary Password:</td>
            <td style="padding: 6px 0; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 15px;">${temporaryPassword}</td>
          </tr>` : ''}
        </table>
      </div>

      <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin: 0 0 24px;">
        ${temporaryPassword ? 'Please log in to your tenant account and change your password at your earliest convenience.' : 'You can log in to your account anytime to view invoices and updates.'}
      </p>

      <div style="text-align: center; margin-bottom: 12px;">
        <span style="display: inline-block; background-color: #0284c7; color: #ffffff; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; text-decoration: none;">
          Thank You for Joining Us
        </span>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
      <p style="font-size: 12px; color: #94a3b8; margin: 0;">
        This automated notification was generated by ${companyName}.
      </p>
    </div>

  </div>
</body>
</html>`;

      return await this.sendEmail({
        companyId,
        to: tenant.email,
        toName: tenantFullName,
        subject,
        html,
      });
    } catch (err: any) {
      console.error('[SendGrid Email] sendTenantWelcomeEmail error:', err.message);
    }
  }

  /**
   * Trigger 2: Lease Created Notification Email
   */
  async sendLeaseCreatedEmail(companyId: string, leaseId: string) {
    try {
      const lease = await prisma.lease.findUnique({
        where: { id: leaseId },
        include: {
          tenant: true,
          property: true,
          unit: true,
        },
      });

      if (!lease || !lease.tenant || !lease.tenant.email) {
        return;
      }

      const tenantFullName = `${lease.tenant.firstName || ''} ${lease.tenant.lastName || ''}`.trim() || 'Resident';
      const propertyName = lease.property?.name || 'Property';
      const unitNumber = lease.unit?.unitNumber || 'Unit';
      const startDateStr = lease.startDate ? new Date(lease.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
      const endDateStr = lease.endDate ? new Date(lease.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
      const rentAmountFormatted = Number(lease.rentAmount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      const depositAmountFormatted = Number(lease.depositAmount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

      const subject = `Lease Agreement Details - ${propertyName} Unit ${unitNumber}`;

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    
    <!-- Header -->
    <div style="background-color: #0f172a; padding: 28px 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">${propertyName}</h1>
      <p style="color: #94a3b8; margin: 6px 0 0; font-size: 13px;">Lease Agreement Confirmation</p>
    </div>

    <!-- Body -->
    <div style="padding: 28px 24px;">
      <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 12px; color: #0f172a;">Hello, ${tenantFullName}!</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px;">
        Your lease agreement for <strong>Unit ${unitNumber}</strong> at <strong>${propertyName}</strong> has been generated and recorded. Below are your lease details:
      </p>

      <!-- Details Box -->
      <div style="background-color: #f8fafc; border-radius: 8px; padding: 18px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
        <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin: 0 0 12px; font-weight: 700;">Lease Terms</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; width: 45%;">Property:</td>
            <td style="padding: 8px 0; font-weight: 600; color: #0f172a;">${propertyName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;">Unit Number:</td>
            <td style="padding: 8px 0; font-weight: 600; color: #0f172a;">Unit ${unitNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;">Lease Period:</td>
            <td style="padding: 8px 0; font-weight: 600; color: #0f172a;">${startDateStr} – ${endDateStr}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;">Monthly Rent:</td>
            <td style="padding: 8px 0; font-weight: 700; color: #0f172a; font-size: 15px;">${rentAmountFormatted} / mo</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;">Security Deposit:</td>
            <td style="padding: 8px 0; font-weight: 600; color: #0f172a;">${depositAmountFormatted}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;">Lease Status:</td>
            <td style="padding: 8px 0; font-weight: 700; color: #059669;">${lease.status || 'Active'}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin: 0 0 20px;">
        You can review your lease documents and manage upcoming rent payments directly from your tenant portal.
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
      <p style="font-size: 12px; color: #94a3b8; margin: 0;">
        Thank you for choosing ${propertyName}. Please contact management if you have any questions.
      </p>
    </div>

  </div>
</body>
</html>`;

      return await this.sendEmail({
        companyId,
        to: lease.tenant.email,
        toName: tenantFullName,
        subject,
        html,
      });
    } catch (err: any) {
      console.error('[SendGrid Email] sendLeaseCreatedEmail error:', err.message);
    }
  }

  /**
   * Trigger 3: Monthly Invoice Notification Email
   */
  async sendInvoiceGeneratedEmail(
    companyId: string,
    invoice: {
      id: string;
      tenantId?: string | null;
      tenantName?: string | null;
      propertyName?: string | null;
      unitNumber?: string | null;
      dueDate: string | Date;
      amount: number;
      balance: number;
      notes?: string | null;
      lineItems?: any;
    }
  ) {
    try {
      if (!invoice.tenantId || invoice.tenantId === 'default') {
        return;
      }

      // Lookup tenant email
      const tenant = await prisma.tenant.findUnique({
        where: { id: invoice.tenantId },
        select: { email: true, firstName: true, lastName: true },
      });

      if (!tenant || !tenant.email) {
        return;
      }

      const tenantFullName = invoice.tenantName || `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || 'Resident';
      const propertyName = invoice.propertyName || 'Property';
      const unitNumber = invoice.unitNumber || '';
      const invoiceNumber = invoice.id.slice(-6).toUpperCase();
      const amountFormatted = Number(invoice.amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      const balanceFormatted = Number(invoice.balance || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

      let parsedDueDate = 'Due on Receipt';
      if (invoice.dueDate) {
        const d = new Date(invoice.dueDate);
        if (!isNaN(d.getTime())) {
          parsedDueDate = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        }
      }

      // Parse line items if available
      let lineItemsArr: any[] = [];
      try {
        if (typeof invoice.lineItems === 'string') {
          lineItemsArr = JSON.parse(invoice.lineItems);
        } else if (Array.isArray(invoice.lineItems)) {
          lineItemsArr = invoice.lineItems;
        }
      } catch (e) {
        lineItemsArr = [];
      }

      const subject = `New Invoice #${invoiceNumber} from ${propertyName} - Due ${parsedDueDate}`;

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    
    <!-- Header -->
    <div style="background-color: #0f172a; padding: 28px 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">${propertyName}</h1>
      <p style="color: #94a3b8; margin: 6px 0 0; font-size: 13px;">Rent Invoice #${invoiceNumber}</p>
    </div>

    <!-- Body -->
    <div style="padding: 28px 24px;">
      <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 12px; color: #0f172a;">Hello, ${tenantFullName}!</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px;">
        A new monthly invoice has been generated for your residence${unitNumber ? ` (Unit ${unitNumber})` : ''}. Please find the invoice summary below:
      </p>

      <!-- Details Card -->
      <div style="background-color: #f8fafc; border-radius: 8px; padding: 18px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 45%;">Invoice Reference:</td>
            <td style="padding: 6px 0; font-weight: 700; color: #0f172a;">#${invoiceNumber}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Due Date:</td>
            <td style="padding: 6px 0; font-weight: 700; color: #dc2626;">${parsedDueDate}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Total Amount:</td>
            <td style="padding: 6px 0; font-weight: 700; color: #0f172a; font-size: 16px;">${amountFormatted}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Amount Due:</td>
            <td style="padding: 6px 0; font-weight: 800; color: #0284c7; font-size: 16px;">${balanceFormatted}</td>
          </tr>
        </table>
      </div>

      <!-- Line items if available -->
      ${lineItemsArr.length > 0 ? `
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 12px; text-transform: uppercase; color: #64748b; margin: 0 0 8px; font-weight: 700; letter-spacing: 0.5px;">Charge Details</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; border-top: 1px solid #e2e8f0;">
          ${lineItemsArr.map((item: any) => `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #334155;">${item.description || 'Charge'}</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #0f172a;">$${Number(item.amount || 0).toFixed(2)}</td>
          </tr>
          `).join('')}
        </table>
      </div>
      ` : ''}

      ${invoice.notes ? `
      <p style="font-size: 12px; color: #64748b; font-style: italic; margin: 0 0 20px;">
        Note: ${invoice.notes}
      </p>` : ''}

      <div style="text-align: center; margin: 24px 0 12px;">
        <span style="display: inline-block; background-color: #0284c7; color: #ffffff; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 700; text-decoration: none;">
          Please Pay via Tenant Portal
        </span>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
      <p style="font-size: 12px; color: #94a3b8; margin: 0;">
        Thank you for being a valued tenant at ${propertyName}.
      </p>
    </div>

  </div>
</body>
</html>`;

      return await this.sendEmail({
        companyId,
        to: tenant.email,
        toName: tenantFullName,
        subject,
        html,
      });
    } catch (err: any) {
      console.error('[SendGrid Email] sendInvoiceGeneratedEmail error:', err.message);
    }
  }
}

export const emailService = new EmailService();
