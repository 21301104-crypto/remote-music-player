// server/services/playbackService.js
import path from 'path';
import { exec } from 'child_process';
import { MUSIC_DIR, DEFAULT_EQ } from '../config/constants.js';
import { dbService } from './dbService.js';
import { mpvService } from './mpvService.js';
import { parseTrackID3, scanMusicDirectory } from './libraryService.js';

class PlaybackService {
  constructor() {
    this.masterLibrary = [];
    this.activeQueue = [];
    this.currentIndex = 0;
    this.isShuffle = false;
    this.repeatMode = 'all'; // 'off' | 'all' | 'one'
    this.currentFilterMode = 'all';
    this.selectedArtist = null;
    this.selectedGenre = null;
    this.selectedPlaylistId = null;
    this.currentVolume = 10;
    this.isPlaying = false;
    this.playStartTime = 0;
    this.elapsedOffset = 0;

    this.currentTrackData = {
      path: null,
      title: null,
      artist: null,
      album: null,
      genre: 'Varios',
      duration: 0
    };

    this.eqSettings = dbService.getSetting('eq_settings', DEFAULT_EQ);

    // Sleep Timer
    this.sleepTimerInterval = null;
    this.sleepTimerEndsAt = 0;
    this.sleepTimerBaseVolume = 10;
    this.isFadingOut = false;

    this.notifyCallback = null;
  }

  setNotifyCallback(cb) {
    this.notifyCallback = cb;
  }

  notify() {
    if (this.notifyCallback) {
      this.notifyCallback();
    }
  }

  getState() {
    return {
      isPlaying: this.isPlaying,
      isShuffle: this.isShuffle,
      repeatMode: this.repeatMode,
      currentFilterMode: this.currentFilterMode,
      selectedArtist: this.selectedArtist,
      selectedGenre: this.selectedGenre,
      selectedPlaylistId: this.selectedPlaylistId,
      currentVolume: this.currentVolume,
      currentTrack: this.currentTrackData,
      queue: this.activeQueue,
      masterLibrary: this.masterLibrary,
      favorites: dbService.getFavorites(),
      playlists: dbService.getPlaylists(),
      eqSettings: this.eqSettings,
      playStartTime: this.playStartTime,
      elapsedOffset: this.elapsedOffset,
      sleepTimer: this.getSleepTimerState()
    };
  }

  async init() {
    mpvService.start(() => this.next(false));
    mpvService.applyEqualizer(this.eqSettings);

    const diskFiles = scanMusicDirectory();
    const dbCount = dbService.getTracksCount();

    if (dbCount === diskFiles.length && diskFiles.length > 0) {
      this.masterLibrary = dbService.getAllTracks();
      this.rebuildQueue();
      this.notify();
      console.log(`⚡ [Playback Engine] ${this.masterLibrary.length} pistas cargadas desde SQLite.`);
      return;
    }

    console.log(`⏳ [Playback Engine] Sincronizando ${diskFiles.length} archivos con SQLite...`);
    const enrichedList = [];
    for (let i = 0; i < diskFiles.length; i += 30) {
      const batch = diskFiles.slice(i, i + 30);
      const res = await Promise.all(batch.map(f => parseTrackID3(f)));
      enrichedList.push(...res);
    }

    dbService.saveTracksBatch(enrichedList);
    this.masterLibrary = dbService.getAllTracks();
    this.rebuildQueue();
    this.notify();
    console.log(`✅ [Playback Engine] Catálogo indexado en SQLite.`);
  }

