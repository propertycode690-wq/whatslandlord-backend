import { Router } from 'express';
import { aiGuideController } from '../controllers/aiGuide.controller';

const router = Router();

// Public/Authenticated access to get page guides
router.get('/content/:pageKey', (req, res) => aiGuideController.getGuideContent(req, res));

// Live OpenAI TTS Audio streaming endpoint
router.post('/speech', (req, res) => aiGuideController.streamVoiceSpeech(req, res));

export default router;

