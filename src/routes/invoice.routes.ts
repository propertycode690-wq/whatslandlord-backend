import { Router } from 'express';
import { invoiceController } from '../controllers/invoice.controller';

const router = Router();

router.get('/', (req, res, next) => invoiceController.getAll(req, res, next));
router.post('/', (req, res, next) => invoiceController.create(req, res, next));
router.put('/:id', (req, res, next) => invoiceController.update(req, res, next));
router.delete('/:id', (req, res, next) => invoiceController.remove(req, res, next));
router.post('/:id/ai-reminder', (req, res, next) => invoiceController.generateAiReminder(req, res, next));

export default router;
