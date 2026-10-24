"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.propertyService = exports.PropertyService = void 0;
const database_1 = __importDefault(require("../config/database"));
const appError_1 = require("../utils/appError");
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const companyHelper_1 = require("../utils/companyHelper");
const crypto_1 = require("../utils/crypto");
class PropertyService {
    async getAllProperties(companyId, user) {
        let whereClause = companyId ? { companyId, status: { notIn: ['Inactive', 'Deleted'] } } : { status: { notIn: ['Inactive', 'Deleted'] } };
        if ((user?.roleName === 'Owner' || user?.role === 'Owner') && user?.email) {
            const owner = await database_1.default.owner.findFirst({
                where: { email: user.email },
            });
            if (owner) {
                whereClause.ownerId = owner.id;
            }
            else {
                return [];
            }
        }
        const properties = await database_1.default.property.findMany({
            where: whereClause,
            include: {
                owner: true,
                buildings: true,
                units: true,
            },
        });
        return properties.map((p) => ({
            ...p,
            hasPaymentToken: !!p.encryptedPaymentToken,
            encryptedPaymentToken: undefined,
            paymentTokenIv: undefined,
        }));
    }
    async getPropertyById(id, companyId) {
        const prop = await database_1.default.property.findFirst({
            where: companyId ? { id, companyId } : { id },
            include: {
                owner: true,
                buildings: true,
                units: true,
            },
        });
        if (!prop)
            throw new appError_1.AppError('Property not found.', 404, 'NOT_FOUND');
        return {
            ...prop,
            hasPaymentToken: !!prop.encryptedPaymentToken,
            encryptedPaymentToken: undefined,
            paymentTokenIv: undefined,
        };
    }
    async createProperty(data, file) {
        const companyId = await (0, companyHelper_1.getManagerCompanyId)(undefined, data.companyId);
        if (companyId) {
            const company = await database_1.default.company.findUnique({ where: { id: companyId } });
            if (company) {
                const currentCount = await database_1.default.property.count({
                    where: { companyId, status: { notIn: ['Inactive', 'Deleted'] } },
                });
                const maxLimit = company.maxProperties || 50;
                if (currentCount >= maxLimit) {
                    throw new appError_1.AppError(`Property creation limit reached! Your plan (${company.planName}) permits up to ${maxLimit} properties. Please upgrade your subscription plan.`, 403, 'PLAN_LIMIT_EXCEEDED');
                }
            }
        }
        let ownerId = data.ownerId;
        let ownerExists = false;
        if (ownerId) {
            try {
                const owner = await database_1.default.owner.findFirst({
                    where: companyId ? { id: ownerId, companyId } : { id: ownerId },
                });
                if (owner) {
                    ownerExists = true;
                }
                else {
                    throw new appError_1.AppError('Owner not found or does not belong to your company.', 404, 'NOT_FOUND');
                }
            }
            catch (e) {
                if (e instanceof appError_1.AppError)
                    throw e;
                // ignore
            }
        }
        if (!ownerExists) {
            const firstOwner = await database_1.default.owner.findFirst({
                where: companyId ? { companyId } : {},
            });
            if (firstOwner) {
                ownerId = firstOwner.id;
            }
            else {
                const defaultOwner = await database_1.default.owner.create({
                    data: {
                        name: 'Default Owner',
                        email: `default.owner.${Date.now()}@example.com`,
                        phone: '555-0100',
                        companyId,
                    }
                });
                ownerId = defaultOwner.id;
            }
        }
        let typeVal = (data.type || 'Apartment').replace(/\s+/g, '');
        if (typeVal === 'MUP' || typeVal.includes('Mixed') || typeVal.includes('MUP')) {
            typeVal = 'Commercial';
        }
        const validTypes = ['Apartment', 'Commercial', 'SingleFamily', 'MultiFamily', 'HOA'];
        if (!validTypes.includes(typeVal)) {
            typeVal = 'Apartment';
        }
        // Cloudinary upload
        let imageUrl = data.imageUrl || null;
        if (file) {
            try {
                imageUrl = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary_1.default.uploader.upload_stream({ folder: 'properties' }, (error, result) => {
                        if (error)
                            return reject(error);
                        resolve(result?.secure_url || '');
                    });
                    uploadStream.end(file.buffer);
                });
            }
            catch (err) {
                console.error('Cloudinary image upload failed:', err);
            }
        }
        let paymentProvider = data.paymentProvider || 'COMPANY_DEFAULT';
        let paymentAccountId = data.paymentAccountId || null;
        let encryptedPaymentToken = null;
        let paymentTokenIv = null;
        let paymentStatus = data.paymentStatus || 'Active';
        if (paymentProvider && paymentProvider !== 'COMPANY_DEFAULT' && data.paymentAuthToken) {
            try {
                const encrypted = (0, crypto_1.encrypt)(data.paymentAuthToken);
                encryptedPaymentToken = encrypted.encryptedText;
                paymentTokenIv = encrypted.iv;
            }
            catch (e) {
                console.error('Failed to encrypt property payment token', e);
            }
        }
        else if (paymentProvider === 'COMPANY_DEFAULT') {
            paymentAccountId = null;
        }
        const createdProp = await database_1.default.property.create({
            data: {
                name: data.name,
                type: typeVal,
                status: data.status || 'Active',
                ownerId: ownerId,
                ownershipPercentage: Number(data.ownershipPercentage) || 100,
                managementCompany: data.managementCompany || 'Apex Property Management',
                address: data.address || 'Austin, TX',
                streetAddress: data.streetAddress || data.address || '100 Main St',
                city: data.city || 'Austin',
                state: data.state || 'TX',
                zip: data.zip || '78701',
                yearBuilt: Number(data.yearBuilt) || 2020,
                squareFootage: Number(data.squareFootage) || 10000,
                purchasePrice: Number(data.purchasePrice) || 1000000,
                currentValue: Number(data.currentValue) || 1200000,
                imageUrl: imageUrl,
                companyId: data.companyId,
                nycBin: data.nycBin || data.bin || null,
                paymentProvider,
                paymentAccountId,
                encryptedPaymentToken,
                paymentTokenIv,
                paymentStatus,
            },
        });
        // Auto-create default Building for hierarchy safety
        try {
            await database_1.default.building.create({
                data: {
                    propertyId: createdProp.id,
                    name: createdProp.name,
                    floors: Number(data.totalFloors || data.totalBuildings || data.floors || 1),
                    unitsCount: Number(data.totalUnits !== undefined && data.totalUnits !== null && Number(data.totalUnits) > 0 ? data.totalUnits : 1),
                },
            });
        }
        catch (bldErr) {
            console.error('Failed to auto-create building for property:', bldErr);
        }
        return createdProp;
    }
    async bulkImportProperties(propertiesList, companyId) {
        if (!Array.isArray(propertiesList) || propertiesList.length === 0) {
            throw new appError_1.AppError('No properties provided for import.', 400, 'INVALID_INPUT');
        }
        const resolvedCompanyId = await (0, companyHelper_1.getManagerCompanyId)(undefined, companyId);
        if (resolvedCompanyId) {
            const company = await database_1.default.company.findUnique({ where: { id: resolvedCompanyId } });
            if (company) {
                const currentCount = await database_1.default.property.count({
                    where: { companyId: resolvedCompanyId, status: { notIn: ['Inactive', 'Deleted'] } },
                });
                const maxLimit = company.maxProperties || 50;
                if (currentCount + propertiesList.length > maxLimit) {
                    throw new appError_1.AppError(`Import exceeds your plan limit! Your plan allows up to ${maxLimit} properties. Current: ${currentCount}, Attempting to import: ${propertiesList.length}. Please upgrade your plan or reduce the import list.`, 403, 'PLAN_LIMIT_EXCEEDED');
                }
            }
        }
        // Resolve or create default owner
        let defaultOwner = await database_1.default.owner.findFirst({
            where: resolvedCompanyId ? { companyId: resolvedCompanyId } : {},
        });
        if (!defaultOwner) {
            defaultOwner = await database_1.default.owner.create({
                data: {
                    name: 'Default Owner',
                    email: `default.owner.${Date.now()}@example.com`,
                    phone: '555-0100',
                    companyId: resolvedCompanyId,
                },
            });
        }
        const validTypes = ['Apartment', 'Commercial', 'SingleFamily', 'MultiFamily', 'HOA'];
        const importedProperties = [];
        // Execute in transaction to ensure all or nothing with complete integrity
        // Set higher timeout (120s) and maxWait (20s) for bulk processing
        await database_1.default.$transaction(async (tx) => {
            // Pre-fetch all existing owners for the company to avoid repetitive DB lookups
            const existingOwners = await tx.owner.findMany({
                where: resolvedCompanyId ? { companyId: resolvedCompanyId } : {},
            });
            const ownerMap = new Map();
            for (const o of existingOwners) {
                if (o.name) {
                    ownerMap.set(o.name.trim().toLowerCase(), o.id);
                }
            }
            for (const item of propertiesList) {
                if (!item.name || !item.name.trim())
                    continue;
                let typeVal = (item.type || 'Apartment').replace(/\s+/g, '');
                if (typeVal === 'MUP' || typeVal.includes('Mixed') || typeVal.includes('MUP')) {
                    typeVal = 'Commercial';
                }
                if (!validTypes.includes(typeVal)) {
                    typeVal = 'Apartment';
                }
                // Resolve Owner: check ownerId, or ownerName from map / create new, or default
                let resolvedOwnerId = item.ownerId;
                if (!resolvedOwnerId && item.ownerName && typeof item.ownerName === 'string' && item.ownerName.trim()) {
                    const trimmedOwnerName = item.ownerName.trim();
                    const lowerName = trimmedOwnerName.toLowerCase();
                    if (ownerMap.has(lowerName)) {
                        resolvedOwnerId = ownerMap.get(lowerName);
                    }
                    else {
                        const cleanAlias = lowerName.replace(/[^a-z0-9]/g, '') || 'owner';
                        const newOwner = await tx.owner.create({
                            data: {
                                name: trimmedOwnerName,
                                email: `${cleanAlias}.${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`,
                                phone: '555-0100',
                                companyId: resolvedCompanyId,
                            },
                        });
                        resolvedOwnerId = newOwner.id;
                        ownerMap.set(lowerName, newOwner.id);
                    }
                }
                if (!resolvedOwnerId) {
                    resolvedOwnerId = defaultOwner.id;
                }
                const street = (item.streetAddress || item.address || item.name || '100 Main St').trim();
                const city = (item.city || 'Austin').trim();
                const state = (item.state || 'TX').trim();
                const zip = (item.zip || '78701').trim();
                const country = (item.country || 'USA').trim();
                const combinedAddress = `${street}, ${city}, ${state} ${zip}`;
                const unitsCount = Math.max(1, Number(item.totalUnits || item.unitsCount || 1));
                const occupiedUnits = Math.max(0, Math.min(unitsCount, Number(item.occupiedUnits || 0)));
                const occupancyRate = item.occupancyRate !== undefined && item.occupancyRate !== null && !isNaN(Number(item.occupancyRate))
                    ? Number(item.occupancyRate)
                    : (unitsCount > 0 ? Math.round((occupiedUnits / unitsCount) * 100) : 0);
                const floors = Math.max(1, Number(item.totalFloors || item.floors || 1));
                const totalBuildings = Math.max(1, Number(item.totalBuildings || 1));
                const prop = await tx.property.create({
                    data: {
                        name: item.name.trim(),
                        type: typeVal,
                        status: item.status || 'Active',
                        ownerId: resolvedOwnerId,
                        ownershipPercentage: Number(item.ownershipPercentage) || 100,
                        managementCompany: item.managementCompany || 'Apex Property Management',
                        address: combinedAddress,
                        streetAddress: street,
                        city,
                        state,
                        country,
                        zip,
                        unitsCount,
                        occupiedUnits,
                        occupancyRate,
                        monthlyRevenue: Number(item.monthlyRevenue) || 0,
                        monthlyExpenses: Number(item.monthlyExpenses) || 0,
                        yearBuilt: Number(item.yearBuilt) || 2020,
                        totalBuildings,
                        squareFootage: Number(item.squareFootage) || 10000,
                        purchasePrice: Number(item.purchasePrice) || 1000000,
                        currentValue: Number(item.currentValue) || 1200000,
                        companyId: resolvedCompanyId,
                        nycBin: item.nycBin || null,
                    },
                });
                await tx.building.create({
                    data: {
                        propertyId: prop.id,
                        name: prop.name,
                        floors,
                        unitsCount,
                        occupancyRate,
                    },
                });
                importedProperties.push(prop);
            }
        }, {
            maxWait: 20000, // 20s max wait to acquire connection
            timeout: 120000, // 120s timeout for large bulk imports
        });
        return {
            count: importedProperties.length,
            properties: importedProperties,
        };
    }
    async updateProperty(id, data, file, companyId) {
        const prop = await database_1.default.property.findFirst({
            where: companyId ? { id, companyId } : { id },
        });
        if (!prop)
            throw new appError_1.AppError('Property not found.', 404, 'NOT_FOUND');
        let ownerId = data.ownerId;
        if (ownerId) {
            const owner = await database_1.default.owner.findFirst({
                where: companyId ? { id: ownerId, companyId } : { id: ownerId },
            });
            if (!owner) {
                throw new appError_1.AppError('Owner not found or does not belong to your company.', 404, 'NOT_FOUND');
            }
        }
        else {
            ownerId = prop.ownerId;
        }
        let typeVal = data.type;
        if (typeVal) {
            typeVal = typeVal.replace(/\s+/g, '');
            if (typeVal === 'MUP' || typeVal.includes('Mixed') || typeVal.includes('MUP')) {
                typeVal = 'Commercial';
            }
            const validTypes = ['Apartment', 'Commercial', 'SingleFamily', 'MultiFamily', 'HOA'];
            if (!validTypes.includes(typeVal)) {
                typeVal = prop.type;
            }
        }
        else {
            typeVal = prop.type;
        }
        // Cloudinary upload
        let imageUrl = data.imageUrl !== undefined ? data.imageUrl : prop.imageUrl;
        if (file) {
            try {
                imageUrl = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary_1.default.uploader.upload_stream({ folder: 'properties' }, (error, result) => {
                        if (error)
                            return reject(error);
                        resolve(result?.secure_url || '');
                    });
                    uploadStream.end(file.buffer);
                });
            }
            catch (err) {
                console.error('Cloudinary image upload failed:', err);
            }
        }
        const binVal = data.nycBin !== undefined ? data.nycBin : (data.bin !== undefined ? data.bin : prop.nycBin);
        let paymentProvider = data.paymentProvider !== undefined ? data.paymentProvider : prop.paymentProvider;
        let paymentAccountId = data.paymentAccountId !== undefined ? data.paymentAccountId : prop.paymentAccountId;
        let paymentStatus = data.paymentStatus !== undefined ? data.paymentStatus : (prop.paymentStatus || 'Active');
        let encryptedPaymentToken = prop.encryptedPaymentToken;
        let paymentTokenIv = prop.paymentTokenIv;
        if (paymentProvider === 'COMPANY_DEFAULT') {
            paymentAccountId = null;
            encryptedPaymentToken = null;
            paymentTokenIv = null;
        }
        else if (data.paymentAuthToken) {
            try {
                const encrypted = (0, crypto_1.encrypt)(data.paymentAuthToken);
                encryptedPaymentToken = encrypted.encryptedText;
                paymentTokenIv = encrypted.iv;
            }
            catch (e) {
                console.error('Failed to encrypt property payment token', e);
            }
        }
        const updatedProp = await database_1.default.property.update({
            where: { id },
            data: {
                name: data.name !== undefined ? data.name : prop.name,
                type: typeVal,
                status: data.status !== undefined ? data.status : prop.status,
                ownerId: ownerId,
                ownershipPercentage: data.ownershipPercentage !== undefined ? Number(data.ownershipPercentage) : prop.ownershipPercentage,
                managementCompany: data.managementCompany !== undefined ? data.managementCompany : prop.managementCompany,
                address: data.address !== undefined ? data.address : prop.address,
                streetAddress: data.streetAddress !== undefined ? data.streetAddress : prop.streetAddress,
                city: data.city !== undefined ? data.city : prop.city,
                state: data.state !== undefined ? data.state : prop.state,
                zip: data.zip !== undefined ? data.zip : prop.zip,
                yearBuilt: data.yearBuilt !== undefined ? Number(data.yearBuilt) : prop.yearBuilt,
                squareFootage: data.squareFootage !== undefined ? Number(data.squareFootage) : prop.squareFootage,
                purchasePrice: data.purchasePrice !== undefined ? Number(data.purchasePrice) : prop.purchasePrice,
                currentValue: data.currentValue !== undefined ? Number(data.currentValue) : prop.currentValue,
                nycBin: binVal,
                imageUrl: imageUrl,
                paymentProvider,
                paymentAccountId,
                encryptedPaymentToken,
                paymentTokenIv,
                paymentStatus,
            },
        });
        // Auto-update associated building details (name, floors & unitsCount)
        try {
            const bldData = {};
            if (data.name !== undefined)
                bldData.name = updatedProp.name;
            if (data.totalFloors !== undefined || data.totalBuildings !== undefined || data.floors !== undefined) {
                bldData.floors = Number(data.totalFloors || data.totalBuildings || data.floors || 1);
            }
            if (data.totalUnits !== undefined && data.totalUnits !== null) {
                bldData.unitsCount = Number(data.totalUnits);
            }
            if (Object.keys(bldData).length > 0) {
                await database_1.default.building.updateMany({
                    where: { propertyId: id },
                    data: bldData,
                });
            }
        }
        catch (bldErr) {
            console.error('Failed to auto-update building for property:', bldErr);
        }
        return updatedProp;
    }
    async deleteProperty(id, companyId, permanent = false) {
        const where = { id };
        if (companyId)
            where.companyId = companyId;
        const prop = await database_1.default.property.findFirst({ where });
        if (!prop) {
            throw new appError_1.AppError('Property not found', 404, 'NOT_FOUND');
        }
        if (!permanent) {
            // Soft-delete: update status to Deleted without removing database records
            return await database_1.default.property.update({
                where: { id },
                data: { status: 'Deleted' },
            });
        }
        // Permanent delete
        return await database_1.default.$transaction(async (tx) => {
            await tx.rentPayment.deleteMany({ where: { propertyId: id } });
            await tx.lease.deleteMany({ where: { propertyId: id } });
            await tx.workOrder.deleteMany({ where: { propertyId: id } });
            await tx.unit.deleteMany({ where: { propertyId: id } });
            await tx.building.deleteMany({ where: { propertyId: id } });
            return await tx.property.delete({ where: { id } });
        });
    }
}
exports.PropertyService = PropertyService;
exports.propertyService = new PropertyService();
