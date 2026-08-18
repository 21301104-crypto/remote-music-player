<!-- src/App.vue -->
<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { io } from 'socket.io-client';
import { useColorExtractor } from './composables/useColorExtractor';
import SleepTimerModal from './components/SleepTimerModal.vue';
import PlaylistModal from './components/PlaylistModal.vue';
import EqualizerModal from './components/EqualizerModal.vue';
import UploaderModal from './components/UploaderModal.vue';
import LyricsModal from './components/LyricsModal.vue';

// =========================================================================
// 1. CONFIGURACIÓN DE RED & SOCKET.IO
// =========================================================================
const BACKEND_URL = import.meta.env.DEV
  ? `http://${window.location.hostname}:3000`
  : window.location.origin;

const socket = io(BACKEND_URL);

// =========================================================================
// 2. ESTADOS REACTIVOS DEL SISTEMA
// =========================================================================
const isConnected = ref(false);
const isSleepTimerModalOpen = ref(false);
const isPlaylistModalOpen = ref(false);
const isEqualizerModalOpen = ref(false);
const isUploaderModalOpen = ref(false);
const isLyricsModalOpen = ref(false);

const currentLyricsData = ref(null);
const lyricsSyncProgress = ref(null);
const playlistModalMode = ref('create');
const selectedTrackForPlaylist = ref(null);

// Sistema de Notificaciones Toast
const toastMessage = ref('');
let toastTimer = null;
const showToast = (msg) => {
  if (toastTimer) clearTimeout(toastTimer);
  toastMessage.value = msg;
  toastTimer = setTimeout(() => { toastMessage.value = ''; }, 2200);
};

// Catálogo, DSP & Persistencia
const sleepTimer = ref({ active: false, remainingSeconds: 0 });
const eqSettings = ref({ enabled: true, preset: 'bass_boost', bands: [] });
const masterLibrary = ref([]);
const queue = ref([]);
const favorites = ref([]);
const playlists = ref([]);
const currentFilterMode = ref('all');
const selectedArtist = ref(null);
const selectedGenre = ref(null);
const selectedPlaylistId = ref(null);
const selectedAlbum = ref(null);
const filterCategoryTab = ref('tracks'); // 'tracks' | 'favorites' | 'playlists' | 'albums' | 'artists'

// Pista Activa & Transporte
const currentTrack = ref({
  path: null,
  title: null,
  artist: null,
  album: null,
  genre: 'Varios',
  duration: 0
});

const isPlaying = ref(false);
const isShuffle = ref(false);
const repeatMode = ref('all'); // 'off' | 'all' | 'one'
const volume = ref(10);
const imageError = ref(false);

// Motor de Búsqueda Reactivo Multi-Término
const searchQuery = ref('');
const lyricsMatches = ref([]);

// Extracción Cromática Adaptativa
const { currentPalette, extractColorsFromImage } = useColorExtractor();

const themeStyleObject = computed(() => ({
  '--theme-accent': '#8b2616',
  '--theme-secondary': '#a93226'
}));

// Ticker de Tiempo Local (250ms)
const playStartTime = ref(0);
const elapsedOffset = ref(0);
const currentTime = ref(0);
let progressInterval = null;

const coverUrl = computed(() => {
  if (!currentTrack.value.path || imageError.value) return null;
  return `${BACKEND_URL}/api/cover?path=${encodeURIComponent(currentTrack.value.path)}`;
});

const handleImageError = () => { imageError.value = true; };

const getTrackCoverUrl = (trackPath) => {
  if (!trackPath) return null;
  return `${BACKEND_URL}/api/cover?path=${encodeURIComponent(trackPath)}`;
};

// =========================================================================
// 3. MÉTODOS DE TRANSPORTE Y CONTROL DE AUDIO
// =========================================================================
const sanitizeTracks = (rawList) => {
  return rawList.map(t => ({
    id: t.id || null,
    path: t.path,
    title: t.title,
    artist: t.artist,
    album: t.album || null,
    genre: t.genre || 'Varios',
    duration: t.duration || 0
  }));
};

const playTrack = (track) => {
  imageError.value = false;
  
  if (searchQuery.value.trim() || filterCategoryTab.value === 'favorites' || selectedAlbum.value) {
    const cleanList = sanitizeTracks(displayedQueue.value);
    socket.emit('play_custom_queue', {
      tracks: cleanList,
      startPath: track.path
    });
    showToast(`Reproduciendo selección (${cleanList.length} pistas)`);
  } else {
    socket.emit('play_track', track.path);
  }
};

const playAllSearchResults = () => {
  if (!displayedQueue.value.length) return;
  imageError.value = false;
  const cleanList = sanitizeTracks(displayedQueue.value);
  socket.emit('play_custom_queue', {
    tracks: cleanList,
    startPath: cleanList[0].path
  });
  showToast(`Reproduciendo lista (${cleanList.length} pistas)`);
};

const playAllAlbumTracks = () => {
  if (!albumTracks.value.length) return;
  imageError.value = false;
  const cleanList = sanitizeTracks(albumTracks.value);
  socket.emit('play_custom_queue', {
    tracks: cleanList,
    startPath: cleanList[0].path
  });
  showToast(`Reproduciendo álbum (${cleanList.length} pistas)`);
};

const playNext = (track, event) => {
  if (event) event.stopPropagation();
  socket.emit('play_next', track.path);
  showToast(`Siguiente: ${track.title}`);
};

const togglePlay = () => socket.emit('toggle_play');
const nextTrack = () => {
  imageError.value = false;
  socket.emit('next');
};
const prevTrack = () => {
  imageError.value = false;
  socket.emit('prev');
};

const toggleShuffle = () => socket.emit('toggle_shuffle');
const toggleRepeat = () => socket.emit('toggle_repeat');
const seekAudio = (targetSec) => socket.emit('seek_audio', targetSec);

const setFilter = (mode, param = null) => {
  imageError.value = false;
  searchQuery.value = '';
  lyricsMatches.value = [];
  selectedAlbum.value = null;

  if (mode === 'artist') socket.emit('set_filter', { mode: 'artist', artist: param });
  else if (mode === 'playlist') socket.emit('set_filter', { mode: 'playlist', playlistId: param });
  else socket.emit('set_filter', { mode: 'all' });
};

const selectAlbum = (albumName) => {
  selectedAlbum.value = albumName;
};

