import { Router } from 'express';
import { unitController } from '../controllers/unit.controller';
import { validateRequest } from '../middlewares/validate.middleware';
import { createUnitSchema, updateUnitSchema } from '../validations/unit.validation';

const router = Router();

router.post('/bulk-import', (req, res, next) => unitController.bulkImport(req, res, next));
router.get('/', (req, res, next) => unitController.getAll(req, res, next));
router.get('/:id', (req, res, next) => unitController.getById(req, res, next));
router.post('/', validateRequest(createUnitSchema), (req, res, next) => unitController.create(req, res, next));
router.put('/:id', validateRequest(updateUnitSchema), (req, res, next) => unitController.update(req, res, next));
router.delete('/:id', (req, res, next) => unitController.delete(req, res, next));
router.post('/:id/assign-tenant', (req, res, next) => unitController.assignTenant(req, res, next));

export default router;