  rebuildQueue(startPath = null) {
    let list = [];
    const favorites = dbService.getFavorites();

    if (this.currentFilterMode === 'favorites') {
      list = this.masterLibrary.filter(t => favorites.includes(t.path));
    } else if (this.currentFilterMode === 'artist' && this.selectedArtist) {
      list = this.masterLibrary.filter(t => t.artist === this.selectedArtist);
    } else if (this.currentFilterMode === 'genre' && this.selectedGenre) {
      list = this.masterLibrary.filter(t => t.genre === this.selectedGenre);
    } else if (this.currentFilterMode === 'playlist' && this.selectedPlaylistId) {
      const playlists = dbService.getPlaylists();
      const pl = playlists.find(p => p.id === this.selectedPlaylistId);
      list = pl && pl.tracks ? pl.tracks.map(p => this.masterLibrary.find(t => t.path === p)).filter(Boolean) : [...this.masterLibrary];
    } else {
      list = [...this.masterLibrary];
    }

    if (this.isShuffle) {
      const shuffled = [...list];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      list = shuffled;
    }

    this.activeQueue = list;
    if (startPath) {
      const idx = this.activeQueue.findIndex(t => t.path === startPath);
      this.currentIndex = idx !== -1 ? idx : 0;
    } else {
      this.currentIndex = 0;
    }
  }

  // Reproducir Selección Dinámica / Resultados de Búsqueda
  async playCustomQueue(tracks, startPath = null) {
    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      console.warn('⚠️ [Playback Service] Cola vacía recibida en playCustomQueue.');
      return;
    }

    console.log(`🎯 [Playback Service] Activando cola de búsqueda con ${tracks.length} pista(s).`);
    this.currentFilterMode = 'search';
    this.activeQueue = [...tracks];

    if (startPath) {
      const idx = this.activeQueue.findIndex(t => t.path === startPath);
      this.currentIndex = idx !== -1 ? idx : 0;
    } else {
      this.currentIndex = 0;
    }

