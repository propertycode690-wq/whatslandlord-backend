import { Response, NextFunction } from 'express';
import { propertyService } from '../services/property.service';
import { sendSuccess } from '../utils/apiResponse';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class PropertyController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      console.log('DEBUG properties: req.user =', req.user);
      const companyId = req.user?.companyId;
      const properties = await propertyService.getAllProperties(companyId, req.user);
      return sendSuccess({ res, data: properties });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const companyId = req.user?.companyId;
      const property = await propertyService.getPropertyById(id, companyId);
      return sendSuccess({ res, data: property });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const file = req.file;
      const newProp = await propertyService.createProperty({ ...req.body, companyId }, file);
      return sendSuccess({ res, statusCode: 201, data: newProp });
    } catch (error) {
      next(error);
    }
  }

  async bulkImport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const properties = Array.isArray(req.body) ? req.body : (req.body?.properties || []);
      const result = await propertyService.bulkImportProperties(properties, companyId);
      return sendSuccess({
        res,
        statusCode: 201,
        message: `Successfully imported ${result.count} properties`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const companyId = req.user?.companyId;
      const permanent = req.query.permanent === 'true' || req.body?.permanent === true;
      await propertyService.deleteProperty(id, companyId, permanent);
      return sendSuccess({ res, message: permanent ? 'Property permanently deleted successfully' : 'Property deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const companyId = req.user?.companyId;
      const file = req.file;
      const updated = await propertyService.updateProperty(id, req.body, file, companyId);
      return sendSuccess({ res, data: updated });
    } catch (error) {
      next(error);
    }
  }
}

export const propertyController = new PropertyController();
