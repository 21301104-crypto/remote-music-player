<!-- src/App.vue -->
<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { io } from 'socket.io-client';
import { useColorExtractor } from './composables/useColorExtractor';
import SleepTimerModal from './components/SleepTimerModal.vue';
import PlaylistModal from './components/PlaylistModal.vue';
import EqualizerModal from './components/EqualizerModal.vue';
import UploaderModal from './components/UploaderModal.vue';

const BACKEND_URL = import.meta.env.DEV
  ? `http://${window.location.hostname}:3000`
  : window.location.origin;

const socket = io(BACKEND_URL);

// Estados
const isConnected = ref(false);
const isSleepTimerModalOpen = ref(false);
const isPlaylistModalOpen = ref(false);
const isEqualizerModalOpen = ref(false);
const isUploaderModalOpen = ref(false);

const playlistModalMode = ref('create');
const selectedTrackForPlaylist = ref(null);

// Toast Notification
const toastMessage = ref('');
let toastTimer = null;
const showToast = (msg) => {
  if (toastTimer) clearTimeout(toastTimer);
  toastMessage.value = msg;
  toastTimer = setTimeout(() => {
    toastMessage.value = '';
  }, 2200);
};

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
const filterCategoryTab = ref('artists');

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
const repeatMode = ref('all');
const volume = ref(10);
const searchQuery = ref('');
const imageError = ref(false);

const { currentPalette, extractColorsFromImage } = useColorExtractor();

const themeStyleObject = computed(() => ({
  '--theme-accent': currentPalette.value.accent,
  '--theme-secondary': currentPalette.value.secondary,
  '--theme-glow': currentPalette.value.glow
}));

// Ticker de Tiempo
const playStartTime = ref(0);
const elapsedOffset = ref(0);
const currentTime = ref(0);
let progressInterval = null;

const coverUrl = computed(() => {
  if (!currentTrack.value.path || imageError.value) return null;
  return `${BACKEND_URL}/api/cover?path=${encodeURIComponent(currentTrack.value.path)}`;
});

const handleImageError = () => { imageError.value = true; };

// Acciones de Control
const playTrack = (track) => {
  imageError.value = false;
  socket.emit('play_track', track.path);
};

const playNext = (track, event) => {
  if (event) event.stopPropagation();
  socket.emit('play_next', track.path);
  showToast(`Siguiente: ${track.title}`);
};

const togglePlay = () => socket.emit('toggle_play');
const nextTrack = () => { imageError.value = false; socket.emit('next'); };
const prevTrack = () => { imageError.value = false; socket.emit('prev'); };
const toggleShuffle = () => socket.emit('toggle_shuffle');
const toggleRepeat = () => socket.emit('toggle_repeat');

const setFilter = (mode, param = null) => {
  imageError.value = false;
  if (mode === 'artist') {
    socket.emit('set_filter', { mode: 'artist', artist: param });
  } else if (mode === 'genre') {
    socket.emit('set_filter', { mode: 'genre', genre: param });
  } else if (mode === 'playlist') {
    socket.emit('set_filter', { mode: 'playlist', playlistId: param });
  } else {
    socket.emit('set_filter', { mode });
  }
};

const toggleFavorite = (trackPath, event) => {
  if (event) event.stopPropagation();
  socket.emit('toggle_favorite', trackPath);
};

const changeVolume = () => {
  socket.emit('set_volume', volume.value);
};

// Modales
const setSleepTimer = (minutes) => socket.emit('set_sleep_timer', minutes);
const cancelSleepTimer = () => socket.emit('cancel_sleep_timer');
const handleUpdateEq = (newEq) => socket.emit('set_eq', newEq);

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
  showToast('Agregada a la playlist');
};
const handleDeletePlaylist = (playlistId, event) => {
  if (event) event.stopPropagation();
  socket.emit('delete_playlist', playlistId);
};

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
  const pct = (currentTime.value / currentTrack.value.duration) * 100;
  return Math.min(Math.max(pct, 0), 100);
});

const isTrackFavorite = (path) => favorites.value.includes(path);

