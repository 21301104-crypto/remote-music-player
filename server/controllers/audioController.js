// server/controllers/audioController.js
import path from 'path';
import * as musicMetadata from 'music-metadata';
import { MUSIC_DIR } from '../config/constants.js';
import { dbService } from '../services/dbService.js';
import { fetchLyricsFromLRCLIB } from '../services/lyricsService.js';
import { playbackService } from '../services/playbackService.js';

export const getCover = async (req, res) => {
  const relativePath = req.query.path;
  if (!relativePath) return res.status(400).send('Falta ruta');

  const absolutePath = path.join(MUSIC_DIR, relativePath);
  try {
    const metadata = await musicMetadata.parseFile(absolutePath);
    const picture = metadata.common.picture?.[0];
    if (picture && picture.data) {
      let mime = picture.format || 'image/jpeg';
      if (!mime.includes('/')) mime = `image/${mime === 'jpg' ? 'jpeg' : mime}`;
      res.set('Content-Type', mime);
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(picture.data);
    }
  } catch (e) {}
  res.status(404).send('Sin carátula');
};

export const getLyrics = async (req, res) => {
  const relativePath = req.query.path;
  if (!relativePath) return res.status(400).json({ error: 'Falta parámetro path' });

  let lyrics = dbService.getLyrics(relativePath);

  if (!lyrics) {
    const trackObj = dbService.getTrackByPath(relativePath);
    if (trackObj) {
      const fetched = await fetchLyricsFromLRCLIB(trackObj);
      if (fetched) {
        dbService.saveLyrics(relativePath, fetched.plainLyrics, fetched.syncedLyrics);
        lyrics = fetched;
      }
    }
  }

  res.json({
    trackPath: relativePath,
    plainLyrics: lyrics?.plain_lyrics || lyrics?.plainLyrics || null,
    syncedLyrics: lyrics?.synced_lyrics || lyrics?.syncedLyrics || null
  });
};

export const getLibrary = (req, res) => {
  res.json(playbackService.getState());
};

export const searchTracks = (req, res) => {
  const query = req.query.q || '';
  const results = dbService.searchTracks(query);
  res.json(results);
};