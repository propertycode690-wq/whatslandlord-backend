import prisma from '../config/database';
import { moveOutService } from './moveOut.service';

export class RenewalService {
  async autoCreatePendingRenewals() {
    const now = new Date();
    const sixtyDaysFromNow = new Date();
    sixtyDaysFromNow.setDate(now.getDate() + 60);

    // Find all active leases expiring within 60 days (including expired active leases requiring renewal)
    const activeLeases = await prisma.lease.findMany({
      where: {
        status: 'Active',
        endDate: {
          lte: sixtyDaysFromNow,
        },
      },
    });

    for (const lease of activeLeases) {
      const existingRenewal = await prisma.leaseRenewal.findUnique({
        where: { leaseId: lease.id },
      });

      if (!existingRenewal) {
        // Rent stays identical (no increase)
        const newRentAmount = lease.rentAmount;

        // Calculate 12-month extension by default
        const newEndDate = new Date(lease.endDate);
        newEndDate.setMonth(newEndDate.getMonth() + 12);

        await prisma.leaseRenewal.create({
          data: {
            leaseId: lease.id,
            newRentAmount,
            newEndDate,
            termMonths: 12,
            status: 'PENDING',
          },
        });
      }
    }
  }

  async ensureRenewalExists(leaseId: string) {
    let renewal = await prisma.leaseRenewal.findUnique({
      where: { leaseId },
      include: { lease: true },
    });
    if (!renewal) {
      const lease = await prisma.lease.findUnique({ where: { id: leaseId } });
      if (!lease) throw new Error('Lease not found.');
      const newEndDate = new Date(lease.endDate);
      newEndDate.setMonth(newEndDate.getMonth() + 12);
      renewal = await prisma.leaseRenewal.create({
        data: {
          leaseId: lease.id,
          newRentAmount: lease.rentAmount,
          newEndDate,
          termMonths: 12,
          status: 'PENDING',
        },
        include: { lease: true },
      });
    }
    return renewal;
  }

  async getAllRenewals(companyId?: string) {
    try {
      // Auto-trigger renewal detection on fetch
      await this.autoCreatePendingRenewals();
    } catch (e) {
      (globalThis as any).console?.error('Error auto-creating pending renewals:', e);
    }

    return prisma.leaseRenewal.findMany({
      where: companyId ? { lease: { companyId } } : {},
      include: {
        lease: {
          include: {
            tenant: true,
            unit: true,
            property: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async sendOffer(leaseId: string) {
    const renewal = await this.ensureRenewalExists(leaseId);
    return prisma.leaseRenewal.update({
      where: { leaseId },
      data: { status: 'OFFER_SENT' },
    });
  }

  async updateRenewal(leaseId: string, data: { newRentAmount?: number; termMonths?: number; newEndDate?: string }) {
    const renewal = await this.ensureRenewalExists(leaseId);

    const newRentAmount = data.newRentAmount !== undefined ? parseFloat(data.newRentAmount as any) : renewal.newRentAmount;
    const termMonths = data.termMonths !== undefined ? parseInt(data.termMonths as any) : renewal.termMonths;

    let computedEndDate = renewal.newEndDate;
    if (data.newEndDate) {
      computedEndDate = new Date(data.newEndDate);
    } else if (data.termMonths !== undefined && renewal.lease) {
      computedEndDate = new Date(renewal.lease.endDate);
      computedEndDate.setMonth(computedEndDate.getMonth() + termMonths);
    }

    return prisma.leaseRenewal.update({
      where: { leaseId },
      data: {
        newRentAmount,
        termMonths,
        newEndDate: computedEndDate,
      },
    });
  }

  async acceptRenewal(leaseId: string, companyId?: string, termMonths?: number) {
    await this.ensureRenewalExists(leaseId);
    const renewal = await prisma.leaseRenewal.findFirst({
      where: {
        leaseId,
        ...(companyId ? { lease: { companyId } } : {}),
      },
      include: { lease: true },
    });
    if (!renewal) throw new Error('Renewal record not found.');
    if (renewal.status === 'ACCEPTED') throw new Error('Renewal already accepted.');

    return prisma.$transaction(async (tx: any) => {
      // 1. Update status to ACCEPTED
      const updatedRenewal = await tx.leaseRenewal.update({
        where: { leaseId },
        data: { status: 'ACCEPTED' },
      });

      // 2. Update old lease status to Expired
      await tx.lease.update({
        where: { id: leaseId },
        data: { status: 'Expired' },
      });

      // 3. Create new lease cloned from the old one
      const term = termMonths || renewal.termMonths;
      const computedEndDate = new Date(renewal.lease.endDate);
      computedEndDate.setMonth(computedEndDate.getMonth() + term);

      const newRent = renewal.newRentAmount;

      const newLease = await tx.lease.create({
        data: {
          tenantId: renewal.lease.tenantId,
          propertyId: renewal.lease.propertyId,
          unitId: renewal.lease.unitId,
          startDate: new Date(renewal.lease.endDate),
          endDate: computedEndDate,
          rentAmount: newRent,
          depositAmount: renewal.lease.depositAmount,
          status: 'Active',
          companyId: renewal.lease.companyId,
        },
      });

      return { renewal: updatedRenewal, newLease };
    });
  }

  async rejectRenewal(leaseId: string, companyId?: string) {
    await this.ensureRenewalExists(leaseId);
    const renewal = await prisma.leaseRenewal.findFirst({
      where: {
        leaseId,
        ...(companyId ? { lease: { companyId } } : {}),
      },
      include: { lease: true },
    });
    if (!renewal) throw new Error('Renewal record not found.');
    if (renewal.status === 'REJECTED') throw new Error('Renewal already rejected.');

    return prisma.$transaction(async (tx: any) => {
      // 1. Update status to REJECTED
      const updated = await tx.leaseRenewal.update({
        where: { leaseId },
        data: { status: 'REJECTED' },
      });

      // 2. Update old lease status to Terminated
      await tx.lease.update({
        where: { id: leaseId },
        data: { status: 'Terminated' },
      });

      // 3. Call move-out service to schedule move-out
      await moveOutService.createMoveOut({
        leaseId: renewal.leaseId,
        unitId: renewal.lease.unitId,
        scheduledDate: renewal.lease.endDate,
        notes: 'Automatically scheduled from declined lease renewal offer.',
        createdBy: 'System',
        companyId: renewal.lease.companyId,
      });

      return updated;
    });
  }
}

export const renewalService = new RenewalService();
