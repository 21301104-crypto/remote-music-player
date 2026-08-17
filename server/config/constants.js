// server/config/constants.js
import path from 'path';

export const PORT = 3000;
export const MUSIC_DIR = '/storage/9C33-6BBD/Music';
export const DATA_DIR = path.resolve('data');
export const DB_PATH = path.join(DATA_DIR, 'music.db');
export const MPV_SOCKET = path.resolve('mpv.sock');

export const SUPPORTED_EXTENSIONS = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg'];

export const DEFAULT_EQ = {
  enabled: true,
  preset: 'bass_boost',
  bands: [
    { freq: 31.5, label: '31.5', gain: 3.5 },
    { freq: 63, label: '63', gain: 5.0 },
    { freq: 125, label: '125', gain: 3.5 },
    { freq: 250, label: '250', gain: 1.0 },
    { freq: 500, label: '500', gain: -0.5 },
    { freq: 1000, label: '1k', gain: 0.0 },
    { freq: 2000, label: '2k', gain: 0.5 },
    { freq: 4000, label: '4k', gain: 1.0 },
    { freq: 8000, label: '8k', gain: 1.5 },
    { freq: 16000, label: '16k', gain: 2.0 }
  ]
};