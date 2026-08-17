// server/controllers/uploadController.js
import path from 'path';
import multer from 'multer';
import { MUSIC_DIR, SUPPORTED_EXTENSIONS } from '../config/constants.js';
import { parseTrackID3 } from '../services/libraryService.js';
import { dbService } from '../services/dbService.js';
import { playbackService } from '../services/playbackService.js';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MUSIC_DIR),
  filename: (req, file, cb) => {
    const raw = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, raw.replace(/[/\\?%*:|"<>]/g, '_'));
  }
});

export const uploadMiddleware = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, SUPPORTED_EXTENSIONS.includes(ext));
  },
  limits: { fileSize: 250 * 1024 * 1024 }
}).array('audioFiles', 100);

export const handleUpload = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se recibieron archivos' });
    }

    const newTracks = [];
    for (const file of req.files) {
      const relPath = path.relative(MUSIC_DIR, file.path);
      const parsed = await parseTrackID3(relPath);
      newTracks.push(parsed);
    }

    dbService.saveTracksBatch(newTracks);
    playbackService.masterLibrary = dbService.getAllTracks();
    playbackService.rebuildQueue();
    playbackService.notify();

    res.json({
      success: true,
      message: `${req.files.length} archivo(s) guardados en SQLite con éxito`,
      uploadedCount: req.files.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};