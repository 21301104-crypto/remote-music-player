// server/routes/index.js
import { Router } from 'express';
import audioRoutes from './audioRoutes.js';
import uploadRoutes from './uploadRoutes.js';

const router = Router();
router.use('/', audioRoutes);
router.use('/', uploadRoutes);

export default router;