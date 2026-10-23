import { Response, NextFunction } from 'express';
import prisma from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class BuildingController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const buildings = await prisma.building.findMany({
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
      return sendSuccess({ res, data: buildings });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId, name, floors, unitsCount, occupancyRate } = req.body;
      const companyId = req.user?.companyId;

      if (companyId) {
        const check = await prisma.property.findFirst({
          where: { id: propertyId, companyId },
        });
        if (!check) throw new Error('Unauthorized property reference.');
      }

      const building = await prisma.building.create({
        data: {
          propertyId,
          name,
          floors: parseInt(floors || '1'),
          unitsCount: parseInt(unitsCount || '0'),
          occupancyRate: parseFloat(occupancyRate || '0'),
        },
      });
      return sendSuccess({ res, statusCode: 201, data: building });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId, name, floors, unitsCount, occupancyRate } = req.body;
      const id = req.params.id as string;
      const companyId = req.user?.companyId;

      if (companyId) {
        const check = await prisma.building.findFirst({
          where: {
            id,
            property: { companyId },
          },
        });
        if (!check) throw new Error('Building not found.');
      }

      const building = await prisma.building.update({
        where: { id },
        data: {
          propertyId,
          name,
          floors: floors !== undefined ? parseInt(floors) : undefined,
          unitsCount: unitsCount !== undefined ? parseInt(unitsCount) : undefined,
          occupancyRate: occupancyRate !== undefined ? parseFloat(occupancyRate) : undefined,
        },
      });
      return sendSuccess({ res, data: building });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const companyId = req.user?.companyId;

      if (companyId) {
        const check = await prisma.building.findFirst({
          where: {
            id,
            property: { companyId },
          },
        });
        if (!check) throw new Error('Building not found.');
      }

      await prisma.building.delete({
        where: { id },
      });
      return sendSuccess({ res, data: { success: true } });
    } catch (error) {
      next(error);
    }
  }
}

export const buildingController = new BuildingController();
