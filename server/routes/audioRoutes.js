// server/routes/audioRoutes.js
import { Router } from 'express';
import { getCover, getLyrics, getLibrary, searchTracks } from '../controllers/audioController.js';

const router = Router();

router.get('/cover', getCover);
router.get('/lyrics', getLyrics);
router.get('/library', getLibrary);
router.get('/search', searchTracks);

export default router;