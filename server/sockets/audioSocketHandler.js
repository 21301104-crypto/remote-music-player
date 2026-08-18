// server/sockets/audioSocketHandler.js
import { playbackService } from '../services/playbackService.js';
import { dbService } from '../services/dbService.js';
import { fetchLyricsFromLRCLIB, startBulkLyricsSync } from '../services/lyricsService.js';

export const registerAudioSocketHandlers = (io, socket) => {
  // 1. Enviar estado actual al conectarse
  socket.emit('state_changed', playbackService.getState());

  // 2. REPRODUCCIÓN DE SELECCIÓN DINÁMICA
  socket.on('play_custom_queue', (payload) => {
    try {
      const tracks = payload?.tracks || [];
      const startPath = payload?.startPath || null;
      console.log(`📡 [WebSocket] Evento 'play_custom_queue' recibido con ${tracks.length} pista(s). Inicio: ${startPath}`);
      playbackService.playCustomQueue(tracks, startPath);
    } catch (err) {
      console.error('❌ [WebSocket Error] play_custom_queue:', err.message);
    }
  });

  socket.on('play_track', (targetPath) => {
    console.log(`📡 [WebSocket] Evento 'play_track' recibido: ${targetPath}`);
    playbackService.playTrack(targetPath);
  });

  socket.on('play_next', (targetPath) => {
    console.log(`📡 [WebSocket] Evento 'play_next' recibido: ${targetPath}`);
    playbackService.playNext(targetPath);
  });

  socket.on('toggle_play', () => {
    console.log(`📡 [WebSocket] Evento 'toggle_play' recibido.`);
    playbackService.togglePlay();
  });

  socket.on('seek_audio', (seconds) => {
    playbackService.seek(seconds);
  });

  socket.on('next', () => {
    playbackService.next(true);
  });

  socket.on('prev', () => {
    playbackService.prev();
  });

  socket.on('toggle_shuffle', () => {
    playbackService.toggleShuffle();
  });

  socket.on('toggle_repeat', () => {
    playbackService.toggleRepeat();
  });

  socket.on('set_eq', (newEq) => {
    playbackService.setEqualizer(newEq);
  });

  socket.on('set_filter', (filter) => {
    playbackService.setFilter(filter);
  });

  socket.on('set_volume', (lvl) => {
    playbackService.setVolume(lvl);
  });

  socket.on('set_sleep_timer', (min) => {
    playbackService.startSleepTimer(min);
  });

  socket.on('cancel_sleep_timer', () => {
    playbackService.cancelSleepTimer(true);
  });

  socket.on('toggle_favorite', (trackPath) => {
    dbService.toggleFavorite(trackPath);
    if (playbackService.currentFilterMode === 'favorites') {
      playbackService.rebuildQueue(playbackService.currentTrackData.path);
    }
    playbackService.notify();
  });

  socket.on('create_playlist', (name) => {
    if (!name || !name.trim()) return;
    const playlistId = `pl_${Date.now()}`;
    dbService.createPlaylist(playlistId, name.trim(), Date.now());
    playbackService.notify();
  });

  socket.on('delete_playlist', (playlistId) => {
    dbService.deletePlaylist(playlistId);
    if (playbackService.currentFilterMode === 'playlist' && playbackService.selectedPlaylistId === playlistId) {
      playbackService.currentFilterMode = 'all';
      playbackService.selectedPlaylistId = null;
      playbackService.rebuildQueue();
    }
    playbackService.notify();
  });

  socket.on('add_to_playlist', ({ playlistId, trackPath }) => {
    dbService.addTrackToPlaylist(playlistId, trackPath);
    if (playbackService.currentFilterMode === 'playlist' && playbackService.selectedPlaylistId === playlistId) {
      playbackService.rebuildQueue(playbackService.currentTrackData.path);
    }
    playbackService.notify();
  });

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
};