const toggleFavorite = (trackPath, event) => {
  if (event) event.stopPropagation();
  socket.emit('toggle_favorite', trackPath);
};

const changeVolume = () => socket.emit('set_volume', volume.value);

// =========================================================================
// 4. GESTIÓN DE MODALES, DSP & LETRAS
// =========================================================================
const setSleepTimer = (minutes) => socket.emit('set_sleep_timer', minutes);
const cancelSleepTimer = () => socket.emit('cancel_sleep_timer');
const handleUpdateEq = (newEq) => socket.emit('set_eq', newEq);

const openLyricsModal = () => {
  if (currentTrack.value.path) socket.emit('get_lyrics', currentTrack.value.path);
  isLyricsModalOpen.value = true;
};

const startBulkSync = () => {
  socket.emit('start_bulk_lyrics_sync');
  showToast('Sincronizando letras...');
};

const openCreatePlaylistModal = () => {
  playlistModalMode.value = 'create';
  selectedTrackForPlaylist.value = null;
  isPlaylistModalOpen.value = true;
};

const openAddToPlaylistModal = (track, event) => {
  if (event) event.stopPropagation();
  playlistModalMode.value = 'add_track';
  selectedTrackForPlaylist.value = track;
  isPlaylistModalOpen.value = true;
};

const handleCreatePlaylist = (name) => socket.emit('create_playlist', name);
const handleAddToPlaylist = ({ playlistId, trackPath }) => {
  socket.emit('add_to_playlist', { playlistId, trackPath });
  showToast('Pista agregada a playlist');
};
const handleDeletePlaylist = (playlistId, event) => {
  if (event) event.stopPropagation();
  socket.emit('delete_playlist', playlistId);
};

// =========================================================================
// 5. MOTOR DE TOKENIZACIÓN MULTI-ARTISTA ('+') & BÚSQUEDA
// =========================================================================
let searchDebounceTimer = null;
watch(searchQuery, (newVal) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

  if (!newVal || !newVal.trim()) {
    lyricsMatches.value = [];
    return;
  }

  const tokens = newVal.split('+').map(t => t.trim()).filter(Boolean);
  if (!tokens.length) return;

  searchDebounceTimer = setTimeout(async () => {
    try {
      const allResults = await Promise.all(
        tokens.map(token => 
          fetch(`${BACKEND_URL}/api/search?q=${encodeURIComponent(token)}`)
            .then(res => res.ok ? res.json() : [])
            .catch(() => [])
        )
      );

      const flattened = allResults.flat();
      const uniqueLyricsMap = new Map();
      flattened.forEach(item => {
        if (item.matched_snippet && !uniqueLyricsMap.has(item.path)) {
          uniqueLyricsMap.set(item.path, item);
        }
      });

      lyricsMatches.value = Array.from(uniqueLyricsMap.values());
    } catch (e) {
      lyricsMatches.value = [];
    }
  }, 220);
});

