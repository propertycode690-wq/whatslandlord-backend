import { Router } from 'express';
import { inspectionController } from '../controllers/inspection.controller';
import { upload } from '../middlewares/upload.middleware';

const router = Router();

router.get('/', (req, res, next) => inspectionController.getAll(req, res, next));
router.post('/', (req, res, next) => inspectionController.create(req, res, next));
router.delete('/:id', (req, res, next) => inspectionController.remove(req, res, next));
router.get('/inspectors', (req, res, next) => inspectionController.getInspectors(req, res, next));
router.get('/:id', (req, res, next) => inspectionController.getById(req, res, next));
router.put('/:id', (req, res, next) => inspectionController.update(req, res, next));
router.post('/items/:itemId/photos', upload.single('photo'), (req, res, next) => inspectionController.uploadPhoto(req, res, next));
router.post('/:id/complete', (req, res, next) => inspectionController.complete(req, res, next));
router.post('/:id/reopen', (req, res, next) => inspectionController.reopen(req, res, next));

export default router;
