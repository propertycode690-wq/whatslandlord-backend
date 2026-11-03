import { Response, NextFunction } from 'express';
import prisma from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { AppError } from '../utils/appError';

export class UnitController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const units = await prisma.unit.findMany({
        where: {
          property: {
            status: { notIn: ['Inactive', 'Deleted'] },
            ...(companyId ? { companyId } : {}),
          },
        },
        include: {
          property: true,
          building: true,
          tenants: true,
        },
      });
      return sendSuccess({ res, data: units });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const companyId = req.user?.companyId;
      const unit = await prisma.unit.findFirst({
        where: companyId ? {
          id,
          property: { companyId },
        } : { id },
        include: {
          property: true,
          building: true,
          tenants: true,
        },
      });
      return sendSuccess({ res, data: unit });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const {
        propertyId,
        buildingId,
        unitNumber,
        floor,
        bedrooms,
        bathrooms,
        squareFootage,
        rentAmount,
        securityDeposit,
        availabilityDate,
        status,
        isLateFeeEnabled,
        lateFeeType,
        lateFeeAmount,
        lateFeeGraceDays,
      } = req.body;
      const companyId = req.user?.companyId;

      if (companyId) {
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        if (company) {
          const totalUnitsCount = await prisma.unit.count({
            where: { property: { companyId } },
          });
          const maxUnitsLimit = company.maxUnits || 500;
          if (totalUnitsCount >= maxUnitsLimit) {
            throw new AppError(
              `Unit creation limit reached! Your plan (${company.planName}) permits up to ${maxUnitsLimit} units. Please upgrade your subscription plan.`,
              403,
              'PLAN_LIMIT_EXCEEDED'
            );
          }
        }
      }

      let targetPropertyId = propertyId;
      let property = null;
      if (targetPropertyId) {
        property = await prisma.property.findFirst({
          where: companyId ? { id: targetPropertyId, companyId } : { id: targetPropertyId }
        });
        if (!property) {
          throw new AppError('Property not found.', 404, 'NOT_FOUND');
        }
      } else {
        property = await prisma.property.findFirst({
          where: companyId ? { companyId } : {},
        });
        if (!property) {
          throw new AppError('Please create a property before adding units.', 404, 'NOT_FOUND');
        }
      }
      targetPropertyId = property.id;

      let finalBuildingId = buildingId;
      if (finalBuildingId) {
        const existingBuilding = await prisma.building.findFirst({
          where: companyId ? {
            id: finalBuildingId,
            property: { companyId }
          } : { id: finalBuildingId },
          include: { property: true },
        });
        if (!existingBuilding) {
          finalBuildingId = undefined;
        } else if (existingBuilding.unitsCount > 0) {
          const currentUnitsCount = await prisma.unit.count({
            where: { buildingId: finalBuildingId },
          });
          if (currentUnitsCount >= existingBuilding.unitsCount) {
            const propName = property?.name || existingBuilding.property?.name || 'Property';
            throw new AppError(`Cannot add unit. Property '${propName}' is restricted to a maximum of ${existingBuilding.unitsCount} units.`, 400, 'PROPERTY_CAPACITY_REACHED');
          }
        }
      }

      if (!finalBuildingId) {
        let building = await prisma.building.findFirst({
          where: { propertyId: targetPropertyId },
        });
        if (!building) {
          building = await prisma.building.create({
            data: {
              propertyId: targetPropertyId,
              name: 'Main Building',
              floors: 1,
              unitsCount: 1,
            },
          });
        }
        finalBuildingId = building.id;

        if (building.unitsCount > 0) {
          const currentUnitsCount = await prisma.unit.count({
            where: { buildingId: finalBuildingId },
          });
          if (currentUnitsCount >= building.unitsCount) {
            throw new AppError(`Cannot add unit. Property '${property.name}' is restricted to a maximum of ${building.unitsCount} units.`, 400, 'PROPERTY_CAPACITY_REACHED');
          }
        }
      }

      // Check if unit number already exists in this property
      const existingUnit = await prisma.unit.findFirst({
        where: {
          propertyId: targetPropertyId,
          unitNumber,
        },
      });
      if (existingUnit) {
        throw new AppError(`Unit "${unitNumber}" already exists in this property.`, 400, 'DUPLICATE_UNIT');
      }

      const unit = await prisma.unit.create({
        data: {
          propertyId: targetPropertyId,
          buildingId: finalBuildingId,
          unitNumber,
          floor: parseInt(floor || '1'),
          bedrooms: parseInt(bedrooms || '1'),
          bathrooms: parseFloat(bathrooms || '1.0'),
          squareFootage: parseFloat(squareFootage || '0'),
          rentAmount: parseFloat(rentAmount || '0'),
          securityDeposit: parseFloat(securityDeposit || '0'),
          availabilityDate: new Date(availabilityDate || Date.now()),
          status: status || 'Vacant',
          isLateFeeEnabled: isLateFeeEnabled !== undefined ? Boolean(isLateFeeEnabled) : false,
          lateFeeType: lateFeeType || 'FLAT',
          lateFeeAmount: lateFeeAmount !== undefined && lateFeeAmount !== null && lateFeeAmount !== '' ? parseFloat(lateFeeAmount) : null,
          lateFeeGraceDays: lateFeeGraceDays !== undefined && lateFeeGraceDays !== null && lateFeeGraceDays !== '' ? parseInt(lateFeeGraceDays) : null,
        },
      });
      return sendSuccess({ res, statusCode: 201, data: unit });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const companyId = req.user?.companyId;
      const {
        propertyId,
        buildingId,
        unitNumber,
        floor,
        bedrooms,
        bathrooms,
        squareFootage,
        rentAmount,
        securityDeposit,
        availabilityDate,
        status,
        isLateFeeEnabled,
        lateFeeType,
        lateFeeAmount,
        lateFeeGraceDays,
      } = req.body;

      if (companyId) {
        const check = await prisma.unit.findFirst({
          where: {
            id,
            property: { companyId },
          },
        });
        if (!check) throw new AppError('Unit not found.', 404, 'NOT_FOUND');
      }

      if (propertyId) {
        const prop = await prisma.property.findFirst({
          where: companyId ? { id: propertyId, companyId } : { id: propertyId }
        });
        if (!prop) throw new AppError('Property not found.', 404, 'NOT_FOUND');
      }

      if (buildingId) {
        const build = await prisma.building.findFirst({
          where: companyId ? {
            id: buildingId,
            property: { companyId }
          } : { id: buildingId }
        });
        if (!build) throw new AppError('Building not found.', 404, 'NOT_FOUND');
      }

      const unit = await prisma.unit.update({
        where: { id },
        data: {
          propertyId,
          buildingId,
          unitNumber,
          floor: floor !== undefined ? parseInt(floor) : undefined,
          bedrooms: bedrooms !== undefined ? parseInt(bedrooms) : undefined,
          bathrooms: bathrooms !== undefined ? parseFloat(bathrooms) : undefined,
          squareFootage: squareFootage !== undefined ? parseFloat(squareFootage) : undefined,
          rentAmount: rentAmount !== undefined ? parseFloat(rentAmount) : undefined,
          securityDeposit: securityDeposit !== undefined ? parseFloat(securityDeposit) : undefined,
          availabilityDate: availabilityDate ? new Date(availabilityDate) : undefined,
          status,
          isLateFeeEnabled: isLateFeeEnabled !== undefined ? Boolean(isLateFeeEnabled) : undefined,
          lateFeeType: lateFeeType !== undefined ? lateFeeType : undefined,
          lateFeeAmount: lateFeeAmount !== undefined ? (lateFeeAmount === '' || lateFeeAmount === null ? null : parseFloat(lateFeeAmount)) : undefined,
          lateFeeGraceDays: lateFeeGraceDays !== undefined ? (lateFeeGraceDays === '' || lateFeeGraceDays === null ? null : parseInt(lateFeeGraceDays)) : undefined,
        },
      });
      return sendSuccess({ res, data: unit });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const companyId = req.user?.companyId;

      if (companyId) {
        const check = await prisma.unit.findFirst({
          where: {
            id,
            property: { companyId },
          },
        });
        if (!check) throw new AppError('Unit not found.', 404, 'NOT_FOUND');
      }

      await prisma.unit.delete({
        where: { id },
      });
      return sendSuccess({ res, data: { success: true } });
    } catch (error) {
      next(error);
    }
  }

  async assignTenant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const companyId = req.user?.companyId;
      const { tenantId } = req.body;

      if (companyId) {
        const check = await prisma.unit.findFirst({
          where: {
            id,
            property: { companyId },
          },
        });
        if (!check) throw new AppError('Unit not found.', 404, 'NOT_FOUND');

        if (tenantId) {
          const tenantCheck = await prisma.tenant.findFirst({
            where: { id: tenantId, companyId },
          });
          if (!tenantCheck) throw new AppError('Tenant not found.', 404, 'NOT_FOUND');
        }
      }

      const unit = await prisma.unit.update({
        where: { id },
        data: {
          status: 'Occupied',
          tenants: {
            connect: { id: tenantId },
          },
        },
      });
      return sendSuccess({ res, data: unit });
    } catch (error) {
      next(error);
    }
  }

  async bulkImport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { units } = req.body;
      if (!Array.isArray(units) || units.length === 0) {
        throw new AppError('No units provided for import.', 400, 'INVALID_INPUT');
      }
      const companyId = req.user?.companyId;

      // Plan limit verification
      if (companyId) {
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        if (company) {
          const totalUnitsCount = await prisma.unit.count({
            where: { property: { companyId } },
          });
          const maxUnitsLimit = company.maxUnits || 500;
          if (totalUnitsCount + units.length > maxUnitsLimit) {
            throw new AppError(
              `Import exceeds your plan limit! Your plan allows up to ${maxUnitsLimit} units. Current: ${totalUnitsCount}, Attempting to import: ${units.length}.`,
              403,
              'PLAN_LIMIT_EXCEEDED'
            );
          }
        }
      }

      // Fetch all accessible properties
      const existingProperties = await prisma.property.findMany({
        where: {
          status: { notIn: ['Inactive', 'Deleted'] },
          ...(companyId ? { companyId } : {}),
        },
        include: {
          buildings: true,
        },
      });

      if (existingProperties.length === 0) {
        throw new AppError('No properties found. Please create or import properties first before importing units.', 400, 'NO_PROPERTIES_FOUND');
      }

      const propMapById = new Map<string, any>();
      const propMapByName = new Map<string, any>();
      for (const p of existingProperties) {
        propMapById.set(p.id, p);
        if (p.name) {
          propMapByName.set(p.name.trim().toLowerCase(), p);
        }
      }

      // Existing unit keys for duplicate prevention
      const existingUnits = await prisma.unit.findMany({
        where: {
          property: {
            status: { notIn: ['Inactive', 'Deleted'] },
            ...(companyId ? { companyId } : {}),
          },
        },
        select: {
          propertyId: true,
          unitNumber: true,
        },
      });

      const existingUnitKeySet = new Set<string>();
      for (const u of existingUnits) {
        existingUnitKeySet.add(`${u.propertyId}_${u.unitNumber.trim().toLowerCase()}`);
      }

      const importedUnits: any[] = [];
      const skippedDuplicates: string[] = [];

      await prisma.$transaction(
        async (tx) => {
          for (const item of units) {
            if (!item.unitNumber || !String(item.unitNumber).trim()) continue;

            // Resolve target property
            let targetProp = null;
            if (item.propertyId && propMapById.has(item.propertyId)) {
              targetProp = propMapById.get(item.propertyId);
            } else if (item.propertyName && typeof item.propertyName === 'string') {
              const cleanName = item.propertyName.trim().toLowerCase();
              if (propMapByName.has(cleanName)) {
                targetProp = propMapByName.get(cleanName);
              } else {
                const alphaName = cleanName.replace(/[^a-z0-9]/g, '');
                targetProp = existingProperties.find((p: any) => {
                  const pClean = (p.name || '').toLowerCase().trim();
                  const pAlpha = pClean.replace(/[^a-z0-9]/g, '');
                  return (
                    pAlpha === alphaName ||
                    cleanName.includes(pClean) ||
                    pClean.includes(cleanName) ||
                    (cleanName.split(/\s+/)[0] && pClean.startsWith(cleanName.split(/\s+/)[0]))
                  );
                });
              }
            }

            if (!targetProp) {
              if (existingProperties.length === 1) {
                targetProp = existingProperties[0];
              } else {
                continue;
              }
            }

            const unitNumStr = String(item.unitNumber).trim();
            const unitKey = `${targetProp.id}_${unitNumStr.toLowerCase()}`;
            if (existingUnitKeySet.has(unitKey)) {
              skippedDuplicates.push(`${targetProp.name} - Unit ${unitNumStr}`);
              continue;
            }
            existingUnitKeySet.add(unitKey);

            // Find or create building for property
            let buildingId = item.buildingId;
            if (!buildingId || !targetProp.buildings.some((b: any) => b.id === buildingId)) {
              let building = targetProp.buildings[0];
              if (!building) {
                building = await tx.building.create({
                  data: {
                    propertyId: targetProp.id,
                    name: `${targetProp.name} Building`,
                    floors: Math.max(1, Number(item.floor || 1)),
                    unitsCount: 1,
                  },
                });
                targetProp.buildings.push(building);
              }
              buildingId = building.id;
            }

            const floor = Math.max(1, parseInt(item.floor || '1', 10) || 1);
            const bedrooms = Math.max(0, parseInt(item.bedrooms || '1', 10) || 1);
            const bathrooms = Math.max(0.5, parseFloat(item.bathrooms || '1.0') || 1.0);
            const squareFootage = Math.max(0, parseFloat(item.squareFootage || '0') || 0);
            const rentAmount = Math.max(0, parseFloat(item.rentAmount || '0') || 0);
            const securityDeposit =
              item.securityDeposit !== undefined && item.securityDeposit !== null && !isNaN(Number(item.securityDeposit))
                ? Number(item.securityDeposit)
                : rentAmount;

            const isOccupied = item.status === 'Occupied' || Boolean(item.tenantFirstName);
            const unitStatus = isOccupied ? 'Occupied' : 'Vacant';

            const createdUnit = await tx.unit.create({
              data: {
                propertyId: targetProp.id,
                buildingId,
                unitNumber: unitNumStr,
                floor,
                bedrooms,
                bathrooms,
                squareFootage,
                rentAmount,
                securityDeposit,
                status: unitStatus,
                availabilityDate: new Date(),
              },
            });

            // If Occupied with resident details, auto-create Tenant, Lease & Opening Balance Invoice
            if (isOccupied && item.tenantFirstName) {
              const tenantFirstName = String(item.tenantFirstName || '').trim();
              const tenantLastName = String(item.tenantLastName || '').trim() || 'Resident';
              const tenantFullName = `${tenantFirstName} ${tenantLastName}`.trim();
              const tenantEmail = String(
                item.tenantEmail ||
                `${tenantFirstName.toLowerCase()}.${unitNumStr.toLowerCase()}.${Date.now()}@tenantportal.com`
              ).trim();
              const tenantPhone = String(item.tenantPhone || '555-0100').trim();

              let tenant = await tx.tenant.findFirst({
                where: { email: tenantEmail },
              });

              if (!tenant) {
                tenant = await tx.tenant.create({
                  data: {
                    firstName: tenantFirstName,
                    lastName: tenantLastName,
                    email: tenantEmail,
                    phone: tenantPhone,
                    status: 'Active',
                    unitId: createdUnit.id,
                    companyId,
                  },
                });
              } else {
                tenant = await tx.tenant.update({
                  where: { id: tenant.id },
                  data: {
                    unitId: createdUnit.id,
                    status: 'Active',
                  },
                });
              }

              // Create Active Lease starting from Move-In Date
              const startDate = item.moveInDate && !isNaN(new Date(item.moveInDate).getTime())
                ? new Date(item.moveInDate)
                : new Date();
              const endDate = new Date(startDate);
              endDate.setFullYear(endDate.getFullYear() + 1);

              const createdLease = await tx.lease.create({
                data: {
                  tenantId: tenant.id,
                  propertyId: targetProp.id,
                  unitId: createdUnit.id,
                  startDate,
                  endDate,
                  rentAmount,
                  depositAmount: securityDeposit,
                  status: 'Active',
                  companyId,
                },
              });

              // Determine past months from invoiceStartDate (or moveInDate)
              const startInvoiceDateStr = String(item.invoiceStartDate || item.moveInDate || '').trim();

              const getPastMonthsList = (dateStr: string) => {
                if (!dateStr) return [];
                const start = new Date(dateStr);
                if (isNaN(start.getTime())) return [];
                const now = new Date();
                let curYear = start.getFullYear();
                let curMonth = start.getMonth();
                const endYear = now.getFullYear();
                const endMonth = now.getMonth();

                if (curYear > endYear || (curYear === endYear && curMonth > endMonth)) {
                  return [];
                }

                const months: { id: string; label: string; dueDate: string; monthDate: Date }[] = [];
                while (curYear < endYear || (curYear === endYear && curMonth <= endMonth)) {
                  const d = new Date(curYear, curMonth, 1);
                  const id = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`;
                  const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                  const dueDate = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-01`;
                  months.push({ id, label, dueDate, monthDate: d });

                  curMonth++;
                  if (curMonth > 11) {
                    curMonth = 0;
                    curYear++;
                  }
                }
                return months;
              };

              const pastMonths = getPastMonthsList(startInvoiceDateStr);
              const pastRentStatus = String(item.pastRentStatus || 'All Paid').trim().toLowerCase();
              const includeLateFee = Boolean(item.includeLateFee);
              let outstandingBalance = Number(item.outstandingBalance || 0);
              if (isNaN(outstandingBalance) || outstandingBalance < 0) {
                outstandingBalance = 0;
              }

              if (pastMonths.length > 0) {
                const totalPastRent = pastMonths.length * rentAmount;

                if (pastRentStatus.includes('unpaid')) {
                  // All months unpaid / overdue
                  for (const m of pastMonths) {
                    const lateFee = includeLateFee ? 50 : 0;
                    const totalAmt = rentAmount + lateFee;
                    const lineItems: any[] = [
                      { description: `Monthly Rent Charge - ${m.label}`, amount: rentAmount },
                    ];
                    if (lateFee > 0) {
                      lineItems.push({
                        description: 'Overdue Late Fee Charge (10-Day Policy)',
                        amount: lateFee,
                      });
                    }

                    await tx.invoice.create({
                      data: {
                        tenantId: tenant.id,
                        tenantName: tenantFullName,
                        propertyId: targetProp.id,
                        propertyName: targetProp.name,
                        unitNumber: unitNumStr,
                        dueDate: m.dueDate,
                        amount: totalAmt,
                        paidAmount: 0,
                        balance: totalAmt,
                        status: 'Overdue',
                        lineItems: JSON.stringify(lineItems),
                        companyId,
                      },
                    });
                  }
                } else if (
                  pastRentStatus === 'all paid' ||
                  (outstandingBalance === 0 &&
                    !pastRentStatus.includes('unpaid') &&
                    !pastRentStatus.includes('partial') &&
                    !pastRentStatus.includes('custom'))
                ) {
                  // All months fully paid with receipts
                  for (const m of pastMonths) {
                    const lineItems: any[] = [
                      { description: `Monthly Rent Charge - ${m.label}`, amount: rentAmount },
                    ];

                    await tx.invoice.create({
                      data: {
                        tenantId: tenant.id,
                        tenantName: tenantFullName,
                        propertyId: targetProp.id,
                        propertyName: targetProp.name,
                        unitNumber: unitNumStr,
                        dueDate: m.dueDate,
                        amount: rentAmount,
                        paidAmount: rentAmount,
                        balance: 0,
                        status: 'Paid',
                        lineItems: JSON.stringify(lineItems),
                        companyId,
                      },
                    });

                    await tx.rentPayment.create({
                      data: {
                        tenantId: tenant.id,
                        propertyId: targetProp.id,
                        unitId: createdUnit.id,
                        leaseId: createdLease.id,
                        amount: rentAmount,
                        dueDate: m.monthDate,
                        paidDate: m.monthDate,
                        status: 'Paid',
                        paymentMethod: 'Offline',
                        referenceNumber: `RCP-BULK-${Math.floor(100000 + Math.random() * 900000)}`,
                        createdBy: 'Manager',
                        companyId,
                      },
                    });
                  }
                } else {
                  // Partial / Custom allocation (FIFO: oldest months paid first, recent months due)
                  let remainingPaidPool = Math.max(0, totalPastRent - outstandingBalance);
                  const excessDebt = Math.max(0, outstandingBalance - totalPastRent);

                  for (let i = 0; i < pastMonths.length; i++) {
                    const m = pastMonths[i];
                    const isLastMonth = i === pastMonths.length - 1;

                    if (remainingPaidPool >= rentAmount) {
                      // Fully paid month
                      remainingPaidPool -= rentAmount;
                      const lineItems = [
                        { description: `Monthly Rent Charge - ${m.label}`, amount: rentAmount },
                      ];

                      await tx.invoice.create({
                        data: {
                          tenantId: tenant.id,
                          tenantName: tenantFullName,
                          propertyId: targetProp.id,
                          propertyName: targetProp.name,
                          unitNumber: unitNumStr,
                          dueDate: m.dueDate,
                          amount: rentAmount,
                          paidAmount: rentAmount,
                          balance: 0,
                          status: 'Paid',
                          lineItems: JSON.stringify(lineItems),
                          companyId,
                        },
                      });

                      await tx.rentPayment.create({
                        data: {
                          tenantId: tenant.id,
                          propertyId: targetProp.id,
                          unitId: createdUnit.id,
                          leaseId: createdLease.id,
                          amount: rentAmount,
                          dueDate: m.monthDate,
                          paidDate: m.monthDate,
                          status: 'Paid',
                          paymentMethod: 'Offline',
                          referenceNumber: `RCP-BULK-${Math.floor(100000 + Math.random() * 900000)}`,
                          createdBy: 'Manager',
                          companyId,
                        },
                      });
                    } else if (remainingPaidPool > 0) {
                      // Partially paid month
                      const monthPaid = remainingPaidPool;
                      remainingPaidPool = 0;
                      const lateFee = includeLateFee ? 50 : 0;
                      let totalAmt = rentAmount + lateFee;
                      if (isLastMonth && excessDebt > 0) {
                        totalAmt += excessDebt;
                      }
                      const monthBal = totalAmt - monthPaid;

                      const lineItems: any[] = [
                        { description: `Monthly Rent Charge - ${m.label}`, amount: rentAmount },
                      ];
                      if (lateFee > 0) {
                        lineItems.push({
                          description: 'Overdue Late Fee Charge (10-Day Policy)',
                          amount: lateFee,
                        });
                      }
                      if (isLastMonth && excessDebt > 0) {
                        lineItems.push({
                          description: 'Historical Opening Balance Dues',
                          amount: excessDebt,
                        });
                      }

                      await tx.invoice.create({
                        data: {
                          tenantId: tenant.id,
                          tenantName: tenantFullName,
                          propertyId: targetProp.id,
                          propertyName: targetProp.name,
                          unitNumber: unitNumStr,
                          dueDate: m.dueDate,
                          amount: totalAmt,
                          paidAmount: monthPaid,
                          balance: monthBal,
                          status: 'Partially Paid',
                          lineItems: JSON.stringify(lineItems),
                          companyId,
                        },
                      });

                      await tx.rentPayment.create({
                        data: {
                          tenantId: tenant.id,
                          propertyId: targetProp.id,
                          unitId: createdUnit.id,
                          leaseId: createdLease.id,
                          amount: monthPaid,
                          dueDate: m.monthDate,
                          paidDate: m.monthDate,
                          status: 'PartiallyPaid',
                          paymentMethod: 'Offline_Partial',
                          referenceNumber: `RCP-PARTIAL-${Math.floor(100000 + Math.random() * 900000)}`,
                          createdBy: 'Manager',
                          companyId,
                        },
                      });
                    } else {
                      // Fully overdue month
                      const lateFee = includeLateFee ? 50 : 0;
                      let totalAmt = rentAmount + lateFee;
                      if (isLastMonth && excessDebt > 0) {
                        totalAmt += excessDebt;
                      }

                      const lineItems: any[] = [
                        { description: `Monthly Rent Charge - ${m.label}`, amount: rentAmount },
                      ];
                      if (lateFee > 0) {
                        lineItems.push({
                          description: 'Overdue Late Fee Charge (10-Day Policy)',
                          amount: lateFee,
                        });
                      }
                      if (isLastMonth && excessDebt > 0) {
                        lineItems.push({
                          description: 'Historical Opening Balance Dues',
                          amount: excessDebt,
                        });
                      }

                      await tx.invoice.create({
                        data: {
                          tenantId: tenant.id,
                          tenantName: tenantFullName,
                          propertyId: targetProp.id,
                          propertyName: targetProp.name,
                          unitNumber: unitNumStr,
                          dueDate: m.dueDate,
                          amount: totalAmt,
                          paidAmount: 0,
                          balance: totalAmt,
                          status: 'Overdue',
                          lineItems: JSON.stringify(lineItems),
                          companyId,
                        },
                      });
                    }
                  }
                }
              } else if (outstandingBalance > 0) {
                // No past months (e.g. current or future date), but has opening balance
                const invoiceDueDate =
                  item.invoiceStartDate && !isNaN(new Date(item.invoiceStartDate).getTime())
                    ? new Date(item.invoiceStartDate).toISOString().split('T')[0]
                    : new Date().toISOString().split('T')[0];

                const lineItems: any[] = [
                  { description: 'Opening Balance / Previous Dues', amount: outstandingBalance },
                ];
                if (includeLateFee) {
                  lineItems.push({ description: 'Historical Late Fee Applied ($50)', amount: 50 });
                }

                await tx.invoice.create({
                  data: {
                    tenantId: tenant.id,
                    tenantName: tenantFullName,
                    propertyId: targetProp.id,
                    propertyName: targetProp.name,
                    unitNumber: unitNumStr,
                    dueDate: invoiceDueDate,
                    amount: outstandingBalance + (includeLateFee ? 50 : 0),
                    paidAmount: 0,
                    balance: outstandingBalance + (includeLateFee ? 50 : 0),
                    status: 'Overdue',
                    lineItems: JSON.stringify(lineItems),
                    companyId,
                  },
                });
              }
            }

            // Increment unitsCount (and occupiedUnits if Occupied) on Property
            await tx.property.update({
              where: { id: targetProp.id },
              data: {
                unitsCount: { increment: 1 },
                ...(isOccupied ? { occupiedUnits: { increment: 1 } } : {}),
              },
            });

            // Increment unitsCount on Building
            await tx.building.update({
              where: { id: buildingId },
              data: {
                unitsCount: { increment: 1 },
              },
            });

            // Recalculate occupancyRate on Property if Occupied
            if (isOccupied) {
              const updatedP = await tx.property.findUnique({
                where: { id: targetProp.id },
                select: { unitsCount: true, occupiedUnits: true },
              });
              if (updatedP && updatedP.unitsCount > 0) {
                const rate = Math.round((updatedP.occupiedUnits / updatedP.unitsCount) * 100);
                await tx.property.update({
                  where: { id: targetProp.id },
                  data: { occupancyRate: rate },
                });
              }
            }

            importedUnits.push(createdUnit);
          }
        },
        {
          maxWait: 20000,
          timeout: 120000,
        }
      );

      return sendSuccess({
        res,
        data: {
          count: importedUnits.length,
          units: importedUnits,
          skippedDuplicates,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const unitController = new UnitController();
