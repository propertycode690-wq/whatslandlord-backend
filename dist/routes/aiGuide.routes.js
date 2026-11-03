"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const aiGuide_controller_1 = require("../controllers/aiGuide.controller");
const router = (0, express_1.Router)();
// Public/Authenticated access to get page guides
router.get('/content/:pageKey', (req, res) => aiGuide_controller_1.aiGuideController.getGuideContent(req, res));
// Live OpenAI TTS Audio streaming endpoint
router.post('/speech', (req, res) => aiGuide_controller_1.aiGuideController.streamVoiceSpeech(req, res));
exports.default = router;