// =========================================================================
// 6. PROPIEDADES COMPUTADAS
// =========================================================================
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const formatShortTimer = (seconds) => {
  if (!seconds || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const progressPercent = computed(() => {
  if (!currentTrack.value.duration || currentTrack.value.duration === 0) return 0;
  return Math.min(Math.max((currentTime.value / currentTrack.value.duration) * 100, 0), 100);
});

const isTrackFavorite = (path) => favorites.value.includes(path);

const uniqueArtists = computed(() => {
  const list = masterLibrary.value.map(t => t.artist).filter(a => a && a !== 'Varios' && !/^\d+$/.test(a.trim()));
  return [...new Set(list)].sort((a, b) => a.localeCompare(b));
});

const uniqueAlbums = computed(() => {
  const albumMap = new Map();
  masterLibrary.value.forEach(t => {
    const alb = t.album && t.album !== 'MicroSD Audio' ? t.album : 'Álbum Desconocido';
    if (!albumMap.has(alb)) {
      albumMap.set(alb, { name: alb, samplePath: t.path, artist: t.artist || 'Varios' });
    }
  });
  return Array.from(albumMap.values()).sort((a, b) => a.name.localeCompare(b.name));
});

const albumTracks = computed(() => {
  if (!selectedAlbum.value) return [];
  return masterLibrary.value.filter(t => {
    const alb = t.album && t.album !== 'MicroSD Audio' ? t.album : 'Álbum Desconocido';
    return alb === selectedAlbum.value;
  });
});

const displayedQueue = computed(() => {
  const rawQuery = searchQuery.value.trim();

  if (rawQuery) {
    const tokens = rawQuery.split('+').map(t => t.toLowerCase().trim()).filter(Boolean);
    if (tokens.length > 0) {
      const matchedTracks = masterLibrary.value.filter(track => {
        const title = (track.title || '').toLowerCase();
        const artist = (track.artist || '').toLowerCase();
        const album = (track.album || '').toLowerCase();
        return tokens.some(token => title.includes(token) || artist.includes(token) || album.includes(token));
      });
      const resultList = [...matchedTracks];
      if (lyricsMatches.value.length > 0) {
        lyricsMatches.value.forEach(lTrack => {
          if (!resultList.find(t => t.path === lTrack.path)) resultList.push(lTrack);
        });
      }
      return resultList;
    }
  }

  if (filterCategoryTab.value === 'favorites') {
    return masterLibrary.value.filter(t => favorites.value.includes(t.path));
  }

  let list = queue.value;
  if (!currentTrack.value.path || list.length <= 1) return list;

  const activeIndex = list.findIndex(t => t.path === currentTrack.value.path);
  if (activeIndex === -1) return list;

  const activeItem = list[activeIndex];
  const others = list.filter((_, idx) => idx !== activeIndex);
  return [activeItem, ...others];
});

watch(coverUrl, (newUrl) => {
  if (newUrl) extractColorsFromImage(newUrl);
});

watch(() => currentTrack.value.path, (newPath) => {
  if (newPath && isLyricsModalOpen.value) {
    socket.emit('get_lyrics', newPath);
  }
});

// =========================================================================
// 7. CICLO DE VIDA & PROTOCOLO WEBSOCKET
// =========================================================================
const startProgressTicker = () => {
  if (progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (isPlaying.value && playStartTime.value > 0) {
      const liveSeconds = (Date.now() - playStartTime.value) / 1000;
      currentTime.value = Math.min(elapsedOffset.value + liveSeconds, currentTrack.value.duration || Infinity);
    } else {
      currentTime.value = elapsedOffset.value;
    }
  }, 250);
};

onMounted(() => {
  startProgressTicker();

  socket.on('connect', () => { isConnected.value = true; });
  socket.on('disconnect', () => { isConnected.value = false; });

  socket.on('state_changed', (state) => {
    isPlaying.value = state.isPlaying;
    isShuffle.value = state.isShuffle;
    if (state.repeatMode !== undefined) repeatMode.value = state.repeatMode;
    if (state.eqSettings) eqSettings.value = state.eqSettings;
    currentFilterMode.value = state.currentFilterMode;
    selectedArtist.value = state.selectedArtist;
    selectedPlaylistId.value = state.selectedPlaylistId;
    favorites.value = state.favorites || [];
    playlists.value = state.playlists || [];
    if (state.currentVolume !== undefined) volume.value = state.currentVolume;
    if (state.sleepTimer) sleepTimer.value = state.sleepTimer;

    playStartTime.value = state.playStartTime || 0;
    elapsedOffset.value = state.elapsedOffset || 0;

    if (currentTrack.value.path !== state.currentTrack?.path) {
      imageError.value = false;
      currentTime.value = 0;
    }

    currentTrack.value = state.currentTrack || { duration: 0, genre: 'Varios' };
    queue.value = state.queue || [];
    masterLibrary.value = state.masterLibrary || [];
  });

  socket.on('lyrics_data', (data) => {
    if (data.trackPath === currentTrack.value.path) currentLyricsData.value = data;
  });

  socket.on('lyrics_sync_progress', (progress) => {
    lyricsSyncProgress.value = progress;
  });

  socket.on('lyrics_sync_completed', ({ found, total }) => {
    lyricsSyncProgress.value = { percentage: 100, processed: total, total };
    showToast(`Completado: ${found} letras en SQLite`);
    if (currentTrack.value.path) socket.emit('get_lyrics', currentTrack.value.path);
  });
});

onUnmounted(() => {
  if (progressInterval) clearInterval(progressInterval);
});
</script>

<template>
  <div class="vintage-viewport" :style="themeStyleObject">
    <!-- Toast Flotante -->
    <transition name="toast-vintage">
      <div v-if="toastMessage" class="vintage-toast">
        <span class="toast-amber-lamp"></span>
        <span class="toast-msg-text">{{ toastMessage }}</span>
      </div>
    </transition>

    <div class="vintage-chassis">
      <!-- CABECERA SUPERIOR -->
      <header class="vintage-navbar">
        <button class="btn-vintage-action" @click="isUploaderModalOpen = true" title="Subir canciones a MicroSD">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <span class="action-label">SUBIR</span>
        </button>

        <h1 class="vintage-brand-title">SOUNDWAVE</h1>

        <div class="navbar-right-cluster">
          <button class="btn-vintage-action" :class="{ 'is-active-btn': sleepTimer.active }" @click="isSleepTimerModalOpen = true" title="Temporizador de apagado">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span class="action-label">{{ sleepTimer.active ? formatShortTimer(sleepTimer.remainingSeconds) : 'SLEEP' }}</span>
          </button>

          <button class="btn-vintage-action" :class="{ 'is-active-btn': eqSettings.enabled }" @click="isEqualizerModalOpen = true" title="Ajustes DSP / Ecualizador">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="4" y1="21" x2="4" y2="14"></line>
              <line x1="4" y1="10" x2="4" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12" y2="3"></line>
              <line x1="20" y1="21" x2="20" y2="16"></line>
              <line x1="20" y1="12" x2="20" y2="3"></line>
            </svg>
            <span class="action-label">DSP</span>
          </button>
        </div>
      </header>

      <!-- Selector de Categorías (Pills) -->
      <nav class="vintage-category-tabs">
        <button class="vintage-tab-pill" :class="{ active: filterCategoryTab === 'tracks' }" @click="filterCategoryTab = 'tracks'; selectedAlbum = null; setFilter('all');">
          Canciones ({{ masterLibrary.length }})
        </button>
        <button class="vintage-tab-pill" :class="{ active: filterCategoryTab === 'favorites' }" @click="filterCategoryTab = 'favorites'; selectedAlbum = null; setFilter('favorites');">
          Favoritos ({{ favorites.length }})
        </button>
        <button class="vintage-tab-pill" :class="{ active: filterCategoryTab === 'playlists' }" @click="filterCategoryTab = 'playlists'; selectedAlbum = null;">
          Playlists ({{ playlists.length }})
        </button>
        <button class="vintage-tab-pill" :class="{ active: filterCategoryTab === 'albums' }" @click="filterCategoryTab = 'albums'; selectedAlbum = null;">
          Álbumes ({{ uniqueAlbums.length }})
        </button>
        <button class="vintage-tab-pill" :class="{ active: filterCategoryTab === 'artists' }" @click="filterCategoryTab = 'artists'; selectedAlbum = null;">
          Artistas ({{ uniqueArtists.length }})
        </button>
      </nav>

      <!-- CUERPO PRINCIPAL -->
      <div class="vintage-main-grid">
        <!-- COLUMNA 1: TOCADISCOS Y REPRODUCTOR -->
        <div class="vintage-deck-column">
          <section class="turntable-recessed-box">
            <span class="chassis-screw top-left"></span>
            <span class="chassis-screw top-right"></span>
            <span class="chassis-screw bottom-left"></span>
            <span class="chassis-screw bottom-right"></span>

            <div class="turntable-platter" @click="openLyricsModal" title="Toca para ver letras">
              <div class="strobe-rim-pattern"></div>
              <div class="vinyl-record" :class="{ 'is-spinning': isPlaying }">
                <div class="vinyl-grooves-texture"></div>
                <div class="vinyl-light-sheen"></div>
                <div class="vinyl-center-label">
                  <div class="label-inner-crest">
                    <span class="label-brand-name">{{ currentTrack.album || 'AURORA' }}</span>
                    <div class="label-sub-info">
                      <span>33 ⅓ RPM</span>
                      <span>SIDE A</span>
                    </div>
                    <span class="label-artist-name">{{ currentTrack.artist || 'JOSÉ MADERO' }}</span>
                    <span class="label-song-name">{{ currentTrack.title || 'TIEMPO COMPARTIDO' }}</span>
                  </div>
                  <div class="center-spindle-pin"></div>
                </div>
              </div>

              <div class="tonearm-assembly" :class="{ 'on-record': isPlaying }">
                <div class="tonearm-base"></div>
                <div class="tonearm-pivot"></div>
                <div class="tonearm-rod"></div>
                <div class="tonearm-cartridge">
                  <div class="cartridge-headshell"></div>
                </div>
              </div>
            </div>

            <div class="turntable-controls-bar">
              <div class="potentiometer-wrap">
                <div class="potentiometer-knob" :style="{ transform: `rotate(${(volume / 15) * 270 - 135}deg)` }">
                  <span class="knob-notch"></span>
                </div>
                <span class="power-lamp" :class="{ 'is-lit': isPlaying }"></span>
                <span class="potentiometer-label">VOL {{ volume }}</span>
              </div>
            </div>
          </section>

          <section class="playback-status-card">
            <div class="track-header-row">
              <div class="track-cover-square" @click="openLyricsModal" title="Toca para ver letras">
                <img v-if="coverUrl" :src="coverUrl" alt="Cover" @error="handleImageError" />
                <div v-else class="cover-art-fallback">
                  <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
                </div>
              </div>

              <div class="track-text-meta">
                <h2 class="vintage-track-title">{{ currentTrack.title || 'Pista no seleccionada' }}</h2>
                <p class="vintage-track-artist">{{ currentTrack.artist || 'Elige una canción' }}</p>
                <span class="vintage-track-album">{{ currentTrack.album || 'SoundWave DAP' }}</span>
              </div>

              <div class="track-fav-action">
                <button 
                  class="btn-vintage-heart" 
                  @click="toggleFavorite(currentTrack.path, $event)"
                  :class="{ 'is-fav': isTrackFavorite(currentTrack.path) }"
                  title="Favorito"
                >
                  <svg viewBox="0 0 24 24" :fill="isTrackFavorite(currentTrack.path) ? '#8b2616' : '#a89d8d'">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                </button>
                <button class="btn-vintage-dots" @click="openLyricsModal" title="Letras Sincronizadas">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2"/>
                    <circle cx="12" cy="12" r="2"/>
                    <circle cx="12" cy="19" r="2"/>
                  </svg>
                </button>
              </div>
            </div>

            <div class="vintage-progress-block">
              <div class="progress-bar-track" @click="seekAudio(($event.offsetX / $event.currentTarget.offsetWidth) * currentTrack.duration)">
                <div class="progress-bar-fill" :style="{ width: `${progressPercent}%` }">
                  <div class="progress-needle-thumb"></div>
                </div>
              </div>
              <div class="progress-timestamps">
                <span>{{ formatTime(currentTime) }}</span>
                <span>{{ formatTime(currentTrack.duration) }}</span>
              </div>
            </div>

            <div class="vintage-transport-row">
              <button class="btn-vintage-transport" :class="{ active: isShuffle }" @click="toggleShuffle" title="Aleatorio">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
                </svg>
              </button>

              <button class="btn-vintage-transport" @click="prevTrack" title="Anterior">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
              </button>

              <button class="btn-master-play-knob" @click="togglePlay" title="Play / Pausa">
                <div class="knob-metallic-surface">
                  <svg v-if="isPlaying" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
              </button>

              <button class="btn-vintage-transport" @click="nextTrack" title="Siguiente">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </button>

              <button class="btn-vintage-transport" :class="{ active: repeatMode !== 'off' }" @click="toggleRepeat" :title="`Repetir: ${repeatMode}`">
                <div class="repeat-container">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="17 1 21 5 17 9"></polyline>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                    <polyline points="7 23 3 19 7 15"></polyline>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                  </svg>
                  <span v-if="repeatMode === 'one'" class="repeat-number-badge">1</span>
                </div>
              </button>
            </div>

            <div class="vintage-volume-fader-bar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="fader-vol-icon">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
              <div class="fader-track-container">
                <input 
                  type="range" 
                  min="0" 
                  max="15" 
                  v-model.number="volume" 
                  @input="changeVolume" 
                  class="fader-range-slider" 
                />
              </div>
              <span class="fader-num-display">{{ volume }} <small>dB</small></span>
            </div>
          </section>
        </div>

        <!-- COLUMNA 2: CATÁLOGO, BUSCADOR & LISTA DE ÁLBUMES -->
        <div class="vintage-catalog-column">
          <section class="vintage-cue-catalog">
            <div class="vintage-search-holder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="M21 21l-4.35-4.35"></path>
              </svg>
              <input 
                type="text" 
                v-model="searchQuery" 
                placeholder="Buscar o combinar con '+' (ej. José Madero + Odisseo)..." 
              />
              <button v-if="searchQuery" class="clear-btn-vintage" @click="searchQuery = ''">✕</button>
            </div>

            <!-- Chips secundarios -->
            <div class="vintage-chips-scroll" v-if="!searchQuery && filterCategoryTab !== 'tracks' && filterCategoryTab !== 'favorites' && filterCategoryTab !== 'albums'">
              <template v-if="filterCategoryTab === 'artists'">
                <button 
                  v-for="artist in uniqueArtists" 
                  :key="artist" 
                  class="vintage-filter-chip"
                  :class="{ active: currentFilterMode === 'artist' && selectedArtist === artist }"
                  @click="setFilter('artist', artist)"
                >
                  {{ artist }}
                </button>
              </template>

              <template v-else-if="filterCategoryTab === 'playlists'">
                <button class="vintage-filter-chip btn-add-pl-chip" @click="openCreatePlaylistModal">+ Nueva Playlist</button>
                <button 
                  v-for="pl in playlists" 
                  :key="pl.id" 
                  class="vintage-filter-chip"
                  :class="{ active: currentFilterMode === 'playlist' && selectedPlaylistId === pl.id }"
                  @click="setFilter('playlist', pl.id)"
                >
                  {{ pl.name }} ({{ pl.tracks.length }})
                </button>
              </template>
            </div>

            <!-- VISTA DE LISTA DE ÁLBUMES (Miniatura izquierda compacta) -->
            <div v-if="!searchQuery && filterCategoryTab === 'albums' && !selectedAlbum" class="albums-list-container">
              <div 
                v-for="album in uniqueAlbums" 
                :key="album.name" 
                class="album-row-item"
                @click="selectAlbum(album.name)"
              >
                <div class="album-row-cover">
                  <img :src="getTrackCoverUrl(album.samplePath)" alt="Cover" @error="handleImageError" />
                </div>
                <div class="album-row-meta">
                  <span class="album-row-title">{{ album.name }}</span>
                  <span class="album-row-artist">{{ album.artist }}</span>
                </div>
                <div class="album-row-arrow">›</div>
              </div>
            </div>

            <!-- DETALLE DE ÁLBUM SELECCIONADO -->
            <div v-if="!searchQuery && filterCategoryTab === 'albums' && selectedAlbum" class="album-detail-header">
              <button class="btn-back-to-albums" @click="selectedAlbum = null">← Volver a Álbumes</button>
              <h3 class="album-detail-title">{{ selectedAlbum }}</h3>
            </div>

            <!-- Botón de Reproducción general / filtrada -->
            <button 
              v-if="(searchQuery || filterCategoryTab === 'favorites' || (filterCategoryTab === 'albums' && selectedAlbum))" 
              class="btn-vintage-play-selection"
              @click="filterCategoryTab === 'albums' && selectedAlbum ? playAllAlbumTracks() : playAllSearchResults()"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <span>Reproducir Lista ({{ searchQuery ? displayedQueue.length : (filterCategoryTab === 'favorites' ? displayedQueue.length : albumTracks.length) }} pistas)</span>
            </button>

            <!-- Lista de Canciones -->
            <ul v-if="filterCategoryTab !== 'albums' || selectedAlbum || searchQuery" class="vintage-tracklist">
              <li 
                v-for="(track, index) in (filterCategoryTab === 'albums' && selectedAlbum && !searchQuery ? albumTracks : displayedQueue)" 
                :key="track.path" 
                @click="playTrack(track)"
                :class="{ 
                  'is-active': currentTrack.path === track.path,
                  'is-top-playing': index === 0 && currentTrack.path === track.path && !searchQuery
                }"
              >
                <div class="track-row-index">
                  <span v-if="currentTrack.path === track.path" class="playing-bars">
                    <i></i><i></i><i></i>
                  </span>
                  <span v-else class="index-digit">{{ String(index + 1).padStart(2, '0') }}</span>
                </div>

                <div class="track-row-info">
                  <div class="title-and-badge">
                    <span class="track-item-title">{{ track.title }}</span>
                    <span v-if="index === 0 && currentTrack.path === track.path && !searchQuery" class="on-air-tag">SONANDO</span>
                  </div>
                  <div class="sub-item-details">
                    <span class="track-item-artist">{{ track.artist }}</span>
                    <span v-if="track.album && track.album !== 'MicroSD Audio'" class="meta-dot">•</span>
                    <span v-if="track.album && track.album !== 'MicroSD Audio'" class="track-item-album">{{ track.album }}</span>
                  </div>

                  <div v-if="track.matched_snippet" class="vintage-lyrics-badge">
                    <span>"{{ track.matched_snippet }}"</span>
                  </div>
                </div>

                <div class="track-row-duration" v-if="track.duration">
                  <span>{{ formatTime(track.duration) }}</span>
                </div>

                <div class="track-row-actions">
                  <button class="btn-track-action" @click="playNext(track, $event)" title="Reproducir a continuación">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="5" y1="6" x2="19" y2="6"></line>
                      <line x1="5" y1="12" x2="13" y2="12"></line>
                      <line x1="5" y1="18" x2="13" y2="18"></line>
                      <polyline points="16 10 19 13 16 16"></polyline>
                    </svg>
                  </button>

                  <button class="btn-track-action" @click="openAddToPlaylistModal(track, $event)" title="Agregar a Playlist">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </button>
                </div>
              </li>
            </ul>

            <div v-else-if="filterCategoryTab === 'albums' && !selectedAlbum && uniqueAlbums.length === 0" class="vintage-empty-slate">
              <p>No hay álbumes registrados en la biblioteca.</p>
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- Modales Globales -->
    <SleepTimerModal 
      :is-open="isSleepTimerModalOpen"
      :sleep-timer="sleepTimer"
      @close="isSleepTimerModalOpen = false"
      @set-timer="setSleepTimer"
      @cancel-timer="cancelSleepTimer"
    />

    <PlaylistModal 
      :is-open="isPlaylistModalOpen"
      :mode="playlistModalMode"
      :track-to-add="selectedTrackForPlaylist"
      :playlists="playlists"
      @close="isPlaylistModalOpen = false"
      @create-playlist="handleCreatePlaylist"
      @add-to-playlist="handleAddToPlaylist"
    />

    <EqualizerModal 
      :is-open="isEqualizerModalOpen"
      :eq-settings="eqSettings"
      @close="isEqualizerModalOpen = false"
      @update-eq="handleUpdateEq"
    />

    <UploaderModal 
      :is-open="isUploaderModalOpen"
      :backend-url="BACKEND_URL"
      @close="isUploaderModalOpen = false"
    />

    <LyricsModal
      :is-open="isLyricsModalOpen"
      :current-track="currentTrack"
      :current-time="currentTime"
      :cover-url="coverUrl"
      :lyrics-data="currentLyricsData"
      :sync-progress="lyricsSyncProgress"
      @close="isLyricsModalOpen = false"
      @seek="seekAudio"
      @start-sync="startBulkSync"
    />
  </div>
