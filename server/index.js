// server/index.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { exec } from 'child_process';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import * as musicMetadata from 'music-metadata';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e8
});

app.use(cors());
app.use(express.json());
app.use(express.static('dist'));

const MUSIC_DIR = '/storage/9C33-6BBD/Music';
const DATA_DIR = path.resolve('data');
const FAVORITES_FILE = path.join(DATA_DIR, 'favorites.json');
const PLAYLISTS_FILE = path.join(DATA_DIR, 'playlists.json');
const SUPPORTED_EXTENSIONS = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg'];

// 1. Persistencia (Favoritos y Playlists)
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const loadJSON = (file, fallback = []) => {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (err) {
    console.error(`[Storage Error] Leyendo ${file}:`, err.message);
  }
  return fallback;
};

const saveJSON = (file, data) => {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`[Storage Error] Guardando ${file}:`, err.message);
  }
};

let favoritesList = loadJSON(FAVORITES_FILE, []);
let playlistsList = loadJSON(PLAYLISTS_FILE, []);

// 2. Normalizador de Géneros
const normalizeAndCleanGenre = (rawGenre, artistName = '', folderPath = '') => {
  if (!rawGenre || typeof rawGenre !== 'string') return 'Varios';
  if (/[ÐÑ][\x80-\xFF]/.test(rawGenre)) return 'Varios';

  const clean = rawGenre.trim();
  const lower = clean.toLowerCase();

  if (lower.includes('rock') || lower.includes('metal') || lower.includes('punk') || lower.includes('grunge') || lower.includes('alternative')) {
    return 'Rock / Alternativo';
  }
  if (lower.includes('pop') || lower.includes('dance') || lower.includes('disco') || lower.includes('k-pop')) {
    return 'Pop / Dance';
  }
  if (lower.includes('electro') || lower.includes('edm') || lower.includes('techno') || lower.includes('house') || lower.includes('synth')) {
    return 'Electrónica';
  }
  if (lower.includes('latin') || lower.includes('bachata') || lower.includes('salsa') || lower.includes('reggaeton') || lower.includes('cumbia') || lower.includes('bolero') || lower.includes('mariachi')) {
    return 'Latino / Regional';
  }
  if (lower.includes('hip') || lower.includes('rap') || lower.includes('trap') || lower.includes('r&b')) {
    return 'Hip-Hop / Rap';
  }
  if (lower.includes('classic') || lower.includes('soundtrack') || lower.includes('score') || lower.includes('film') || lower.includes('games')) {
    return 'Soundtracks / Clásica';
  }
  if (lower.includes('jazz') || lower.includes('blues') || lower.includes('acoustic') || lower.includes('country') || lower.includes('lo-fi')) {
    return 'Acústico / Jazz';
  }
  if (lower.includes('unknown') || lower === 'other' || lower === 'various') {
    return 'Varios';
  }

  return clean.length <= 15 ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Varios';
};

// 3. Escaneo Recursivo
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
          const relativePath = path.relative(MUSIC_DIR, fullPath);
          arrayOfFiles.push(relativePath);
        }
      }
    });
  } catch (error) {
    console.error(`[Error FS] ${dirPath}:`, error.message);
  }
  return arrayOfFiles;
};

// 4. Metadatos ID3
const getTrackMetadata = async (relativePath) => {
  const absolutePath = path.join(MUSIC_DIR, relativePath);
  try {
    const metadata = await musicMetadata.parseFile(absolutePath);
    const { title, artist, album, year, genre } = metadata.common;
    const duration = metadata.format.duration || 0;

    const rawName = path.basename(relativePath, path.extname(relativePath));
    const parts = rawName.split(' - ');
    const rawGenreString = (genre && genre.length > 0) ? genre[0] : '';
    const cleanGenre = normalizeAndCleanGenre(rawGenreString, artist, relativePath);

    return {
      path: relativePath,
      title: title || (parts.length > 1 ? parts[1].trim() : rawName),
      artist: artist || (parts.length > 1 ? parts[0].trim() : 'Varios'),
      album: album || 'MicroSD Audio',
      genre: cleanGenre,
      year: year || null,
      duration: Math.round(duration)
    };
  } catch (err) {
    const rawName = path.basename(relativePath, path.extname(relativePath));
    const parts = rawName.split(' - ');
    return {
      path: relativePath,
      title: parts.length > 1 ? parts[1].trim() : rawName,
      artist: parts.length > 1 ? parts[0].trim() : 'Varios',
      album: 'MicroSD Audio',
      genre: 'Varios',
      year: null,
      duration: 0
    };
  }
};

