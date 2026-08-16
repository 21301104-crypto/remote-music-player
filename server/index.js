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
const SUPPORTED_EXTENSIONS = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg'];

// 1. Escaneo de archivos
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

// 2. Extracción de metadatos ID3
const getTrackMetadata = async (relativePath) => {
  const absolutePath = path.join(MUSIC_DIR, relativePath);
  try {
    const metadata = await musicMetadata.parseFile(absolutePath);
    const { title, artist, album, year } = metadata.common;
    const duration = metadata.format.duration || 0;

    const rawName = path.basename(relativePath, path.extname(relativePath));
    const parts = rawName.split(' - ');

    return {
      path: relativePath,
      title: title || (parts.length > 1 ? parts[1].trim() : rawName),
      artist: artist || (parts.length > 1 ? parts[0].trim() : 'Varios'),
      album: album || 'MicroSD Audio',
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
      year: null,
      duration: 0
    };
  }
};

// 3. Endpoint para carátulas binarias
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
  } catch (e) {
    // Si no hay portada en el archivo
  }
  res.status(404).send('Sin carátula');
});

// 4. Estado centralizado y control de sincronización temporal
let masterLibrary = [];
let activeQueue = [];
let currentIndex = 0;
let isShuffle = false;
let selectedArtist = null;
let currentVolume = 10;
let isPlaying = false;
let trackTimer = null;

// Variables de interpolación temporal
let playStartTime = 0;
let elapsedOffset = 0; // Segundos acumulados antes de pausar

let currentTrackData = {
  path: null,
  title: null,
  artist: null,
  album: null,
  duration: 0
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

const rebuildQueue = (startPath = null) => {
  let list = selectedArtist
    ? masterLibrary.filter(t => t.artist === selectedArtist)
    : [...masterLibrary];

  if (isShuffle) { list = shuffleArray(list); }
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
    return { id: index + 1, path: relPath, title, artist };
  });

  rebuildQueue();
};

initLibrary();

const broadcastState = () => {
  io.emit('state_changed', {
    isPlaying,
    isShuffle,
    selectedArtist,
    currentVolume,
    currentTrack: currentTrackData,
    queue: activeQueue,
    masterLibrary,
    playStartTime,
    elapsedOffset
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

// 5. Monitor de seguridad por si el temporizador se desincroniza
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

// 6. Endpoints y Sockets
app.get('/api/library', (req, res) => {
  res.json({
    masterLibrary,
    activeQueue,
    currentTrack: currentTrackData,
    isPlaying,
    playStartTime,
    elapsedOffset
  });
});

io.on('connection', (socket) => {
  socket.emit('state_changed', {
    isPlaying,
    isShuffle,
    selectedArtist,
    currentVolume,
    currentTrack: currentTrackData,
    queue: activeQueue,
    masterLibrary,
    playStartTime,
    elapsedOffset
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
      // Calcular tiempo acumulado antes de pausar
      elapsedOffset += (Date.now() - playStartTime) / 1000;
      exec('termux-media-player pause', (err) => {
        if (!err) {
          isPlaying = false;
          broadcastState();
        }
      });
    } else {
      if (currentTrackData.path) {
        const absolutePath = path.join(MUSIC_DIR, currentTrackData.path);
        playStartTime = Date.now();
        exec(`termux-media-player play "${absolutePath}"`, (err) => {
          if (!err) {
            isPlaying = true;
            broadcastState();
            const remainingSecs = Math.max(currentTrackData.duration - elapsedOffset, 1);
            trackTimer = setTimeout(() => nextTrack(), remainingSecs * 1000);
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

  socket.on('filter_artist', (artist) => {
    selectedArtist = artist;
    rebuildQueue();
    playCurrentTrack();
  });

  socket.on('set_volume', (level) => {
    currentVolume = Math.min(Math.max(parseInt(level, 10) || 0, 0), 15);
    exec(`termux-volume music ${currentVolume}`, (err) => {
      if (!err) broadcastState();
    });
  });
});

const PORT = 3000;
httpServer.listen(PORT, '0.0.0.0', () => console.log(`🚀 Motor activo en puerto ${PORT}`));