</template>

<style scoped>
/* =========================================================================
   1. BASE & PALETA DE COLOR VINTAGE
   ========================================================================= */
.vintage-viewport {
  position: relative;
  width: 100%;
  min-height: 100vh;
  background-color: #2b241e;
  color: #1f1c18;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Georgia, serif;
  box-sizing: border-box;
  overflow-x: hidden;
}

.vintage-chassis {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #dcd0bc;
  padding: max(12px, env(safe-area-inset-top)) 16px max(20px, env(safe-area-inset-bottom)) 16px;
  box-sizing: border-box;
  gap: 14px;
}

/* Toast Vintage */
.vintage-toast {
  position: fixed;
  top: max(14px, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  background: #1f1c18;
  border: 1.5px solid #8b2616;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45);
  padding: 8px 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 600;
  pointer-events: none;
}
.toast-amber-lamp {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 6px #f59e0b;
}
.toast-msg-text {
  font-size: 0.76rem;
  font-weight: 800;
  color: #fdfbf7;
  white-space: nowrap;
}
.toast-vintage-enter-active, .toast-vintage-leave-active { transition: all 0.22s ease-out; }
.toast-vintage-enter-from, .toast-vintage-leave-to { opacity: 0; transform: translate(-50%, -10px); }

/* =========================================================================
   2. BARRA SUPERIOR (TOOLBAR) & ACCIONES
   ========================================================================= */
.vintage-navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 2px;
}