// 5. Endpoint de Carátulas
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
      if (mime === 'image/jpg') mime = 'image/jpeg';

      res.set('Content-Type', mime);
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(picture.data);
    }
  } catch (e) {}
  res.status(404).send('Sin carátula');
});

// 6. Estado Global del Servidor
let masterLibrary = [];
let activeQueue = [];
let currentIndex = 0;
let isShuffle = false;
let currentFilterMode = 'all'; // 'all' | 'favorites' | 'artist' | 'genre' | 'playlist'
let selectedArtist = null;
let selectedGenre = null;
let selectedPlaylistId = null;
let currentVolume = 10;
let isPlaying = false;
let trackTimer = null;

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

// Sleep Timer
let sleepTimerInterval = null;
let sleepTimerEndsAt = 0;
let sleepTimerBaseVolume = 10;
let isFadingOut = false;

const getSleepTimerState = () => {
  if (!sleepTimerEndsAt || sleepTimerEndsAt <= Date.now()) {
    return { active: false, remainingSeconds: 0 };
  }
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
    const now = Date.now();
    const remainingMs = sleepTimerEndsAt - now;
    const remainingSecs = Math.ceil(remainingMs / 1000);

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

      clearTrackTimer();
      exec('termux-media-player pause', () => {
        isPlaying = false;
        currentVolume = sleepTimerBaseVolume;
        exec(`termux-volume music ${currentVolume}`);
        broadcastState();
      });
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

const clearTrackTimer = () => {
  if (trackTimer) {
    clearTimeout(trackTimer);
    trackTimer = null;
  }
};

const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Reconstrucción de Cola con soporte para Playlists
const rebuildQueue = (startPath = null) => {
  let list = [];
  if (currentFilterMode === 'favorites') {
    list = masterLibrary.filter(t => favoritesList.includes(t.path));
  } else if (currentFilterMode === 'artist' && selectedArtist) {
    list = masterLibrary.filter(t => t.artist === selectedArtist);
  } else if (currentFilterMode === 'genre' && selectedGenre) {
    list = masterLibrary.filter(t => t.genre === selectedGenre);
  } else if (currentFilterMode === 'playlist' && selectedPlaylistId) {
    const pl = playlistsList.find(p => p.id === selectedPlaylistId);
    if (pl && pl.tracks) {
      // Mapear rutas de la playlist al objeto completo en masterLibrary respetando el orden
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

const initLibrary = () => {
  const files = scanMusicDirectory(MUSIC_DIR);
  masterLibrary = files.map((relPath, index) => {
    const rawName = path.basename(relPath, path.extname(relPath));
    const parts = rawName.split(' - ');
    const folderName = path.dirname(relPath);

    let artist = 'Varios';
    let title = rawName;

    if (parts.length > 1) {
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    } else if (folderName !== '.') {
      artist = folderName.split(path.sep)[0];
    }

    return {
      id: index + 1,
      path: relPath,
      title,
      artist,
      genre: 'Varios'
    };
  });

  rebuildQueue();
};

initLibrary();

const broadcastState = () => {
  io.emit('state_changed', {
    isPlaying,
    isShuffle,
    currentFilterMode,
    selectedArtist,
    selectedGenre,
    selectedPlaylistId,
    currentVolume,
    currentTrack: currentTrackData,
    queue: activeQueue,
    masterLibrary,
    favorites: favoritesList,
    playlists: playlistsList,
    playStartTime,
    elapsedOffset,
    sleepTimer: getSleepTimerState()
  });
};

const playCurrentTrack = async () => {
  clearTrackTimer();
  if (!activeQueue.length) return;
  if (currentIndex < 0 || currentIndex >= activeQueue.length) currentIndex = 0;

  const track = activeQueue[currentIndex];
  const absolutePath = path.join(MUSIC_DIR, track.path);

  const meta = await getTrackMetadata(track.path);
  currentTrackData = meta;
  elapsedOffset = 0;

  const libItem = masterLibrary.find(t => t.path === track.path);
  if (libItem) libItem.genre = meta.genre;

  exec(`termux-media-player play "${absolutePath}"`, (err) => {
    if (!err) {
      isPlaying = true;
      playStartTime = Date.now();
      broadcastState();

      if (meta.duration && meta.duration > 2) {
        trackTimer = setTimeout(() => {
          nextTrack();
        }, (meta.duration + 1) * 1000);
      }
    }
  });
};

const nextTrack = () => {
  clearTrackTimer();
  if (!activeQueue.length) return;
  currentIndex = (currentIndex + 1) % activeQueue.length;
  playCurrentTrack();
};

const prevTrack = () => {
  clearTrackTimer();
  if (!activeQueue.length) return;
  currentIndex = (currentIndex - 1 + activeQueue.length) % activeQueue.length;
  playCurrentTrack();
};

// 7. Monitor Hardware
setInterval(() => {
  if (!isPlaying) return;
  if (Date.now() - playStartTime < 3000) return;

  exec('termux-media-player info', (err, stdout) => {
    if (err) return;
    const output = (stdout || '').toLowerCase();
    if (output.includes('stopped') || output.includes('no track')) {
      clearTrackTimer();
      nextTrack();
    }
  });
}, 2000);

// 8. REST & WebSockets
app.get('/api/library', (req, res) => {
  res.json({
    masterLibrary,
    activeQueue,
    favorites: favoritesList,
    playlists: playlistsList,
    currentTrack: currentTrackData,
    isPlaying,
    playStartTime,
    elapsedOffset,
    sleepTimer: getSleepTimerState()
  });
});

io.on('connection', (socket) => {
  socket.emit('state_changed', {
    isPlaying,
    isShuffle,
    currentFilterMode,
    selectedArtist,
    selectedGenre,
    selectedPlaylistId,
    currentVolume,
    currentTrack: currentTrackData,
    queue: activeQueue,
    masterLibrary,
    favorites: favoritesList,
    playlists: playlistsList,
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

  socket.on('toggle_play', () => {
    if (isPlaying) {
      clearTrackTimer();
      elapsedOffset += (Date.now() - playStartTime) / 1000;
      exec('termux-media-player pause', (err) => {
        if (!err) {
          isPlaying = false;
          broadcastState();
        }
      });
    } else {
      if (currentTrackData.path) {
        exec('termux-media-player play', (err) => {
          if (!err) {
            isPlaying = true;
            playStartTime = Date.now();
            broadcastState();

            const remainingSecs = Math.max(currentTrackData.duration - elapsedOffset, 1);
            trackTimer = setTimeout(() => nextTrack(), (remainingSecs + 1) * 1000);
          } else {
            playCurrentTrack();
          }
        });
      } else {
        playCurrentTrack();
      }
    }
  });

  socket.on('next', nextTrack);
  socket.on('prev', prevTrack);

  socket.on('toggle_shuffle', () => {
    isShuffle = !isShuffle;
    rebuildQueue(currentTrackData.path);
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
    if (favoritesList.includes(trackPath)) {
      favoritesList = favoritesList.filter(p => p !== trackPath);
    } else {
      favoritesList.push(trackPath);
    }
    saveJSON(FAVORITES_FILE, favoritesList);

    if (currentFilterMode === 'favorites') {
      rebuildQueue(currentTrackData.path);
    }

    broadcastState();
  });

  // --- CRUD DE PLAYLISTS ---
  socket.on('create_playlist', (name) => {
    if (!name || !name.trim()) return;
    const newPlaylist = {
      id: `pl_${Date.now()}`,
      name: name.trim(),
      tracks: [],
      createdAt: Date.now()
    };
    playlistsList.push(newPlaylist);
    saveJSON(PLAYLISTS_FILE, playlistsList);
    broadcastState();
  });

  socket.on('delete_playlist', (playlistId) => {
    playlistsList = playlistsList.filter(p => p.id !== playlistId);
    saveJSON(PLAYLISTS_FILE, playlistsList);
    if (currentFilterMode === 'playlist' && selectedPlaylistId === playlistId) {
      currentFilterMode = 'all';
      selectedPlaylistId = null;
      rebuildQueue();
    }
    broadcastState();
  });

  socket.on('add_to_playlist', ({ playlistId, trackPath }) => {
    const pl = playlistsList.find(p => p.id === playlistId);
    if (pl && !pl.tracks.includes(trackPath)) {
      pl.tracks.push(trackPath);
      saveJSON(PLAYLISTS_FILE, playlistsList);
      if (currentFilterMode === 'playlist' && selectedPlaylistId === playlistId) {
        rebuildQueue(currentTrackData.path);
      }
      broadcastState();
    }
  });

  socket.on('remove_from_playlist', ({ playlistId, trackPath }) => {
    const pl = playlistsList.find(p => p.id === playlistId);
    if (pl) {
      pl.tracks = pl.tracks.filter(p => p !== trackPath);
      saveJSON(PLAYLISTS_FILE, playlistsList);
      if (currentFilterMode === 'playlist' && selectedPlaylistId === playlistId) {
        rebuildQueue(currentTrackData.path);
      }
      broadcastState();
    }
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
});

const PORT = 3000;
httpServer.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor con Playlists activo en puerto ${PORT}`));