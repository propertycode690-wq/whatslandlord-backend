import { Router } from 'express';
import { propertyController } from '../controllers/property.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { rbacGuard } from '../middlewares/rbac.middleware';
import { upload } from '../middlewares/upload.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { createPropertySchema, updatePropertySchema } from '../validations/property.validation';

const router = Router();

router.get('/', (req, res, next) => propertyController.getAll(req, res, next));
router.post('/bulk-import', (req, res, next) => propertyController.bulkImport(req, res, next));
router.get('/:id', (req, res, next) => propertyController.getById(req, res, next));
router.post('/', upload.single('image'), validateRequest(createPropertySchema), (req, res, next) => propertyController.create(req, res, next));
router.put('/:id', upload.single('image'), validateRequest(updatePropertySchema), (req, res, next) => propertyController.update(req, res, next));
router.delete('/:id', (req, res, next) => propertyController.delete(req, res, next));

export default router;
