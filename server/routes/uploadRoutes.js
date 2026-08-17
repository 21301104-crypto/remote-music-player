// server/routes/uploadRoutes.js
import { Router } from 'express';
import { uploadMiddleware, handleUpload } from '../controllers/uploadController.js';

const router = Router();
router.post('/upload', uploadMiddleware, handleUpload);

export default router;