    await this.playCurrent();
  }

  async playTrack(targetPath) {
    const idx = this.activeQueue.findIndex(t => t.path === targetPath);
    if (idx !== -1) {
      this.currentIndex = idx;
    } else {
      this.rebuildQueue(targetPath);
    }
    await this.playCurrent();
  }

  playNext(targetPath) {
    const trackObj = this.masterLibrary.find(t => t.path === targetPath);
    if (!trackObj) return;

    if (this.activeQueue.length === 0) {
      this.activeQueue = [trackObj];
      this.currentIndex = 0;
    } else {
      const futureIdx = this.activeQueue.findIndex((t, idx) => t.path === targetPath && idx > this.currentIndex);
      if (futureIdx !== -1) {
        this.activeQueue.splice(futureIdx, 1);
      }
      this.activeQueue.splice(this.currentIndex + 1, 0, trackObj);
    }
    this.notify();
  }

  async playCurrent() {
    if (!this.activeQueue.length) return;
    if (this.currentIndex < 0 || this.currentIndex >= this.activeQueue.length) this.currentIndex = 0;

    const track = this.activeQueue[this.currentIndex];
    if (!track || !track.path) {
      console.error('❌ [Playback Error] Pista no válida en índice:', this.currentIndex);
      return;
    }

    const absolutePath = path.join(MUSIC_DIR, track.path);
    console.log(`▶️ [MPV Play] Pista (${this.currentIndex + 1}/${this.activeQueue.length}): ${track.title} [${absolutePath}]`);

    this.currentTrackData = dbService.getTrackByPath(track.path) || (await parseTrackID3(track.path));
    this.elapsedOffset = 0;

    mpvService.loadFile(absolutePath);
    mpvService.applyEqualizer(this.eqSettings);

    this.isPlaying = true;
    this.playStartTime = Date.now();
    this.notify();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.elapsedOffset += (Date.now() - this.playStartTime) / 1000;
      mpvService.setPause(true);
      this.isPlaying = false;
      this.notify();
    } else {
      if (this.currentTrackData.path) {
        mpvService.setPause(false);
        this.isPlaying = true;
        this.playStartTime = Date.now();
        this.notify();
      } else {
        this.playCurrent();
      }
    }
  }

  seek(seconds) {
    const targetSec = Math.max(0, Math.min(parseFloat(seconds) || 0, this.currentTrackData.duration || 9999));
    mpvService.seek(targetSec);
    this.elapsedOffset = targetSec;
    this.playStartTime = Date.now();
    this.notify();
  }

  next(isManual = false) {
    if (!this.activeQueue.length) return;
    if (!isManual && this.repeatMode === 'one') {
      this.playCurrent();
      return;
    }
    if (!isManual && this.repeatMode === 'off' && this.currentIndex === this.activeQueue.length - 1) {
      mpvService.setPause(true);
      this.isPlaying = false;
      this.notify();
      return;
    }
    this.currentIndex = (this.currentIndex + 1) % this.activeQueue.length;
    this.playCurrent();
  }

  prev() {
    if (!this.activeQueue.length) return;
    this.currentIndex = (this.currentIndex - 1 + this.activeQueue.length) % this.activeQueue.length;
    this.playCurrent();
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    if (this.currentFilterMode === 'search') {
      const shuffled = [...this.activeQueue];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      this.activeQueue = shuffled;
      if (this.currentTrackData.path) {
        const idx = this.activeQueue.findIndex(t => t.path === this.currentTrackData.path);
        this.currentIndex = idx !== -1 ? idx : 0;
      }
      this.notify();
    } else {
      this.rebuildQueue(this.currentTrackData.path);
      this.notify();
    }
  }

  toggleRepeat() {
    if (this.repeatMode === 'all') this.repeatMode = 'one';
    else if (this.repeatMode === 'one') this.repeatMode = 'off';
    else this.repeatMode = 'all';
    this.notify();
  }

  setEqualizer(newEq) {
    this.eqSettings = newEq;
    dbService.setSetting('eq_settings', newEq);
    mpvService.applyEqualizer(this.eqSettings);
    this.notify();
  }

  setFilter({ mode, artist, genre, playlistId }) {
    this.currentFilterMode = mode;
    this.selectedArtist = artist || null;
    this.selectedGenre = genre || null;
    this.selectedPlaylistId = playlistId || null;
    this.rebuildQueue();
    this.notify();
  }

  setVolume(level) {
    this.currentVolume = Math.min(Math.max(parseInt(level, 10) || 0, 0), 15);
    if (!this.isFadingOut) this.sleepTimerBaseVolume = this.currentVolume;
    exec(`termux-volume music ${this.currentVolume}`, () => this.notify());
  }

  getSleepTimerState() {
    if (!this.sleepTimerEndsAt || this.sleepTimerEndsAt <= Date.now()) return { active: false, remainingSeconds: 0 };
    return {
      active: true,
      remainingSeconds: Math.max(0, Math.ceil((this.sleepTimerEndsAt - Date.now()) / 1000)),
      endsAt: this.sleepTimerEndsAt
    };
  }

  startSleepTimer(minutes) {
    this.cancelSleepTimer(false);
    if (!minutes || minutes <= 0) return;

    this.sleepTimerBaseVolume = this.currentVolume;
    this.sleepTimerEndsAt = Date.now() + (minutes * 60 * 1000);
    this.isFadingOut = false;

    this.sleepTimerInterval = setInterval(() => {
      const remaining = Math.ceil((this.sleepTimerEndsAt - Date.now()) / 1000);
      if (remaining <= 60 && remaining > 0) {
        this.isFadingOut = true;
        const targetVol = Math.max(0, Math.round(this.sleepTimerBaseVolume * (remaining / 60)));
        if (targetVol !== this.currentVolume) {
          this.currentVolume = targetVol;
          exec(`termux-volume music ${this.currentVolume}`);
        }
      } else if (remaining <= 0) {
        this.cancelSleepTimer(false);
        mpvService.setPause(true);
        this.isPlaying = false;
        this.currentVolume = this.sleepTimerBaseVolume;
        exec(`termux-volume music ${this.currentVolume}`);
        this.notify();
        return;
      }
      this.notify();
    }, 1000);

    this.notify();
  }

  cancelSleepTimer(restoreVolume = true) {
    if (this.sleepTimerInterval) {
      clearInterval(this.sleepTimerInterval);
      this.sleepTimerInterval = null;
    }
    if (restoreVolume && this.isFadingOut) {
      this.currentVolume = this.sleepTimerBaseVolume;
      exec(`termux-volume music ${this.currentVolume}`);
    }
    this.sleepTimerEndsAt = 0;
    this.isFadingOut = false;
    this.notify();
  }
}

export const playbackService = new PlaybackService();