// server/services/libraryService.js
import fs from 'fs';
import path from 'path';
import * as musicMetadata from 'music-metadata';
import { MUSIC_DIR, SUPPORTED_EXTENSIONS } from '../config/constants.js';
import { dbService } from './dbService.js';

const isNumeric = (str) => typeof str === 'string' && /^\d+$/.test(str.trim());

const normalizeGenre = (rawGenre) => {
  if (!rawGenre || typeof rawGenre !== 'string') return 'Varios';
  if (/[ÐÑ][\x80-\xFF]/.test(rawGenre)) return 'Varios';
  const clean = rawGenre.trim();
  const lower = clean.toLowerCase();

  if (lower.includes('rock') || lower.includes('metal') || lower.includes('punk') || lower.includes('grunge') || lower.includes('alternative')) return 'Rock / Alternativo';
  if (lower.includes('pop') || lower.includes('dance') || lower.includes('disco') || lower.includes('k-pop')) return 'Pop / Dance';
  if (lower.includes('electro') || lower.includes('edm') || lower.includes('techno') || lower.includes('house') || lower.includes('synth')) return 'Electrónica';
  if (lower.includes('latin') || lower.includes('bachata') || lower.includes('salsa') || lower.includes('reggaeton') || lower.includes('cumbia') || lower.includes('bolero') || lower.includes('mariachi')) return 'Latino / Regional';
  if (lower.includes('hip') || lower.includes('rap') || lower.includes('trap') || lower.includes('r&b')) return 'Hip-Hop / Rap';
  if (lower.includes('classic') || lower.includes('soundtrack') || lower.includes('score') || lower.includes('film') || lower.includes('games')) return 'Soundtracks / Clásica';
  if (lower.includes('jazz') || lower.includes('blues') || lower.includes('acoustic') || lower.includes('country') || lower.includes('lo-fi')) return 'Acústico / Jazz';
  if (lower.includes('unknown') || lower === 'other') return 'Varios';

  return clean.length <= 16 ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Varios';
};

export const scanMusicDirectory = (dirPath = MUSIC_DIR, arrayOfFiles = []) => {
  try {
    if (!fs.existsSync(dirPath)) return arrayOfFiles;
    const files = fs.readdirSync(dirPath);

    files.forEach((file) => {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
        arrayOfFiles = scanMusicDirectory(fullPath, arrayOfFiles);
      } else {
        const ext = path.extname(file).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          arrayOfFiles.push(path.relative(MUSIC_DIR, fullPath));
        }
      }
    });
  } catch (error) {
    console.error(`[Error FS] ${dirPath}:`, error.message);
  }
  return arrayOfFiles;
};

export const parseTrackID3 = async (relativePath) => {
  const absolutePath = path.join(MUSIC_DIR, relativePath);
  const rawName = path.basename(relativePath, path.extname(relativePath));
  const folderParts = path.dirname(relativePath).split(path.sep).filter(p => p && p !== '.');
  let fallbackArtist = folderParts.length > 0 ? folderParts[0] : 'Varios';
  if (isNumeric(fallbackArtist)) fallbackArtist = 'Varios';

  try {
    const metadata = await musicMetadata.parseFile(absolutePath, { skipCovers: true });
    let { title, artist, album, year, genre } = metadata.common;
    const duration = Math.round(metadata.format.duration || 0);

    if (!artist || isNumeric(artist) || artist.trim().length === 0) artist = null;
    if (!title || isNumeric(title) || title.trim().length === 0) title = null;

    if (!artist || !title) {
      const cleanedFileName = rawName.replace(/^\d+[\s\.\-_]+/, '');
      const parts = rawName.split(/\s*-\s*/);
      if (!artist) {
        artist = (parts.length > 1 && !isNumeric(parts[0])) ? parts[0].trim() : fallbackArtist;
      }
      if (!title) {
        title = (parts.length > 1) ? parts.slice(1).join(' - ').replace(/^\d+[\s\.\-_]+/, '').trim() : cleanedFileName;
      }
    }

    return {
      path: relativePath,
      title: (title || rawName).trim(),
      artist: (artist || fallbackArtist).trim(),
      album: album && album.trim() ? album.trim() : (folderParts[1] || 'MicroSD Audio'),
      genre: normalizeGenre(genre?.[0]),
      year: year || null,
      duration
    };
  } catch (err) {
    return {
      path: relativePath,
      title: rawName.replace(/^\d+[\s\.\-_]+/, ''),
      artist: fallbackArtist,
      album: folderParts[1] || 'MicroSD Audio',
      genre: 'Varios',
      year: null,
      duration: 0
    };
  }
};