const uniqueArtists = computed(() => {
  const list = masterLibrary.value
    .map(t => t.artist)
    .filter(a => a && a !== 'Varios' && !/^\d+$/.test(a.trim()));
  return [...new Set(list)].sort((a, b) => a.localeCompare(b));
});

const uniqueGenres = computed(() => {
  const list = masterLibrary.value
    .map(t => t.genre)
    .filter(g => g && g !== 'Varios' && !/^\d+$/.test(g.trim()));
  return [...new Set(list)].sort((a, b) => a.localeCompare(b));
});

const displayedQueue = computed(() => {
  let list = queue.value;

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(track =>
      track.title.toLowerCase().includes(q) ||
      track.artist.toLowerCase().includes(q) ||
      (track.album && track.album.toLowerCase().includes(q)) ||
      (track.genre && track.genre.toLowerCase().includes(q))
    );
  }

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

const startProgressTicker = () => {
  if (progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (isPlaying.value && playStartTime.value > 0) {
      const liveSeconds = (Date.now() - playStartTime.value) / 1000;
      currentTime.value = Math.min(
        elapsedOffset.value + liveSeconds,
        currentTrack.value.duration || Infinity
      );
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
    selectedGenre.value = state.selectedGenre;
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
});

onUnmounted(() => {
  if (progressInterval) clearInterval(progressInterval);
});
</script>

<template>
  <div class="app-viewport" :style="themeStyleObject">
    <!-- Toast Feedback Flotante -->
    <transition name="toast-fade">
      <div v-if="toastMessage" class="toast-bubble">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>{{ toastMessage }}</span>
      </div>
    </transition>

    <!-- Contenedor Grid Responsivo -->
    <div class="app-responsive-container">

      <!-- ================================================================= -->
      <!-- COLUMNA 1: PLAYER DECK                                            -->
      <!-- ================================================================= -->
      <aside class="sidebar-panel">
        <header class="navbar">
          <div class="brand">
            <span class="brand-monogram">HI-FI</span>
            <h2>SOUND<span class="brand-accent">WAVE</span></h2>
          </div>

          <div class="header-actions">
            <!-- Botón Web Uploader -->
            <button 
              class="btn-header-icon" 
              @click="isUploaderModalOpen = true"
              title="Subir canciones a la MicroSD"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
            </button>

            <!-- Botón Ecualizador DSP -->
            <button 
              class="btn-header-icon" 
              :class="{ active: eqSettings.enabled }"
              @click="isEqualizerModalOpen = true"
              title="Ecualizador DSP"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="4" y1="21" x2="4" y2="14"></line>
                <line x1="4" y1="10" x2="4" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12" y2="3"></line>
                <line x1="20" y1="21" x2="20" y2="16"></line>
                <line x1="20" y1="12" x2="20" y2="3"></line>
              </svg>
            </button>

            <!-- Botón Sleep Timer -->
            <button 
              class="btn-header-icon" 
              :class="{ active: sleepTimer.active }"
              @click="isSleepTimerModalOpen = true"
              title="Sleep Timer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
              <span v-if="sleepTimer.active" class="timer-mini-text">{{ formatShortTimer(sleepTimer.remainingSeconds) }}</span>
            </button>

            <div class="status-pill" :class="{ connected: isConnected }">
              <span class="status-indicator"></span>
              <span class="status-text">{{ isConnected ? 'DAP' : 'OFF' }}</span>
            </div>
          </div>
        </header>

        <!-- Tarjeta del Reproductor Principal con Cover Blur -->
        <section class="player-card">
          <div class="card-blur-backdrop" v-if="coverUrl">
            <img :src="coverUrl" alt="" class="card-blur-img" />
            <div class="card-blur-vignette"></div>
          </div>

          <div class="deck-inner-content">
            <div class="deck-top-row">
              <div class="badge-group">
                <span class="deck-badge">{{ currentTrack.genre || 'HI-RES AUDIO' }}</span>
                <span v-if="eqSettings.enabled" class="deck-eq-badge">DSP: {{ eqSettings.preset.toUpperCase() }}</span>
              </div>
              <button 
                v-if="currentTrack.path"
                class="fav-deck-btn"
                :class="{ is_active: isTrackFavorite(currentTrack.path) }"
                @click="toggleFavorite(currentTrack.path, $event)"
              >
                <svg viewBox="0 0 24 24" :fill="isTrackFavorite(currentTrack.path) ? '#ef4444' : 'none'" stroke="#ef4444" stroke-width="2">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              </button>
            </div>

            <div class="cover-container">
              <img 
                v-if="coverUrl" 
                :src="coverUrl" 
                alt="Cover" 
                class="cover-art"
                @error="handleImageError"
              />
              <div v-else class="cover-fallback">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="12" cy="12" r="10"></circle>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </div>
            </div>

            <!-- Metadatos ID3 -->
            <div class="track-meta-center">
              <h3 class="track-title-main">{{ currentTrack.title || 'Pista no seleccionada' }}</h3>
              <p class="track-artist-main">{{ currentTrack.artist || 'Elige una canción' }}</p>
              <span v-if="currentTrack.album" class="track-album-main">{{ currentTrack.album }}</span>
            </div>

            <!-- Barra de Progreso -->
            <div class="progress-box">
              <div class="progress-track">
                <div class="progress-fill" :style="{ width: `${progressPercent}%` }">
                  <div class="progress-thumb"></div>
                </div>
              </div>
              <div class="progress-times">
                <span>{{ formatTime(currentTime) }}</span>
                <span>{{ formatTime(currentTrack.duration) }}</span>
              </div>
            </div>

            <!-- Botonera -->
            <div class="controls-deck">
              <button 
                class="btn-deck-action" 
                :class="{ active: isShuffle }" 
                @click="toggleShuffle"
                title="Modo Aleatorio"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
                </svg>
              </button>

              <button class="btn-deck-skip" @click="prevTrack" title="Anterior">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
              </button>

              <button class="btn-deck-play" @click="togglePlay" title="Play/Pausa">
                <svg v-if="isPlaying" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </button>

              <button class="btn-deck-skip" @click="nextTrack" title="Siguiente">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </button>

              <button 
                class="btn-deck-action btn-repeat" 
                :class="{ active: repeatMode !== 'off' }" 
                @click="toggleRepeat"
                :title="`Modo Repetir: ${repeatMode}`"
              >
                <div class="repeat-icon-box">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="17 1 21 5 17 9"></polyline>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                    <polyline points="7 23 3 19 7 15"></polyline>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                  </svg>
                  <span v-if="repeatMode === 'one'" class="repeat-badge-one">1</span>
                </div>
              </button>
            </div>

            <!-- Hardware Volume -->
            <div class="hardware-volume">
              <span class="vol-label">VOL</span>
              <input 
                type="range" 
                min="0" 
                max="15" 
                v-model.number="volume" 
                @input="changeVolume"
                class="hw-slider"
              />
              <span class="hw-vol-num">{{ volume }}</span>
            </div>
          </div>
        </section>
      </aside>

      <!-- ================================================================= -->
      <!-- COLUMNA 2: EXPLORADOR & COLA                                      -->
      <!-- ================================================================= -->
      <main class="main-content-panel">
        <div class="category-toggle">
          <button 
            class="toggle-tab" 
            :class="{ active: filterCategoryTab === 'artists' }" 
            @click="filterCategoryTab = 'artists'"
          >
            ARTISTAS ({{ uniqueArtists.length }})
          </button>
          <button 
            class="toggle-tab" 
            :class="{ active: filterCategoryTab === 'playlists' }" 
            @click="filterCategoryTab = 'playlists'"
          >
            PLAYLISTS ({{ playlists.length }})
          </button>
          <button 
            class="toggle-tab" 
            :class="{ active: filterCategoryTab === 'genres' }" 
            @click="filterCategoryTab = 'genres'"
          >
            GÉNEROS ({{ uniqueGenres.length }})
          </button>
        </div>

        <nav class="filter-strip">
          <button 
            class="tab-btn" 
            :class="{ active: currentFilterMode === 'all' }" 
            @click="setFilter('all')"
          >
            <span>Todos</span>
            <small>{{ masterLibrary.length }}</small>
          </button>

          <button 
            class="tab-btn tab-fav" 
            :class="{ active: currentFilterMode === 'favorites' }" 
            @click="setFilter('favorites')"
          >
            <svg class="tab-fav-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <span>Favoritos</span>
            <small>{{ favorites.length }}</small>
          </button>

          <!-- ARTISTAS -->
          <template v-if="filterCategoryTab === 'artists'">
            <button 
              v-for="artist in uniqueArtists" 
              :key="artist"
              class="tab-btn"
              :class="{ active: currentFilterMode === 'artist' && selectedArtist === artist }"
              @click="setFilter('artist', artist)"
            >
              <span>{{ artist }}</span>
            </button>
          </template>

          <!-- PLAYLISTS -->
          <template v-else-if="filterCategoryTab === 'playlists'">
            <button class="tab-btn btn-new-pl" @click="openCreatePlaylistModal">
              <span>➕ Nueva</span>
            </button>
            <button 
              v-for="pl in playlists" 
              :key="pl.id"
              class="tab-btn tab-pl-item"
              :class="{ active: currentFilterMode === 'playlist' && selectedPlaylistId === pl.id }"
              @click="setFilter('playlist', pl.id)"
            >
              <span>{{ pl.name }}</span>
              <small>{{ pl.tracks.length }}</small>
              <span class="btn-del-pl" @click="handleDeletePlaylist(pl.id, $event)">✕</span>
            </button>
          </template>

          <!-- GÉNEROS -->
          <template v-else>
            <button 
              v-for="genre in uniqueGenres" 
              :key="genre"
              class="tab-btn"
              :class="{ active: currentFilterMode === 'genre' && selectedGenre === genre }"
              @click="setFilter('genre', genre)"
            >
              <span>{{ genre }}</span>
            </button>
          </template>
        </nav>

        <!-- Cola de Reproducción -->
        <section class="queue-card">
          <div class="queue-header">
            <div class="queue-header-left">
              <h4>COLA DE REPRODUCCIÓN</h4>
              <span class="queue-count">{{ displayedQueue.length }} pistas</span>
            </div>

            <div class="search-bar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="M21 21l-4.35-4.35"></path>
              </svg>
              <input 
                type="text" 
                v-model="searchQuery" 
                placeholder="Buscar pista, artista o álbum..." 
              />
            </div>
          </div>

          <ul v-if="displayedQueue.length > 0" class="track-queue">
            <li 
              v-for="(track, index) in displayedQueue" 
              :key="track.id" 
              @click="playTrack(track)"
              :class="{ 
                'is-active': currentTrack.path === track.path, 
                'is-top-now': index === 0 && currentTrack.path === track.path 
              }"
            >
              <div class="track-info">
                <div class="title-row">
                  <span class="track-name">{{ track.title }}</span>
                  <span v-if="index === 0 && currentTrack.path === track.path" class="now-badge">
                    REPRODUCIENDO
                  </span>
                </div>
                <div class="sub-row">
                  <span class="track-artist-text">{{ track.artist }}</span>
                  <span v-if="track.album && track.album !== 'MicroSD Audio'" class="track-album-text">• {{ track.album }}</span>
                  <span v-if="track.genre && track.genre !== 'Varios'" class="track-genre-tag">• {{ track.genre }}</span>
                </div>
              </div>

              <div class="desktop-duration" v-if="track.duration">
                <span>{{ formatTime(track.duration) }}</span>
              </div>

              <div class="item-actions">
                <!-- Botón: REPRODUCIR A CONTINUACIÓN (Play Next) -->
                <button 
                  class="btn-play-next" 
                  @click="playNext(track, $event)"
                  title="Reproducir a continuación"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="5" y1="6" x2="19" y2="6"></line>
                    <line x1="5" y1="12" x2="13" y2="12"></line>
                    <line x1="5" y1="18" x2="13" y2="18"></line>
                    <polyline points="16 10 19 13 16 16"></polyline>
                  </svg>
                </button>

                <!-- Botón: AGREGAR A PLAYLIST -->
                <button class="btn-add-pl" @click="openAddToPlaylistModal(track, $event)" title="Agregar a Playlist">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>

                <!-- Botón: FAVORITOS -->
                <button class="btn-fav-item" @click="toggleFavorite(track.path, $event)">
                  <svg viewBox="0 0 24 24" :fill="isTrackFavorite(track.path) ? '#ef4444' : 'none'" stroke="#ef4444" stroke-width="2">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                </button>

                <div class="bars-anim" v-if="currentTrack.path === track.path">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </li>
          </ul>
          <div v-else class="empty-msg">No se encontraron pistas con este criterio.</div>
        </section>
      </main>
    </div>

    <!-- Modales -->
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
  </div>
</template>

<style scoped>
.app-viewport {
  position: relative;
  width: 100%;
  min-height: 100vh;
  background-color: #030712;
  color: #f3f4f6;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
  box-sizing: border-box;
}

/* Toast Bubble */
.toast-bubble {
  position: fixed;
  top: max(16px, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid var(--theme-accent, #38bdf8);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  padding: 8px 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 300;
  pointer-events: none;
}
.toast-bubble svg {
  width: 16px;
  height: 16px;
  color: var(--theme-accent, #38bdf8);
}
.toast-bubble span {
  font-size: 0.78rem;
  font-weight: 700;
  color: #f8fafc;
  white-space: nowrap;
}
.toast-fade-enter-active, .toast-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.toast-fade-enter-from, .toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -15px);
}

/* Layout Responsivo */
.app-responsive-container {
  width: 100%;
  max-width: 390px;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: max(14px, env(safe-area-inset-top)) 16px max(20px, env(safe-area-inset-bottom)) 16px;
  box-sizing: border-box;
  gap: 12px;
}

.sidebar-panel {
  display: flex;
  flex-direction: column;
}

.main-content-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

/* Navbar */
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}
.brand-monogram {
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 0.6rem;
  font-weight: 900;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.5px;
  color: var(--theme-accent, #38bdf8);
}
.navbar h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 900;
  letter-spacing: 0.5px;
}
.brand-accent { color: var(--theme-accent, #38bdf8); }

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-header-icon {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(17, 24, 39, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #9ca3af;
  padding: 5px 8px;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-header-icon svg { width: 14px; height: 14px; }
.btn-header-icon.active {
  border-color: var(--theme-accent, #38bdf8);
  color: var(--theme-accent, #38bdf8);
  background: rgba(56, 189, 248, 0.1);
}
.timer-mini-text {
  font-size: 0.65rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.status-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(17, 24, 39, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 5px 8px;
  border-radius: 14px;
}
.status-indicator {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ef4444;
}
.status-pill.connected .status-indicator {
  background: var(--theme-accent, #38bdf8);
}
.status-text {
  font-size: 0.65rem;
  font-weight: 800;
  color: #9ca3af;
}

/* Category Tabs */
.category-toggle {
  display: flex;
  background: rgba(17, 24, 39, 0.7);
  padding: 3px;
  border-radius: 10px;
  margin-bottom: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.toggle-tab {
  flex: 1;
  background: transparent;
  border: none;
  color: #9ca3af;
  padding: 6px 0;
  border-radius: 7px;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.4px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.toggle-tab.active {
  background: rgba(255, 255, 255, 0.12);
  color: var(--theme-accent, #38bdf8);
}

/* Filters Strip */
.filter-strip {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 8px;
  margin-bottom: 10px;
  scrollbar-width: none;
}
.filter-strip::-webkit-scrollbar { display: none; }
.tab-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(17, 24, 39, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #9ca3af;
  padding: 5px 10px;
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
}
.tab-btn small {
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.62rem;
}
.tab-btn.active {
  background: var(--theme-accent, #38bdf8);
  color: #030712;
  border-color: var(--theme-accent, #38bdf8);
  font-weight: 800;
}
.tab-fav.active {
  background: #dc2626;
  border-color: #ef4444;
  color: #fff;
}
.tab-fav-icon { width: 11px; height: 11px; }

.btn-new-pl { border-style: dashed; border-color: var(--theme-accent, #38bdf8); color: var(--theme-accent, #38bdf8); }
.tab-pl-item { position: relative; padding-right: 24px; }
.btn-del-pl { position: absolute; right: 5px; top: 50%; transform: translateY(-50%); font-size: 0.6rem; color: #ef4444; }

/* Reproductor Deck */
.player-card {
  position: relative;
  overflow: hidden;
  background: #0b0f19;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
}

.card-blur-backdrop {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
}
.card-blur-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(35px) brightness(0.38) saturate(180%);
  transform: scale(1.35);
  transition: all 0.6s ease;
}
.card-blur-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, rgba(11, 15, 25, 0.3) 0%, rgba(3, 7, 18, 0.85) 100%);
}

.deck-inner-content {
  position: relative;
  z-index: 2;
  padding: 14px 16px;
}

.deck-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.badge-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.deck-badge {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.6px;
  color: #d1d5db;
  text-transform: uppercase;
  background: rgba(0, 0, 0, 0.4);
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.deck-eq-badge {
  font-size: 0.62rem;
  font-weight: 800;
  color: var(--theme-accent, #38bdf8);
  background: rgba(56, 189, 248, 0.15);
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--theme-accent, #38bdf8);
}

.fav-deck-btn {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 50%;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.fav-deck-btn svg { width: 16px; height: 16px; }

.cover-container {
  width: 165px;
  height: 165px;
  margin: 0 auto 12px auto;
}
.cover-art {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 16px;
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.cover-fallback {
  width: 100%;
  height: 100%;
  background: #0b0f19;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(255, 255, 255, 0.15);
}
.cover-fallback svg { width: 50px; height: 50px; color: #4b5563; }

.track-meta-center {
  text-align: center;
  margin-bottom: 12px;
}
.track-title-main {
  margin: 0 0 2px 0;
  font-size: 1.05rem;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 2px 4px rgba(0,0,0,0.6);
}
.track-artist-main {
  margin: 0 0 2px 0;
  font-size: 0.85rem;
  color: var(--theme-accent, #38bdf8);
  font-weight: 700;
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
}
.track-album-main {
  font-size: 0.7rem;
  color: #9ca3af;
}

/* Timeline */
.progress-box { margin-bottom: 12px; }
.progress-track {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  position: relative;
}
.progress-fill {
  height: 100%;
  background: var(--theme-accent, #38bdf8);
  border-radius: 2px;
  position: relative;
  transition: width 0.25s linear;
}
.progress-thumb {
  position: absolute;
  right: -3px;
  top: -3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 6px rgba(0,0,0,0.5);
}
.progress-times {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: #d1d5db;
  margin-top: 5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/* Controles */
.controls-deck {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 0 4px;
}
.btn-deck-action {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-deck-action svg { width: 16px; height: 16px; }
.btn-deck-action.active {
  background: var(--theme-accent, #38bdf8);
  color: #030712;
}

.repeat-icon-box {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.repeat-badge-one {
  position: absolute;
  top: -6px;
  right: -6px;
  font-size: 0.6rem;
  font-weight: 900;
  background: #030712;
  color: var(--theme-accent, #38bdf8);
  padding: 0 3px;
  border-radius: 4px;
  line-height: 1;
}
.btn-deck-action.active .repeat-badge-one {
  background: #ffffff;
  color: #030712;
}

.btn-deck-skip {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #f3f4f6;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.btn-deck-skip svg { width: 18px; height: 18px; }

.btn-deck-play {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: var(--theme-accent, #38bdf8);
  color: #030712;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
}
.btn-deck-play svg { width: 24px; height: 24px; }

.hardware-volume {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.45);
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.vol-label { font-size: 0.65rem; font-weight: 900; color: #9ca3af; }
.hw-slider { flex: 1; height: 3px; accent-color: var(--theme-accent, #38bdf8); cursor: pointer; }
.hw-vol-num { font-size: 0.7rem; font-weight: 800; color: var(--theme-accent, #38bdf8); width: 14px; text-align: right; }

/* Cola Card */
.queue-card {
  flex: 1;
  background: rgba(17, 24, 39, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 22px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.queue-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}
.queue-header-left h4 { margin: 0; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.4px; }
.queue-count { font-size: 0.65rem; color: #6b7280; font-weight: 600; }

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(11, 15, 25, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 6px 10px;
  border-radius: 8px;
}
.search-bar svg { width: 13px; height: 13px; color: #6b7280; }
.search-bar input { flex: 1; background: transparent; border: none; color: #f3f4f6; font-size: 0.75rem; outline: none; }

.track-queue {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 25vh;
}
.track-queue li {
  background: rgba(11, 15, 25, 0.5);
  padding: 8px 10px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}
.track-queue li.is-active {
  border-color: var(--theme-accent, #38bdf8);
  background: rgba(255, 255, 255, 0.05);
}
.track-queue li.is-top-now {
  background: rgba(56, 189, 248, 0.08);
}

.track-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding-right: 8px;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.track-name {
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track-queue li.is-active .track-name {
  color: var(--theme-accent, #38bdf8);
}
.now-badge {
  font-size: 0.55rem;
  font-weight: 900;
  color: #030712;
  background: var(--theme-accent, #38bdf8);
  padding: 1px 4px;
  border-radius: 3px;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

.sub-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 1px;
}
.track-artist-text { font-size: 0.68rem; color: #9ca3af; }
.track-album-text { font-size: 0.65rem; color: #6b7280; }
.track-genre-tag { font-size: 0.65rem; color: var(--theme-accent, #38bdf8); font-weight: 600; }

.desktop-duration {
  display: none;
  font-size: 0.72rem;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
  margin-right: 14px;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Botón Reproducir a Continuación */
.btn-play-next {
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease, transform 0.1s ease;
}
.btn-play-next:hover, .btn-play-next:active {
  color: var(--theme-accent, #38bdf8);
  transform: scale(1.15);
}
.btn-play-next svg { width: 15px; height: 15px; }

.btn-add-pl {
  background: transparent;
  border: none;
  color: #6b7280;
  cursor: pointer;
  padding: 2px;
}
.btn-add-pl svg { width: 14px; height: 14px; }
.btn-fav-item {
  background: transparent;
  border: none;
  padding: 2px;
  cursor: pointer;
}
.btn-fav-item svg { width: 13px; height: 13px; }

.bars-anim {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 10px;
}
.bars-anim span {
  width: 2px;
  background: var(--theme-accent, #38bdf8);
  border-radius: 1px;
  animation: jump 0.8s infinite ease-in-out alternate;
}
.bars-anim span:nth-child(1) { height: 35%; animation-delay: 0.1s; }
.bars-anim span:nth-child(2) { height: 100%; animation-delay: 0.3s; }
.bars-anim span:nth-child(3) { height: 60%; animation-delay: 0.2s; }

@keyframes jump {
  0% { height: 20%; }
  100% { height: 100%; }
}

.empty-msg { text-align: center; color: #6b7280; font-size: 0.75rem; padding: 14px 0; }

/* ==========================================================================
   DESKTOP STUDIO LAYOUT (>= 900px)
   ========================================================================== */
@media (min-width: 900px) {
  .app-responsive-container {
    max-width: 1350px;
    padding: 24px 32px;
    display: grid;
    grid-template-columns: 380px 1fr;
    align-items: start;
    gap: 28px;
  }

  .sidebar-panel {
    position: sticky;
    top: 24px;
  }

  .player-card {
    border-radius: 28px;
  }

  .cover-container {
    width: 210px;
    height: 210px;
    margin: 0 auto 16px auto;
  }

  .track-title-main {
    font-size: 1.25rem;
  }

  .track-artist-main {
    font-size: 0.95rem;
  }

  .queue-card {
    border-radius: 28px;
    padding: 20px 24px;
    min-height: 600px;
  }

  .queue-header {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .search-bar {
    width: 320px;
    padding: 8px 14px;
  }
  .search-bar input {
    font-size: 0.85rem;
  }

  .track-queue {
    max-height: 68vh;
    gap: 8px;
  }

  .track-queue li {
    padding: 12px 16px;
    border-radius: 12px;
  }
  .track-queue li:hover {
    background: rgba(30, 41, 59, 0.5);
  }

  .track-name {
    font-size: 0.9rem;
  }

  .track-artist-text {
    font-size: 0.78rem;
  }

  .track-album-text {
    font-size: 0.75rem;
  }

  .desktop-duration {
    display: block;
  }
}
</style>