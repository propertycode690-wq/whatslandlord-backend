"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildingController = exports.BuildingController = void 0;
const database_1 = __importDefault(require("../config/database"));
const apiResponse_1 = require("../utils/apiResponse");
class BuildingController {
    async getAll(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const buildings = await database_1.default.building.findMany({
                where: {
                    property: {
                        status: { notIn: ['Inactive', 'Deleted'] },
                        ...(companyId ? { companyId } : {}),
                    },
                },
                include: {
                    property: true,
                    units: true,
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: buildings });
        }
        catch (error) {
            next(error);
        }
    }
    async create(req, res, next) {
        try {
            const { propertyId, name, floors, unitsCount, occupancyRate } = req.body;
            const companyId = req.user?.companyId;
            if (companyId) {
                const check = await database_1.default.property.findFirst({
                    where: { id: propertyId, companyId },
                });
                if (!check)
                    throw new Error('Unauthorized property reference.');
            }
            const building = await database_1.default.building.create({
                data: {
                    propertyId,
                    name,
                    floors: parseInt(floors || '1'),
                    unitsCount: parseInt(unitsCount || '0'),
                    occupancyRate: parseFloat(occupancyRate || '0'),
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: building });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const { propertyId, name, floors, unitsCount, occupancyRate } = req.body;
            const id = req.params.id;
            const companyId = req.user?.companyId;
            if (companyId) {
                const check = await database_1.default.building.findFirst({
                    where: {
                        id,
                        property: { companyId },
                    },
                });
                if (!check)
                    throw new Error('Building not found.');
            }
            const building = await database_1.default.building.update({
                where: { id },
                data: {
                    propertyId,
                    name,
                    floors: floors !== undefined ? parseInt(floors) : undefined,
                    unitsCount: unitsCount !== undefined ? parseInt(unitsCount) : undefined,
                    occupancyRate: occupancyRate !== undefined ? parseFloat(occupancyRate) : undefined,
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: building });
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
                const check = await database_1.default.building.findFirst({
                    where: {
                        id,
                        property: { companyId },
                    },
                });
                if (!check)
                    throw new Error('Building not found.');
            }
            await database_1.default.building.delete({
                where: { id },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: { success: true } });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.BuildingController = BuildingController;
exports.buildingController = new BuildingController();
