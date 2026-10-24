"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.propertyController = exports.PropertyController = void 0;
const property_service_1 = require("../services/property.service");
const apiResponse_1 = require("../utils/apiResponse");
class PropertyController {
    async getAll(req, res, next) {
        try {
            console.log('DEBUG properties: req.user =', req.user);
            const companyId = req.user?.companyId;
            const properties = await property_service_1.propertyService.getAllProperties(companyId, req.user);
            return (0, apiResponse_1.sendSuccess)({ res, data: properties });
        }
        catch (error) {
            next(error);
        }
    }
    async getById(req, res, next) {
        try {
            const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const companyId = req.user?.companyId;
            const property = await property_service_1.propertyService.getPropertyById(id, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: property });
        }
        catch (error) {
            next(error);
        }
    }
    async create(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const file = req.file;
            const newProp = await property_service_1.propertyService.createProperty({ ...req.body, companyId }, file);
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: newProp });
        }
        catch (error) {
            next(error);
        }
    }
    async bulkImport(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const properties = Array.isArray(req.body) ? req.body : (req.body?.properties || []);
            const result = await property_service_1.propertyService.bulkImportProperties(properties, companyId);
            return (0, apiResponse_1.sendSuccess)({
                res,
                statusCode: 201,
                message: `Successfully imported ${result.count} properties`,
                data: result,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async delete(req, res, next) {
        try {
            const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const companyId = req.user?.companyId;
            const permanent = req.query.permanent === 'true' || req.body?.permanent === true;
            await property_service_1.propertyService.deleteProperty(id, companyId, permanent);
            return (0, apiResponse_1.sendSuccess)({ res, message: permanent ? 'Property permanently deleted successfully' : 'Property deleted successfully' });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const companyId = req.user?.companyId;
            const file = req.file;
            const updated = await property_service_1.propertyService.updateProperty(id, req.body, file, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: updated });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.PropertyController = PropertyController;
exports.propertyController = new PropertyController();
