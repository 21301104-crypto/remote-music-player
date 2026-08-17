// server/index.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { exec, spawn } from 'child_process';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import net from 'net';
import multer from 'multer';
import * as musicMetadata from 'music-metadata';
import { dbService } from './database.js';
import { fetchLyricsFromLRCLIB, startBulkLyricsSync } from './lyricsService.js';

// =========================================================================
// 1. INICIALIZACIÓN DE SERVIDOR EXPRESS Y SOCKET.IO
// =========================================================================
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e8
});

app.use(cors());
app.use(express.json());
app.use(express.static('dist'));

// =========================================================================
// 2. CONSTANTES DE HARDWARE Y RUTAS
// =========================================================================
const MUSIC_DIR = '/storage/9C33-6BBD/Music';
const MPV_SOCKET = path.resolve('mpv.sock');
const SUPPORTED_EXTENSIONS = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg'];

// =========================================================================
// 3. ESTADO GLOBAL EN MEMORIA (DECLARACIÓN TEMPRANA PARA EVITAR TDZ)
// =========================================================================
let mpvProcess = null;
let mpvSocketClient = null;
let isMpvReady = false;

let masterLibrary = [];
let activeQueue = [];
let currentIndex = 0;
let isShuffle = false;
let repeatMode = 'all'; // 'off' | 'all' | 'one'
let currentFilterMode = 'all';
let selectedArtist = null;
let selectedGenre = null;
let selectedPlaylistId = null;
let currentVolume = 10;
let isPlaying = false;

let playStartTime = 0;
let elapsedOffset = 0;

let currentTrackData = {
  path: null,
  title: null,
  artist: null,
  album: null,
  genre: 'Varios',
  duration: 0
};

// Control de Sleep Timer
let sleepTimerInterval = null;
let sleepTimerEndsAt = 0;
let sleepTimerBaseVolume = 10;
let isFadingOut = false;

