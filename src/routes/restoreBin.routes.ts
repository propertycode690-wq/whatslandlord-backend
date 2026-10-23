import { Router } from 'express';
import { restoreBinController } from '../controllers/restoreBin.controller';

const router = Router();

router.get('/', (req, res, next) => restoreBinController.getAll(req, res, next));
router.post('/', (req, res, next) => restoreBinController.softDelete(req, res, next));
router.post('/:id/restore', (req, res, next) => restoreBinController.restore(req, res, next));
router.delete('/actions/empty', (req, res, next) => restoreBinController.emptyBin(req, res, next));
router.delete('/:id', (req, res, next) => restoreBinController.permanentDelete(req, res, next));

export default router;
