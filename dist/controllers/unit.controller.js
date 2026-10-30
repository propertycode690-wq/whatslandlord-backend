"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unitController = exports.UnitController = void 0;
const database_1 = __importDefault(require("../config/database"));
const apiResponse_1 = require("../utils/apiResponse");
const appError_1 = require("../utils/appError");
class UnitController {
    async getAll(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const units = await database_1.default.unit.findMany({
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
            return (0, apiResponse_1.sendSuccess)({ res, data: units });
        }
        catch (error) {
            next(error);
        }
    }
    async getById(req, res, next) {
        try {
            const id = req.params.id;
            const companyId = req.user?.companyId;
            const unit = await database_1.default.unit.findFirst({
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
            return (0, apiResponse_1.sendSuccess)({ res, data: unit });
        }
        catch (error) {
            next(error);
        }
    }
    async create(req, res, next) {
        try {
            const { propertyId, buildingId, unitNumber, floor, bedrooms, bathrooms, squareFootage, rentAmount, securityDeposit, availabilityDate, status, isLateFeeEnabled, lateFeeType, lateFeeAmount, lateFeeGraceDays, } = req.body;
            const companyId = req.user?.companyId;
            if (companyId) {
                const company = await database_1.default.company.findUnique({ where: { id: companyId } });
                if (company) {
                    const totalUnitsCount = await database_1.default.unit.count({
                        where: { property: { companyId } },
                    });
                    const maxUnitsLimit = company.maxUnits || 500;
                    if (totalUnitsCount >= maxUnitsLimit) {
                        throw new appError_1.AppError(`Unit creation limit reached! Your plan (${company.planName}) permits up to ${maxUnitsLimit} units. Please upgrade your subscription plan.`, 403, 'PLAN_LIMIT_EXCEEDED');
                    }
                }
            }
            let targetPropertyId = propertyId;
            let property = null;
            if (targetPropertyId) {
                property = await database_1.default.property.findFirst({
                    where: companyId ? { id: targetPropertyId, companyId } : { id: targetPropertyId }
                });
                if (!property) {
                    throw new appError_1.AppError('Property not found.', 404, 'NOT_FOUND');
                }
            }
            else {
                property = await database_1.default.property.findFirst({
                    where: companyId ? { companyId } : {},
                });
                if (!property) {
                    throw new appError_1.AppError('Please create a property before adding units.', 404, 'NOT_FOUND');
                }
            }
            targetPropertyId = property.id;
            let finalBuildingId = buildingId;
            if (finalBuildingId) {
                const existingBuilding = await database_1.default.building.findFirst({
                    where: companyId ? {
                        id: finalBuildingId,
                        property: { companyId }
                    } : { id: finalBuildingId },
                    include: { property: true },
                });
                if (!existingBuilding) {
                    finalBuildingId = undefined;
                }
                else if (existingBuilding.unitsCount > 0) {
                    const currentUnitsCount = await database_1.default.unit.count({
                        where: { buildingId: finalBuildingId },
                    });
                    if (currentUnitsCount >= existingBuilding.unitsCount) {
                        const propName = property?.name || existingBuilding.property?.name || 'Property';
                        throw new appError_1.AppError(`Cannot add unit. Property '${propName}' is restricted to a maximum of ${existingBuilding.unitsCount} units.`, 400, 'PROPERTY_CAPACITY_REACHED');
                    }
                }
            }
            if (!finalBuildingId) {
                let building = await database_1.default.building.findFirst({
                    where: { propertyId: targetPropertyId },
                });
                if (!building) {
                    building = await database_1.default.building.create({
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
                    const currentUnitsCount = await database_1.default.unit.count({
                        where: { buildingId: finalBuildingId },
                    });
                    if (currentUnitsCount >= building.unitsCount) {
                        throw new appError_1.AppError(`Cannot add unit. Property '${property.name}' is restricted to a maximum of ${building.unitsCount} units.`, 400, 'PROPERTY_CAPACITY_REACHED');
                    }
                }
            }
            // Check if unit number already exists in this property
            const existingUnit = await database_1.default.unit.findFirst({
                where: {
                    propertyId: targetPropertyId,
                    unitNumber,
                },
            });
            if (existingUnit) {
                throw new appError_1.AppError(`Unit "${unitNumber}" already exists in this property.`, 400, 'DUPLICATE_UNIT');
            }
            const unit = await database_1.default.unit.create({
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
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: unit });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const id = req.params.id;
            const companyId = req.user?.companyId;
            const { propertyId, buildingId, unitNumber, floor, bedrooms, bathrooms, squareFootage, rentAmount, securityDeposit, availabilityDate, status, isLateFeeEnabled, lateFeeType, lateFeeAmount, lateFeeGraceDays, } = req.body;
            if (companyId) {
                const check = await database_1.default.unit.findFirst({
                    where: {
                        id,
                        property: { companyId },
                    },
                });
                if (!check)
                    throw new appError_1.AppError('Unit not found.', 404, 'NOT_FOUND');
            }
            if (propertyId) {
                const prop = await database_1.default.property.findFirst({
                    where: companyId ? { id: propertyId, companyId } : { id: propertyId }
                });
                if (!prop)
                    throw new appError_1.AppError('Property not found.', 404, 'NOT_FOUND');
            }
            if (buildingId) {
                const build = await database_1.default.building.findFirst({
                    where: companyId ? {
                        id: buildingId,
                        property: { companyId }
                    } : { id: buildingId }
                });
                if (!build)
                    throw new appError_1.AppError('Building not found.', 404, 'NOT_FOUND');
            }
            const unit = await database_1.default.unit.update({
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
            return (0, apiResponse_1.sendSuccess)({ res, data: unit });
        }
        catch (error) {
            next(error);
        }
    }
    async delete(req, res, next) {
        try {
            const id = req.params.id;
            const companyId = req.user?.companyId;
            if (companyId) {
                const check = await database_1.default.unit.findFirst({
                    where: {
                        id,
                        property: { companyId },
                    },
                });
                if (!check)
                    throw new appError_1.AppError('Unit not found.', 404, 'NOT_FOUND');
            }
            await database_1.default.unit.delete({
                where: { id },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: { success: true } });
        }
        catch (error) {
            next(error);
        }
    }
    async assignTenant(req, res, next) {
        try {
            const id = req.params.id;
            const companyId = req.user?.companyId;
            const { tenantId } = req.body;
            if (companyId) {
                const check = await database_1.default.unit.findFirst({
                    where: {
                        id,
                        property: { companyId },
                    },
                });
                if (!check)
                    throw new appError_1.AppError('Unit not found.', 404, 'NOT_FOUND');
                if (tenantId) {
                    const tenantCheck = await database_1.default.tenant.findFirst({
                        where: { id: tenantId, companyId },
                    });
                    if (!tenantCheck)
                        throw new appError_1.AppError('Tenant not found.', 404, 'NOT_FOUND');
                }
            }
            const unit = await database_1.default.unit.update({
                where: { id },
                data: {
                    status: 'Occupied',
                    tenants: {
                        connect: { id: tenantId },
                    },
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: unit });
        }
        catch (error) {
            next(error);
        }
    }
    async bulkImport(req, res, next) {
        try {
            const { units } = req.body;
            if (!Array.isArray(units) || units.length === 0) {
                throw new appError_1.AppError('No units provided for import.', 400, 'INVALID_INPUT');
            }
            const companyId = req.user?.companyId;
            // Plan limit verification
            if (companyId) {
                const company = await database_1.default.company.findUnique({ where: { id: companyId } });
                if (company) {
                    const totalUnitsCount = await database_1.default.unit.count({
                        where: { property: { companyId } },
                    });
                    const maxUnitsLimit = company.maxUnits || 500;
                    if (totalUnitsCount + units.length > maxUnitsLimit) {
                        throw new appError_1.AppError(`Import exceeds your plan limit! Your plan allows up to ${maxUnitsLimit} units. Current: ${totalUnitsCount}, Attempting to import: ${units.length}.`, 403, 'PLAN_LIMIT_EXCEEDED');
                    }
                }
            }
            // Fetch all accessible properties
            const existingProperties = await database_1.default.property.findMany({
                where: {
                    status: { notIn: ['Inactive', 'Deleted'] },
                    ...(companyId ? { companyId } : {}),
                },
                include: {
                    buildings: true,
                },
            });
            if (existingProperties.length === 0) {
                throw new appError_1.AppError('No properties found. Please create or import properties first before importing units.', 400, 'NO_PROPERTIES_FOUND');
            }
            const propMapById = new Map();
            const propMapByName = new Map();
            for (const p of existingProperties) {
                propMapById.set(p.id, p);
                if (p.name) {
                    propMapByName.set(p.name.trim().toLowerCase(), p);
                }
            }
            // Existing unit keys for duplicate prevention
            const existingUnits = await database_1.default.unit.findMany({
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
            const existingUnitKeySet = new Set();
            for (const u of existingUnits) {
                existingUnitKeySet.add(`${u.propertyId}_${u.unitNumber.trim().toLowerCase()}`);
            }
            const importedUnits = [];
            const skippedDuplicates = [];
            await database_1.default.$transaction(async (tx) => {
                for (const item of units) {
                    if (!item.unitNumber || !String(item.unitNumber).trim())
                        continue;
                    // Resolve target property
                    let targetProp = null;
                    if (item.propertyId && propMapById.has(item.propertyId)) {
                        targetProp = propMapById.get(item.propertyId);
                    }
                    else if (item.propertyName && typeof item.propertyName === 'string') {
                        const cleanName = item.propertyName.trim().toLowerCase();
                        if (propMapByName.has(cleanName)) {
                            targetProp = propMapByName.get(cleanName);
                        }
                    }
                    if (!targetProp) {
                        if (existingProperties.length === 1) {
                            targetProp = existingProperties[0];
                        }
                        else {
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
                    if (!buildingId || !targetProp.buildings.some((b) => b.id === buildingId)) {
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
                    const securityDeposit = item.securityDeposit !== undefined && item.securityDeposit !== null && !isNaN(Number(item.securityDeposit))
                        ? Number(item.securityDeposit)
                        : rentAmount;
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
                            status: 'Vacant', // Streamlined Vacant import
                            availabilityDate: new Date(),
                        },
                    });
                    // Increment unitsCount on Property
                    await tx.property.update({
                        where: { id: targetProp.id },
                        data: {
                            unitsCount: { increment: 1 },
                        },
                    });
                    // Increment unitsCount on Building
                    await tx.building.update({
                        where: { id: buildingId },
                        data: {
                            unitsCount: { increment: 1 },
                        },
                    });
                    importedUnits.push(createdUnit);
                }
            }, {
                maxWait: 20000,
                timeout: 120000,
            });
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    count: importedUnits.length,
                    units: importedUnits,
                    skippedDuplicates,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.UnitController = UnitController;
exports.unitController = new UnitController();