.vintage-brand-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 900;
  letter-spacing: 1px;
  color: #8b2616;
  font-family: Impact, "Arial Black", -apple-system, sans-serif;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
}

.navbar-right-cluster {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-vintage-action {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #cfbeaa;
  border: 1.5px solid #baa88f;
  border-radius: 8px;
  color: #1f1c18;
  padding: 6px 10px;
  font-size: 0.7rem;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 2px 0 #9c8c77;
  transition: all 0.1s ease;
}
.btn-vintage-action svg { width: 14px; height: 14px; }
.btn-vintage-action:active {
  transform: translateY(2px);
  box-shadow: 0 0 0 #9c8c77;
}
.btn-vintage-action.is-active-btn {
  background: #8b2616;
  border-color: #701c0e;
  color: #ffffff;
}
.action-label { letter-spacing: 0.4px; }

/* Pestañas Pills con Alto Contraste */
.vintage-category-tabs {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.vintage-category-tabs::-webkit-scrollbar { display: none; }

.vintage-tab-pill {
  background: #cebeaa;
  border: 1.5px solid #baa88f;
  color: #1f1c18;
  font-size: 0.76rem;
  font-weight: 900;
  padding: 6px 12px;
  border-radius: 16px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}
.vintage-tab-pill.active {
  background: #8b2616;
  border-color: #8b2616;
  color: #ffffff;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(139, 38, 22, 0.3);
}

/* Grid Layout */
.vintage-main-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.vintage-deck-column { display: flex; flex-direction: column; gap: 14px; }
.vintage-catalog-column { display: flex; flex-direction: column; flex: 1; min-width: 0; }

/* =========================================================================
   3. MÓDULO DEL TOCADISCOS ANALÓGICO
   ========================================================================= */
.turntable-recessed-box {
  position: relative;
  background: #c8b9a2;
  border: 3px solid #b5a48b;
  border-radius: 26px;
  box-shadow: 
    inset 0 4px 12px rgba(0, 0, 0, 0.35),
    0 4px 8px rgba(255, 255, 255, 0.6);
  padding: 16px 16px 12px 16px;
  display: flex;
  flex-direction: column;
}

.chassis-screw {
  position: absolute;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #a89a83;
  border: 1px solid #7d715e;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.5);
}
.chassis-screw.top-left { top: 10px; left: 10px; }
.chassis-screw.top-right { top: 10px; right: 10px; }
.chassis-screw.bottom-left { bottom: 10px; left: 10px; }
.chassis-screw.bottom-right { bottom: 10px; right: 10px; }

.turntable-platter {
  position: relative;
  width: 250px;
  height: 250px;
  margin: 0 auto 10px auto;
  border-radius: 50%;
  background: #1a1a1c;
  box-shadow: 
    0 10px 24px rgba(0, 0, 0, 0.6),
    inset 0 0 0 3px #38383c,
    inset 0 0 0 6px #0c0c0e;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.strobe-rim-pattern {
  position: absolute;
  inset: 2px;
  border-radius: 50%;
  border: 2px dashed rgba(255, 255, 255, 0.2);
  pointer-events: none;
}

.vinyl-record {
  position: relative;
  width: 236px;
  height: 236px;
  border-radius: 50%;
  background: #0f1012;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: spinVinyl 12s linear infinite;
  animation-play-state: paused;
  will-change: transform;
}
.vinyl-record.is-spinning { animation-play-state: running; }

.vinyl-grooves-texture {
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: repeating-radial-gradient(
    circle at center,
    #17181c 0,
    #17181c 1.5px,
    #0c0c0e 2.5px,
    #0c0c0e 3.5px
  );
  opacity: 0.95;
  pointer-events: none;
}

.vinyl-light-sheen {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(
    from 45deg,
    rgba(255, 255, 255, 0.07) 0deg,
    transparent 65deg,
    rgba(255, 255, 255, 0.07) 130deg,
    transparent 200deg,
    rgba(255, 255, 255, 0.07) 270deg,
    transparent 330deg
  );
  pointer-events: none;
}

.vinyl-center-label {
  position: relative;
  width: 104px;
  height: 104px;
  border-radius: 50%;
  background: #f1e4d0;
  border: 3px solid #d4c2a7;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  text-align: center;
}

.label-inner-crest {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 4px;
}
.label-brand-name {
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 1px;
  color: #8b2616;
  font-family: Impact, sans-serif;
  text-transform: uppercase;
}
.label-sub-info {
  display: flex;
  gap: 8px;
  font-size: 0.42rem;
  font-weight: 800;
  color: #786c5c;
  margin: 1px 0;
}
.label-artist-name {
  font-size: 0.46rem;
  font-weight: 800;
  color: #1f1c18;
  text-transform: uppercase;
  max-width: 80px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.label-song-name {
  font-size: 0.44rem;
  font-weight: 700;
  color: #4a4237;
  max-width: 80px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.center-spindle-pin {
  position: absolute;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #1a1a1c;
  border: 2px solid #a39580;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.8);
}

@keyframes spinVinyl {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.tonearm-assembly {
  position: absolute;
  top: 15px;
  right: 12px;
  width: 45px;
  height: 140px;
  pointer-events: none;
  z-index: 5;
  transform-origin: 22px 22px;
  transform: rotate(-16deg);
  transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}
.tonearm-assembly.on-record { transform: rotate(8deg); }

.tonearm-base {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #d8cab5;
  border: 2px solid #9e8e78;
  box-shadow: 0 3px 6px rgba(0,0,0,0.4);
}
.tonearm-pivot {
  position: absolute;
  top: 13px;
  right: 13px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #5a5144;
  border: 2px solid #c9bca9;
}
.tonearm-rod {
  position: absolute;
  top: 24px;
  right: 20px;
  width: 4px;
  height: 95px;
  background: linear-gradient(to right, #cfc2ae, #948671);
  border-radius: 2px;
  box-shadow: 2px 4px 6px rgba(0,0,0,0.35);
}
.tonearm-cartridge {
  position: absolute;
  bottom: 12px;
  right: 14px;
  width: 14px;
  height: 22px;
  background: #1c1c1e;
  border: 1px solid #736754;
  border-radius: 3px;
  transform: rotate(15deg);
}
.cartridge-headshell {
  position: absolute;
  bottom: 0;
  left: 3px;
  width: 8px;
  height: 5px;
  background: #8b2616;
  border-radius: 1px;
}

.turntable-controls-bar {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  padding: 4px 8px 0 8px;
}
.potentiometer-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.potentiometer-knob {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #f1e4d0 0%, #bca98e 100%);
  border: 1.5px solid #7a6e5b;
  box-shadow: 0 3px 5px rgba(0,0,0,0.3);
  position: relative;
  transition: transform 0.1s ease;
}
.knob-notch {
  position: absolute;
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  height: 7px;
  background: #8b2616;
  border-radius: 1px;
}
.power-lamp {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #554d42;
  transition: all 0.3s ease;
}
.power-lamp.is-lit {
  background: #f59e0b;
  box-shadow: 0 0 8px #f59e0b;
}
.potentiometer-label {
  font-size: 0.65rem;
  font-weight: 900;
  color: #1f1c18;
  letter-spacing: 0.5px;
}

/* =========================================================================
   4. TARJETA DE REPRODUCCIÓN, FADER & CONTROLES TÁCTILES
   ========================================================================= */
.playback-status-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 4px;
}

.track-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.track-cover-square {
  width: 54px;
  height: 54px;
  border-radius: 8px;
  overflow: hidden;
  background: #c8b9a2;
  border: 1.5px solid #baa88f;
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
  cursor: pointer;
}
.track-cover-square img { width: 100%; height: 100%; object-fit: cover; }
.cover-art-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #786c5c;
}
.cover-art-fallback svg { width: 28px; height: 28px; }

.track-text-meta { flex: 1; min-width: 0; }
.vintage-track-title {
  margin: 0 0 2px 0;
  font-size: 1.05rem;
  font-weight: 900;
  color: #1f1c18;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vintage-track-artist {
  margin: 0 0 1px 0;
  font-size: 0.82rem;
  font-weight: 900;
  color: #8b2616;
}
.vintage-track-album {
  font-size: 0.72rem;
  font-weight: 700;
  color: #4a4237;
}

.track-fav-action { display: flex; align-items: center; gap: 6px; }
.btn-vintage-heart, .btn-vintage-dots {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-vintage-heart svg { width: 22px; height: 22px; }
.btn-vintage-heart.is-fav svg { transform: scale(1.1); }
.btn-vintage-dots svg { width: 20px; height: 20px; color: #4a4237; }

/* Barra de Progreso */
.vintage-progress-block { display: flex; flex-direction: column; gap: 4px; }
.progress-bar-track {
  width: 100%;
  height: 5px;
  background: #c5b69f;
  border-radius: 3px;
  position: relative;
  cursor: pointer;
}
.progress-bar-fill {
  height: 100%;
  background: #8b2616;
  border-radius: 3px;
  position: relative;
  transition: width 0.25s linear;
}
.progress-needle-thumb {
  position: absolute;
  right: -5px;
  top: -4px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #8b2616;
  border: 2px solid #ded2be;
  box-shadow: 0 1px 4px rgba(0,0,0,0.4);
}
.progress-timestamps {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  font-weight: 900;
  color: #1f1c18;
  font-variant-numeric: tabular-nums;
}

/* Botonera de Transporte */
.vintage-transport-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
}

.btn-vintage-transport {
  background: transparent;
  border: none;
  color: #1f1c18;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s ease;
}
.btn-vintage-transport svg { width: 22px; height: 22px; }
.btn-vintage-transport:active { transform: scale(0.9); }
.btn-vintage-transport.active { color: #8b2616; }

.repeat-container { position: relative; display: flex; align-items: center; justify-content: center; }
.repeat-number-badge {
  position: absolute;
  top: -5px;
  right: -6px;
  font-size: 0.6rem;
  font-weight: 900;
  background: #8b2616;
  color: #ffffff;
  padding: 0 3px;
  border-radius: 3px;
  line-height: 1;
}

.btn-master-play-knob {
  width: 66px;
  height: 66px;
  border-radius: 50%;
  background: #1f1c18;
  border: 2px solid #baa990;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s ease;
}
.btn-master-play-knob:active { transform: scale(0.94); }
.knob-metallic-surface {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #423c32 0%, #1e1b16 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f1e4d0;
}
.knob-metallic-surface svg { width: 26px; height: 26px; }

/* Fader de Volumen Hardware */
.vintage-volume-fader-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #cfbeaa;
  border: 1.5px solid #baa88f;
  border-radius: 12px;
  padding: 8px 14px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.15);
}
.fader-vol-icon { width: 18px; height: 18px; color: #1f1c18; flex-shrink: 0; }
.fader-track-container { flex: 1; display: flex; align-items: center; }
.fader-range-slider {
  width: 100%;
  height: 5px;
  accent-color: #8b2616;
  cursor: pointer;
}
.fader-num-display {
  font-size: 0.76rem;
  font-weight: 900;
  color: #8b2616;
  font-variant-numeric: tabular-nums;
  min-width: 38px;
  text-align: right;
}
.fader-num-display small { font-size: 0.58rem; color: #4a4237; }

/* =========================================================================
   5. CATÁLOGO, BUSCADOR & LISTA DE ÁLBUMES COMPACTOS
   ========================================================================= */
.vintage-cue-catalog {
  background: #e5dccb;
  border: 2px solid #baa88f;
  border-radius: 20px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}

.vintage-search-holder {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f1ebdE;
  border: 2px solid #baa88f;
  padding: 10px 14px;
  border-radius: 14px;
}
.vintage-search-holder svg { width: 18px; height: 18px; color: #8b2616; }
.vintage-search-holder input {
  flex: 1;
  background: transparent;
  border: none;
  color: #1f1c18;
  font-size: 0.85rem;
  font-weight: 800;
  outline: none;
}
.vintage-search-holder input::placeholder { color: #5c5346; }
.clear-btn-vintage {
  background: transparent;
  border: none;
  color: #1f1c18;
  font-size: 0.85rem;
  font-weight: 900;
  cursor: pointer;
}

.vintage-chips-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 6px;
  scrollbar-width: none;
}
.vintage-chips-scroll::-webkit-scrollbar { display: none; }

.vintage-filter-chip {
  background: #cebeaa;
  border: 1.5px solid #b8a892;
  color: #1f1c18;
  padding: 6px 14px;
  border-radius: 14px;
  font-size: 0.76rem;
  font-weight: 900;
  letter-spacing: 0.2px;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
}
.vintage-filter-chip.active {
  background: #8b2616;
  border-color: #8b2616;
  color: #ffffff;
  box-shadow: 0 2px 4px rgba(139, 38, 22, 0.3);
}

/* VISTA DE LISTA DE ÁLBUMES (Miniatura izquierda compacta de 44x44px) */
.albums-list-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 36vh;
  overflow-y: auto;
  padding-right: 4px;
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: #baa88f transparent;
}
.albums-list-container::-webkit-scrollbar { width: 5px; }
.albums-list-container::-webkit-scrollbar-thumb { background: #baa88f; border-radius: 3px; }

.album-row-item {
  background: #dcceb8;
  border: 1.5px solid transparent;
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.12s ease;
  box-sizing: border-box;
}

.album-row-item:hover {
  background: #d3c4ad;
  border-color: #baa88f;
}

.album-row-cover {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  background: #c8b9a2;
  border: 1px solid #b5a48b;
  box-shadow: 0 2px 4px rgba(0,0,0,0.15);
  flex-shrink: 0;
}

.album-row-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.album-row-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.album-row-title {
  font-size: 0.82rem;
  font-weight: 900;
  color: #1f1c18;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-row-artist {
  font-size: 0.7rem;
  font-weight: 800;
  color: #8b2616;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-row-arrow {
  font-size: 1.1rem;
  font-weight: 900;
  color: #7d7262;
  padding-right: 4px;
}

/* Cabecera de detalle de álbum seleccionado */
.album-detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}
.btn-back-to-albums {
  background: #cfbeaa;
  border: 1.5px solid #baa88f;
  border-radius: 8px;
  color: #1f1c18;
  font-size: 0.72rem;
  font-weight: 900;
  padding: 5px 10px;
  cursor: pointer;
}
.album-detail-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 900;
  color: #8b2616;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-vintage-play-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: #8b2616;
  color: #ffffff;
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 0.78rem;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 3px 6px rgba(139, 38, 22, 0.35);
}
.btn-vintage-play-selection svg { width: 16px; height: 16px; }

/* Lista de Pistas */
.vintage-tracklist {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 34vh;
}
.vintage-tracklist li {
  background: #dcceb8;
  border: 1.5px solid transparent;
  padding: 10px 12px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: all 0.12s ease;
}
.vintage-tracklist li:hover { background: #d3c4ad; }
.vintage-tracklist li.is-active {
  background: #efe7d8;
  border-color: #8b2616;
}
.vintage-tracklist li.is-top-playing { background: #f7f1e6; }

.track-row-index {
  width: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.index-digit {
  font-size: 0.74rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  color: #4a4237;
}
.vintage-tracklist li.is-active .index-digit { color: #8b2616; }

.playing-bars {
  display: flex;
  align-items: flex-end;
  gap: 1.5px;
  height: 12px;
}
.playing-bars i {
  width: 2.5px;
  background: #8b2616;
  border-radius: 1px;
  animation: barBeat 0.8s infinite ease-in-out alternate;
}
.playing-bars i:nth-child(1) { height: 35%; animation-delay: 0.1s; }
.playing-bars i:nth-child(2) { height: 100%; animation-delay: 0.3s; }
.playing-bars i:nth-child(3) { height: 65%; animation-delay: 0.2s; }
@keyframes barBeat { 0% { height: 20%; } 100% { height: 100%; } }

.track-row-info { flex: 1; min-width: 0; }
.title-and-badge { display: flex; align-items: center; gap: 6px; }
.track-item-title {
  font-size: 0.85rem;
  font-weight: 900;
  color: #1f1c18;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vintage-tracklist li.is-active .track-item-title { color: #8b2616; }

.on-air-tag {
  font-size: 0.55rem;
  font-weight: 900;
  background: #8b2616;
  color: #ffffff;
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.4px;
}

.sub-item-details { display: flex; align-items: center; gap: 4px; margin-top: 1px; }
.track-item-artist { font-size: 0.72rem; font-weight: 800; color: #4a4237; }
.meta-dot { font-size: 0.6rem; color: #7d7262; }
.track-item-album { font-size: 0.7rem; color: #5c5346; font-weight: 700; }

.vintage-lyrics-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  background: #cfbeaa;
  border-left: 2px solid #8b2616;
  padding: 3px 8px;
  border-radius: 3px;
}
.vintage-lyrics-badge span {
  font-size: 0.68rem;
  font-weight: 800;
  color: #1f1c18;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-row-duration {
  font-size: 0.74rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  color: #1f1c18;
  margin-right: 6px;
}

.track-row-actions { display: flex; align-items: center; gap: 4px; }
.btn-track-action {
  background: transparent;
  border: none;
  color: #4a4237;
  border-radius: 4px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}
.btn-track-action svg { width: 14px; height: 14px; }
.btn-track-action:hover { color: #8b2616; }

.vintage-empty-slate {
  text-align: center;
  padding: 24px 0;
  font-size: 0.8rem;
  font-weight: 800;
  color: #4a4237;
}

/* =========================================================================
   6. RESPONSIVIDAD DESKTOP (PC)
   ========================================================================= */
@media (min-width: 900px) {
  .vintage-viewport {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 30px 20px;
  }

  .vintage-chassis {
    max-width: 1280px;
    border-radius: 28px;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5), inset 0 2px 4px rgba(255, 255, 255, 0.4);
    padding: 28px 36px;
  }

  .vintage-main-grid {
    display: grid;
    grid-template-columns: 420px 1fr;
    align-items: start;
    gap: 32px;
  }

  .vintage-deck-column {
    position: sticky;
    top: 24px;
  }

  .turntable-recessed-box { padding: 24px; }
  .turntable-platter { width: 280px; height: 280px; }
  .vinyl-record { width: 265px; height: 265px; }
  .vinyl-center-label { width: 115px; height: 115px; }

  .albums-list-container {
    max-height: 62vh;
  }

  .vintage-cue-catalog { min-height: 640px; padding: 22px; }
  .vintage-tracklist { max-height: 68vh; gap: 8px; }
  .vintage-tracklist li { padding: 12px 16px; }
  .track-item-title { font-size: 0.92rem; }
  .track-item-artist { font-size: 0.78rem; }
}
</style>