// =========================================================================
// 4. CONFIGURACIÓN DEL WEB UPLOADER (MULTER)
// =========================================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MUSIC_DIR),
  filename: (req, file, cb) => {
    const rawOriginal = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const cleanName = rawOriginal.replace(/[/\\?%*:|"<>]/g, '_');
    cb(null, cleanName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (SUPPORTED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Extensión no permitida: ${ext}`), false);
    }
  },
  limits: { fileSize: 250 * 1024 * 1024 } // 250MB límite por archivo
});

// =========================================================================
// 5. MOTOR DSP & ECUALIZADOR PARAMÉTRICO
// =========================================================================
const DEFAULT_EQ = {
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

let eqSettings = dbService.getSetting('eq_settings', DEFAULT_EQ);

const buildEqualizerFilter = (eq) => {
  if (!eq || !eq.enabled || !eq.bands || eq.bands.length === 0) return '';
  const maxGain = Math.max(0, ...eq.bands.map(b => Number(b.gain) || 0));
  const preampDb = maxGain > 0 ? -(maxGain * 0.85).toFixed(1) : 0;
  const eqFilters = eq.bands.map(b => `equalizer=f=${b.freq}:width_type=o:w=1.2:g=${b.gain}`);
  return `lavfi=[volume=${preampDb}dB,${eqFilters.join(',')},alimiter=level_in=1:level_out=0.98:limit=0.98:attack=5:release=50]`;
};

// =========================================================================
// 6. CONTROL DEL MOTOR MPV (IPC SOCKET)
// =========================================================================
const sendMpvCommand = (commandArray) => {
  if (!mpvSocketClient || !isMpvReady) return;
  try {
    const payload = JSON.stringify({ command: commandArray }) + '\n';
    mpvSocketClient.write(payload);
  } catch (err) {
    console.error('[MPV IPC Write Error]:', err.message);
  }
};

const applyEqualizerToMpv = () => {
  const afString = buildEqualizerFilter(eqSettings);
  sendMpvCommand(['set_property', 'af', afString]);
};

const startMpvDaemon = () => {
  if (fs.existsSync(MPV_SOCKET)) {
    try { fs.unlinkSync(MPV_SOCKET); } catch (e) {}
  }

  console.log('🚀 Iniciando proceso mpv en modo headless...');
  mpvProcess = spawn('mpv', [
    '--idle=yes',
    '--no-video',
    `--input-ipc-server=${MPV_SOCKET}`,
    '--audio-buffer=0.2',
    '--gapless-audio=yes'
  ], { stdio: 'ignore' });

  mpvProcess.on('exit', () => {
    isMpvReady = false;
    setTimeout(startMpvDaemon, 1000);
  });

  const connectSocket = () => {
    if (!fs.existsSync(MPV_SOCKET)) {
      setTimeout(connectSocket, 200);
      return;
    }

    mpvSocketClient = net.connect(MPV_SOCKET, () => {
      console.log('✅ Conexión IPC establecida con mpv.');
      isMpvReady = true;
      applyEqualizerToMpv();
    });

    mpvSocketClient.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.event === 'end-file' && msg.reason === 'eof') {
            nextTrack(false);
          }
        } catch (e) {}
      }
    });

    mpvSocketClient.on('error', () => {
      isMpvReady = false;
      setTimeout(connectSocket, 500);
    });
  };

  setTimeout(connectSocket, 300);
};

startMpvDaemon();

const cleanupProcesses = () => {
  if (mpvProcess) {
    try { mpvProcess.kill('SIGTERM'); } catch (e) {}
  }
  if (fs.existsSync(MPV_SOCKET)) {
    try { fs.unlinkSync(MPV_SOCKET); } catch (e) {}
  }
};

process.on('exit', cleanupProcesses);
process.on('SIGINT', () => { cleanupProcesses(); process.exit(0); });
process.on('SIGTERM', () => { cleanupProcesses(); process.exit(0); });

// =========================================================================
// 7. NORMALIZACIÓN & PARSEO ID3
// =========================================================================
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

const scanMusicDirectory = (dirPath, arrayOfFiles = []) => {
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

const quickParseTrack = (relativePath) => {
  const rawName = path.basename(relativePath, path.extname(relativePath));
  const folderParts = path.dirname(relativePath).split(path.sep).filter(p => p && p !== '.');
  let artist = folderParts.length > 0 ? folderParts[0] : 'Varios';
  if (isNumeric(artist)) artist = 'Varios';

  let title = rawName.replace(/^\d+[\s\.\-_]+/, '').trim();
  const parts = rawName.split(/\s*-\s*/);
  if (parts.length > 1 && !isNumeric(parts[0])) {
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').replace(/^\d+[\s\.\-_]+/, '').trim();
  }

  return {
    path: relativePath,
    title: title || rawName,
    artist: artist || 'Varios',
    album: folderParts[1] || 'MicroSD Audio',
    genre: 'Varios',
    year: null,
    duration: 0
  };
};

const parseTrackID3 = async (relativePath) => {
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

    artist = (artist || fallbackArtist).trim();
    title = (title || rawName).trim();
    if (isNumeric(artist)) artist = fallbackArtist;

    return {
      path: relativePath,
      title: title || rawName,
      artist: artist || 'Varios',
      album: album && album.trim() ? album.trim() : (folderParts[1] || 'MicroSD Audio'),
      genre: normalizeGenre(genre?.[0]),
      year: year || null,
      duration
    };
  } catch (err) {
    const cleanedFileName = rawName.replace(/^\d+[\s\.\-_]+/, '');
    return {
      path: relativePath,
      title: cleanedFileName || rawName,
      artist: fallbackArtist,
      album: folderParts[1] || 'MicroSD Audio',
      genre: 'Varios',
      year: null,
      duration: 0
    };
  }
};

// =========================================================================
// 8. SLEEP TIMER & RECONSTRUCCIÓN DE COLAS
// =========================================================================
const getSleepTimerState = () => {
  if (!sleepTimerEndsAt || sleepTimerEndsAt <= Date.now()) return { active: false, remainingSeconds: 0 };
  return {
    active: true,
    remainingSeconds: Math.max(0, Math.ceil((sleepTimerEndsAt - Date.now()) / 1000)),
    endsAt: sleepTimerEndsAt
  };
};

const startSleepTimer = (minutes) => {
  cancelSleepTimer(false);
  if (!minutes || minutes <= 0) return;
  sleepTimerBaseVolume = currentVolume;
  sleepTimerEndsAt = Date.now() + (minutes * 60 * 1000);
  isFadingOut = false;

  sleepTimerInterval = setInterval(() => {
    const remainingSecs = Math.ceil((sleepTimerEndsAt - Date.now()) / 1000);
    if (remainingSecs <= 60 && remainingSecs > 0) {
      isFadingOut = true;
      const ratio = remainingSecs / 60;
      const targetVol = Math.max(0, Math.round(sleepTimerBaseVolume * ratio));
      if (targetVol !== currentVolume) {
        currentVolume = targetVol;
        exec(`termux-volume music ${currentVolume}`);
      }
    } else if (remainingSecs <= 0) {
      clearInterval(sleepTimerInterval);
      sleepTimerInterval = null;
      sleepTimerEndsAt = 0;
      isFadingOut = false;
      sendMpvCommand(['set_property', 'pause', true]);
      isPlaying = false;
      currentVolume = sleepTimerBaseVolume;
      exec(`termux-volume music ${currentVolume}`);
      broadcastState();
      return;
    }
    broadcastState();
  }, 1000);

  broadcastState();
};

const cancelSleepTimer = (restoreVolume = true) => {
  if (sleepTimerInterval) {
    clearInterval(sleepTimerInterval);
    sleepTimerInterval = null;
  }
  if (restoreVolume && isFadingOut) {
    currentVolume = sleepTimerBaseVolume;
    exec(`termux-volume music ${currentVolume}`);
  }
  sleepTimerEndsAt = 0;
  isFadingOut = false;
  broadcastState();
};

const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const rebuildQueue = (startPath = null) => {
  let list = [];
  const favorites = dbService.getFavorites();

  if (currentFilterMode === 'favorites') {
    list = masterLibrary.filter(t => favorites.includes(t.path));
  } else if (currentFilterMode === 'artist' && selectedArtist) {
    list = masterLibrary.filter(t => t.artist === selectedArtist);
  } else if (currentFilterMode === 'genre' && selectedGenre) {
    list = masterLibrary.filter(t => t.genre === selectedGenre);
  } else if (currentFilterMode === 'playlist' && selectedPlaylistId) {
    const playlists = dbService.getPlaylists();
    const pl = playlists.find(p => p.id === selectedPlaylistId);
    if (pl && pl.tracks) {
      list = pl.tracks.map(p => masterLibrary.find(t => t.path === p)).filter(Boolean);
    } else {
      list = [...masterLibrary];
    }
  } else {
    list = [...masterLibrary];
  }

  if (isShuffle) list = shuffleArray(list);
  activeQueue = list;

  if (startPath) {
    const idx = activeQueue.findIndex(t => t.path === startPath);
    currentIndex = idx !== -1 ? idx : 0;
  } else {
    currentIndex = 0;
  }
};

const broadcastState = () => {
  io.emit('state_changed', {
    isPlaying,
    isShuffle,
    repeatMode,
    currentFilterMode,
    selectedArtist,
    selectedGenre,
    selectedPlaylistId,
    currentVolume,
    currentTrack: currentTrackData,
    queue: activeQueue,
    masterLibrary,
    favorites: dbService.getFavorites(),
    playlists: dbService.getPlaylists(),
    eqSettings,
    playStartTime,
    elapsedOffset,
    sleepTimer: getSleepTimerState()
  });
};

// =========================================================================
// 9. INICIALIZACIÓN DE LA BIBLIOTECA (SQLITE CORE)
// =========================================================================
const initLibrary = async () => {
  const diskFiles = scanMusicDirectory(MUSIC_DIR);
  const dbCount = dbService.getTracksCount();

  if (dbCount === diskFiles.length && diskFiles.length > 0) {
    masterLibrary = dbService.getAllTracks();
    rebuildQueue();
    broadcastState();
    console.log(`⚡ [SQLite Core] ${masterLibrary.length} pistas cargadas desde SQLite en 2ms.`);
    return;
  }

  console.log(`⏳ [SQLite Sync] Sincronizando ${diskFiles.length} archivos con la base de datos...`);
  masterLibrary = diskFiles.map(file => dbService.getTrackByPath(file) || quickParseTrack(file));
  rebuildQueue();
  broadcastState();

  const enrichedList = [];
  const BATCH_SIZE = 30;
  for (let i = 0; i < diskFiles.length; i += BATCH_SIZE) {
    const batch = diskFiles.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(file => parseTrackID3(file)));
    enrichedList.push(...batchResults);
  }

  dbService.saveTracksBatch(enrichedList);
  masterLibrary = dbService.getAllTracks();
  rebuildQueue();
  broadcastState();
  console.log(`✅ [SQLite Sync Completo] ${masterLibrary.length} pistas guardadas e indexadas en SQLite.`);
};

initLibrary();

// =========================================================================
// 10. REPRODUCCIÓN Y TRANSPORTE DE AUDIO
// =========================================================================
const playCurrentTrack = async () => {
  if (!activeQueue.length) return;
  if (currentIndex < 0 || currentIndex >= activeQueue.length) currentIndex = 0;

  const track = activeQueue[currentIndex];
  const absolutePath = path.join(MUSIC_DIR, track.path);
  const meta = dbService.getTrackByPath(track.path) || (await parseTrackID3(track.path));
  currentTrackData = meta;
  elapsedOffset = 0;

  sendMpvCommand(['loadfile', absolutePath, 'replace']);
  applyEqualizerToMpv();

  isPlaying = true;
  playStartTime = Date.now();
  broadcastState();
};

const nextTrack = (isManual = false) => {
  if (!activeQueue.length) return;
  if (!isManual && repeatMode === 'one') {
    playCurrentTrack();
    return;
  }
  if (!isManual && repeatMode === 'off' && currentIndex === activeQueue.length - 1) {
    sendMpvCommand(['set_property', 'pause', true]);
    isPlaying = false;
    broadcastState();
    return;
  }
  currentIndex = (currentIndex + 1) % activeQueue.length;
  playCurrentTrack();
};

const prevTrack = () => {
  if (!activeQueue.length) return;
  currentIndex = (currentIndex - 1 + activeQueue.length) % activeQueue.length;
  playCurrentTrack();
};

// =========================================================================
// 11. ENDPOINTS REST API
// =========================================================================
app.get('/api/cover', async (req, res) => {
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
});

app.get('/api/lyrics', async (req, res) => {
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
});

app.post('/api/upload', upload.array('audioFiles', 100), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    console.log(`📥 [Upload] Procesando ${req.files.length} archivo(s)...`);
    const newTracks = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const relPath = path.relative(MUSIC_DIR, file.path);
      const parsedMeta = await parseTrackID3(relPath);
      newTracks.push(parsedMeta);
    }

    dbService.saveTracksBatch(newTracks);
    masterLibrary = dbService.getAllTracks();
    rebuildQueue();
    broadcastState();

    res.json({
      success: true,
      message: `${req.files.length} archivo(s) guardados en SQLite con éxito`,
      uploadedCount: req.files.length
    });
  } catch (err) {
    console.error('❌ [Upload Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/library', (req, res) => {
  res.json({
    masterLibrary,
    activeQueue,
    favorites: dbService.getFavorites(),
    playlists: dbService.getPlaylists(),
    currentTrack: currentTrackData,
    isPlaying,
    repeatMode,
    eqSettings,
    playStartTime,
    elapsedOffset,
    sleepTimer: getSleepTimerState()
  });
});

// =========================================================================
// 12. WEBSOCKETS (SOCKET.IO - CANAL DE COMUNICACIÓN EN VIVO)
// =========================================================================
io.on('connection', (socket) => {
  socket.emit('state_changed', {
    isPlaying,
    isShuffle,
    repeatMode,
    currentFilterMode,
    selectedArtist,
    selectedGenre,
    selectedPlaylistId,
    currentVolume,
    currentTrack: currentTrackData,
    queue: activeQueue,
    masterLibrary,
    favorites: dbService.getFavorites(),
    playlists: dbService.getPlaylists(),
    eqSettings,
    playStartTime,
    elapsedOffset,
    sleepTimer: getSleepTimerState()
  });

  socket.on('play_track', (targetPath) => {
    const idx = activeQueue.findIndex(t => t.path === targetPath);
    if (idx !== -1) {
      currentIndex = idx;
    } else {
      rebuildQueue(targetPath);
    }
    playCurrentTrack();
  });

  socket.on('play_next', (targetPath) => {
    const trackObj = masterLibrary.find(t => t.path === targetPath);
    if (!trackObj) return;

    if (activeQueue.length === 0) {
      activeQueue = [trackObj];
      currentIndex = 0;
    } else {
      const futureIdx = activeQueue.findIndex((t, idx) => t.path === targetPath && idx > currentIndex);
      if (futureIdx !== -1) {
        activeQueue.splice(futureIdx, 1);
      }
      activeQueue.splice(currentIndex + 1, 0, trackObj);
    }
    broadcastState();
  });

  socket.on('toggle_play', () => {
    if (isPlaying) {
      elapsedOffset += (Date.now() - playStartTime) / 1000;
      sendMpvCommand(['set_property', 'pause', true]);
      isPlaying = false;
      broadcastState();
    } else {
      if (currentTrackData.path) {
        sendMpvCommand(['set_property', 'pause', false]);
        isPlaying = true;
        playStartTime = Date.now();
        broadcastState();
      } else {
        playCurrentTrack();
      }
    }
  });

  socket.on('seek_audio', (seconds) => {
    const targetSec = Math.max(0, Math.min(parseFloat(seconds) || 0, currentTrackData.duration || 9999));
    sendMpvCommand(['seek', targetSec, 'absolute']);
    elapsedOffset = targetSec;
    playStartTime = Date.now();
    broadcastState();
  });

  socket.on('next', () => nextTrack(true));
  socket.on('prev', prevTrack);

  socket.on('toggle_shuffle', () => {
    isShuffle = !isShuffle;
    rebuildQueue(currentTrackData.path);
    broadcastState();
  });

  socket.on('toggle_repeat', () => {
    if (repeatMode === 'all') repeatMode = 'one';
    else if (repeatMode === 'one') repeatMode = 'off';
    else repeatMode = 'all';
    broadcastState();
  });

  socket.on('set_eq', (newEq) => {
    eqSettings = newEq;
    dbService.setSetting('eq_settings', eqSettings);
    applyEqualizerToMpv();
    broadcastState();
  });

  socket.on('set_filter', ({ mode, artist, genre, playlistId }) => {
    currentFilterMode = mode;
    selectedArtist = artist || null;
    selectedGenre = genre || null;
    selectedPlaylistId = playlistId || null;
    rebuildQueue();
    broadcastState();
  });

  socket.on('toggle_favorite', (trackPath) => {
    dbService.toggleFavorite(trackPath);
    if (currentFilterMode === 'favorites') {
      rebuildQueue(currentTrackData.path);
    }
    broadcastState();
  });

  socket.on('create_playlist', (name) => {
    if (!name || !name.trim()) return;
    const plId = `pl_${Date.now()}`;
    dbService.createPlaylist(plId, name.trim(), Date.now());
    broadcastState();
  });

  socket.on('delete_playlist', (playlistId) => {
    dbService.deletePlaylist(playlistId);
    if (currentFilterMode === 'playlist' && selectedPlaylistId === playlistId) {
      currentFilterMode = 'all';
      selectedPlaylistId = null;
      rebuildQueue();
    }
    broadcastState();
  });

  socket.on('add_to_playlist', ({ playlistId, trackPath }) => {
    dbService.addTrackToPlaylist(playlistId, trackPath);
    if (currentFilterMode === 'playlist' && selectedPlaylistId === playlistId) {
      rebuildQueue(currentTrackData.path);
    }
    broadcastState();
  });

  socket.on('set_volume', (level) => {
    currentVolume = Math.min(Math.max(parseInt(level, 10) || 0, 0), 15);
    if (!isFadingOut) sleepTimerBaseVolume = currentVolume;
    exec(`termux-volume music ${currentVolume}`, (err) => {
      if (!err) broadcastState();
    });
  });

  socket.on('set_sleep_timer', (minutes) => startSleepTimer(minutes));
  socket.on('cancel_sleep_timer', () => cancelSleepTimer(true));

  // --- LETRAS SINCRONIZADAS ---
  socket.on('get_lyrics', async (trackPath) => {
    if (!trackPath) return;

    let lyrics = dbService.getLyrics(trackPath);

    if (!lyrics) {
      const trackObj = dbService.getTrackByPath(trackPath);
      if (trackObj) {
        const fetched = await fetchLyricsFromLRCLIB(trackObj);
        if (fetched) {
          dbService.saveLyrics(trackPath, fetched.plainLyrics, fetched.syncedLyrics);
          lyrics = fetched;
        }
      }
    }

    socket.emit('lyrics_data', {
      trackPath,
      plainLyrics: lyrics?.plain_lyrics || lyrics?.plainLyrics || null,
      syncedLyrics: lyrics?.synced_lyrics || lyrics?.syncedLyrics || null
    });
  });

  socket.on('start_bulk_lyrics_sync', () => {
    startBulkLyricsSync(io);
  });
});

// =========================================================================
// 13. ARRANQUE DEL SERVIDOR
// =========================================================================
const PORT = 3000;
httpServer.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor DAP Full-Stack activo en puerto ${PORT}`));