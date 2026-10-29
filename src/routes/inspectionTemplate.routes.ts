import { Router } from 'express';
import { inspectionTemplateController } from '../controllers/inspectionTemplate.controller';

const router = Router();

router.get('/', (req, res, next) => inspectionTemplateController.getAll(req, res, next));
router.get('/:id', (req, res, next) => inspectionTemplateController.getById(req, res, next));
router.post('/', (req, res, next) => inspectionTemplateController.create(req, res, next));
router.put('/:id', (req, res, next) => inspectionTemplateController.update(req, res, next));
router.delete('/:id', (req, res, next) => inspectionTemplateController.delete(req, res, next));
router.put('/:id/active', (req, res, next) => inspectionTemplateController.toggleActive(req, res, next));
router.post('/:id/duplicate', (req, res, next) => inspectionTemplateController.duplicate(req, res, next));
router.post('/rooms/:id/duplicate', (req, res, next) => inspectionTemplateController.duplicateRoom(req, res, next));

export default router;
