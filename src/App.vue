<!-- src/App.vue -->
<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { io } from 'socket.io-client';
import { useColorExtractor } from './composables/useColorExtractor';
import SleepTimerModal from './components/SleepTimerModal.vue';
import PlaylistModal from './components/PlaylistModal.vue';

const BACKEND_URL = import.meta.env.DEV
  ? `http://${window.location.hostname}:3000`
  : window.location.origin;

const socket = io(BACKEND_URL);

// Estados Sincronizados
const isConnected = ref(false);
const isSleepTimerModalOpen = ref(false);
const isPlaylistModalOpen = ref(false);
const playlistModalMode = ref('create');
const selectedTrackForPlaylist = ref(null);

const sleepTimer = ref({ active: false, remainingSeconds: 0 });
const masterLibrary = ref([]);
const queue = ref([]);
const favorites = ref([]);
const playlists = ref([]);
const currentFilterMode = ref('all');
const selectedArtist = ref(null);
const selectedGenre = ref(null);
const selectedPlaylistId = ref(null);
const filterCategoryTab = ref('playlists');

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
const volume = ref(10);
const searchQuery = ref('');
const imageError = ref(false);

// Extractor de Color Dinámico
const { currentPalette, extractColorsFromImage } = useColorExtractor();

const themeStyleObject = computed(() => ({
  '--theme-accent': currentPalette.value.accent,
  '--theme-secondary': currentPalette.value.secondary,
  '--theme-glow': currentPalette.value.glow,
  '--theme-bg': currentPalette.value.bgGradient
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

// Acciones de Reproducción
const playTrack = (track) => {
  imageError.value = false;
  socket.emit('play_track', track.path);
};

const togglePlay = () => socket.emit('toggle_play');
const nextTrack = () => { imageError.value = false; socket.emit('next'); };
const prevTrack = () => { imageError.value = false; socket.emit('prev'); };
const toggleShuffle = () => socket.emit('toggle_shuffle');

// Manejo de Filtros
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

// Acciones Sleep Timer
const setSleepTimer = (minutes) => socket.emit('set_sleep_timer', minutes);
const cancelSleepTimer = () => socket.emit('cancel_sleep_timer');

// Acciones Playlists
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

const handleCreatePlaylist = (name) => {
  socket.emit('create_playlist', name);
};

const handleAddToPlaylist = ({ playlistId, trackPath }) => {
  socket.emit('add_to_playlist', { playlistId, trackPath });
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
  const list = masterLibrary.value.map(t => t.artist).filter(Boolean);
  return [...new Set(list)].sort();
});

const uniqueGenres = computed(() => {
  const list = masterLibrary.value.map(t => t.genre).filter(g => g && g !== 'Varios');
  return [...new Set(list)].sort();
});

// =========================================================================
// MEJORA UX: COLA CON LA CANCIÓN ACTIVA SIEMPRE EN LA POSICIÓN 0
// =========================================================================
const displayedQueue = computed(() => {
  let list = queue.value;

  // 1. Filtrado por término de búsqueda si existe
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(track =>
      track.title.toLowerCase().includes(q) ||
      track.artist.toLowerCase().includes(q) ||
      (track.genre && track.genre.toLowerCase().includes(q))
    );
  }

  // 2. Si no hay canción en reproducción o la lista tiene 1 elemento, retornar tal cual
  if (!currentTrack.value.path || list.length <= 1) {
    return list;
  }

  // 3. Buscar si la canción activa está presente en la lista actual
  const activeIndex = list.findIndex(t => t.path === currentTrack.value.path);

  if (activeIndex === -1) {
    // Si la búsqueda la filtró, mostramos los resultados del filtro sin alterar
    return list;
  }

  // 4. Extraer la canción activa y posicionarla al inicio (Índice 0)
  const activeItem = list[activeIndex];
  const otherItems = list.filter((_, idx) => idx !== activeIndex);

  return [activeItem, ...otherItems];
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
    <!-- Navbar Header -->
    <header class="navbar">
      <div class="brand">
        <div class="brand-glow"></div>
        <svg class="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>
        <h2>SOUND<span class="brand-accent">WAVE</span></h2>
      </div>

      <div class="header-actions">
        <button 
          class="btn-sleep-timer" 
          :class="{ active: sleepTimer.active }"
          @click="isSleepTimerModalOpen = true"
          title="Temporizador de apagado"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
          <span v-if="sleepTimer.active" class="timer-mini-text">{{ formatShortTimer(sleepTimer.remainingSeconds) }}</span>
        </button>

        <div class="status-pill" :class="{ connected: isConnected }">
          <span class="status-indicator"></span>
          <span class="status-text">{{ isConnected ? 'REMOTE' : 'OFF' }}</span>
        </div>
      </div>
    </header>

    <!-- Selector de Categorías -->
    <div class="category-toggle">
      <button 
        class="toggle-tab" 
        :class="{ active: filterCategoryTab === 'playlists' }" 
        @click="filterCategoryTab = 'playlists'"
      >
        PLAYLISTS
      </button>
      <button 
        class="toggle-tab" 
        :class="{ active: filterCategoryTab === 'genres' }" 
        @click="filterCategoryTab = 'genres'"
      >
        GÉNEROS
      </button>
      <button 
        class="toggle-tab" 
        :class="{ active: filterCategoryTab === 'artists' }" 
        @click="filterCategoryTab = 'artists'"
      >
        ARTISTAS
      </button>
    </div>

    <!-- Barra de Filtros Strip -->
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

      <!-- Pestaña PLAYLISTS -->
      <template v-if="filterCategoryTab === 'playlists'">
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
          <span class="btn-del-pl" @click="handleDeletePlaylist(pl.id, $event)" title="Eliminar lista">✕</span>
        </button>
      </template>

      <!-- Pestaña GÉNEROS -->
      <template v-else-if="filterCategoryTab === 'genres'">
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

      <!-- Pestaña ARTISTAS -->
      <template v-else>
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
    </nav>

    <!-- Reproductor Principal -->
    <section class="player-card">
      <div class="cover-wrapper">
        <div class="ambient-glow" :style="{ opacity: isPlaying ? '0.7' : '0.2' }"></div>

        <img 
          v-if="coverUrl" 
          :src="coverUrl" 
          alt="Cover" 
          class="cover-art"
          @error="handleImageError"
        />
        <div v-else class="cover-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor"/>
            <circle cx="12" cy="12" r="4" stroke="currentColor"/>
            <path d="M12 8v4l3 3"/>
          </svg>
        </div>

        <button 
          v-if="currentTrack.path"
          class="fav-toggle-btn"
          :class="{ is_active: isTrackFavorite(currentTrack.path) }"
          @click="toggleFavorite(currentTrack.path, $event)"
        >
          <svg viewBox="0 0 24 24" :fill="isTrackFavorite(currentTrack.path) ? '#ef4444' : 'none'" stroke="#ef4444" stroke-width="2">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
      </div>

      <!-- Metadatos -->
      <div class="meta-container">
        <h3 class="meta-title">{{ currentTrack.title || 'Pista no seleccionada' }}</h3>
        <p class="meta-artist">{{ currentTrack.artist || 'Toca una canción de la cola' }}</p>
        <span v-if="currentTrack.album" class="meta-album">{{ currentTrack.album }}</span>
      </div>

      <!-- Barra de Progreso -->
      <div class="progress-container">
        <div class="progress-rail">
          <div class="progress-bar" :style="{ width: `${progressPercent}%` }">
            <div class="progress-glow-dot"></div>
          </div>
        </div>
        <div class="timestamp-row">
          <span>{{ formatTime(currentTime) }}</span>
          <span>{{ formatTime(currentTrack.duration) }}</span>
        </div>
      </div>

      <!-- Controles -->
      <div class="control-panel">
        <button 
          class="btn-action btn-shuffle" 
          :class="{ active: isShuffle }" 
          @click="toggleShuffle"
          title="Aleatorio"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
          </svg>
        </button>

        <button class="btn-action btn-prev" @click="prevTrack" title="Anterior">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
          </svg>
        </button>

        <button class="btn-play-hero" @click="togglePlay" title="Play/Pausa">
          <svg v-if="isPlaying" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>

        <button class="btn-action btn-next" @click="nextTrack" title="Siguiente">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
          </svg>
        </button>

        <div class="btn-placeholder"></div>
      </div>

      <!-- Slider de Volumen -->
      <div class="volume-dock">
        <svg class="vol-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 5L6 9H2v6h4l5 4V5z"/>
        </svg>
        <input 
          type="range" 
          min="0" 
          max="15" 
          v-model.number="volume" 
          @input="changeVolume"
          class="vol-slider"
        />
        <svg class="vol-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
        <span class="vol-level">{{ volume }}</span>
      </div>
    </section>

    <!-- Cola Activa Priorizada -->
    <section class="queue-card">
      <div class="queue-header">
        <div class="queue-title-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
          </svg>
          <h4>COLA ACTIVA</h4>
        </div>
        <span class="queue-count">{{ displayedQueue.length }} pistas</span>
      </div>

      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="M21 21l-4.35-4.35"></path>
        </svg>
        <input 
          type="text" 
          v-model="searchQuery" 
          placeholder="Buscar pista, artista o lista..." 
        />
      </div>

      <ul v-if="displayedQueue.length > 0" class="track-queue">
        <li 
          v-for="(track, index) in displayedQueue" 
          :key="track.id" 
          @click="playTrack(track)"
          :class="{ 'is-playing': currentTrack.path === track.path, 'is-top-active': index === 0 && currentTrack.path === track.path }"
        >
          <div class="track-meta">
            <div class="title-badge-row">
              <span class="item-title">{{ track.title }}</span>
              <span v-if="index === 0 && currentTrack.path === track.path" class="now-playing-badge">
                EN REPRODUCCIÓN
              </span>
            </div>
            <div class="item-sub">
              <span class="item-artist">{{ track.artist }}</span>
              <span class="item-genre-tag" v-if="track.genre && track.genre !== 'Varios'">• {{ track.genre }}</span>
            </div>
          </div>

          <div class="item-controls">
            <!-- Botón Agregar a Playlist -->
            <button 
              class="item-btn-icon" 
              @click="openAddToPlaylistModal(track, $event)"
              title="Agregar a playlist"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>

            <!-- Botón Favorito -->
            <button 
              class="item-fav-btn" 
              @click="toggleFavorite(track.path, $event)"
            >
              <svg viewBox="0 0 24 24" :fill="isTrackFavorite(track.path) ? '#ef4444' : 'none'" stroke="#ef4444" stroke-width="2">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </button>

            <div class="playing-bars" v-if="currentTrack.path === track.path">
              <span></span><span></span><span></span>
            </div>
          </div>
        </li>
      </ul>
      <div v-else class="empty-state">
        <p>No se encontraron canciones.</p>
      </div>
    </section>

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
  </div>
</template>

<style scoped>
.app-viewport {
  width: 100%;
  max-width: 390px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--theme-bg, radial-gradient(circle at top, #0f172a 0%, #060913 100%));
  color: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
  display: flex;
  flex-direction: column;
  padding: max(16px, env(safe-area-inset-top)) 16px max(20px, env(safe-area-inset-bottom)) 16px;
  box-sizing: border-box;
  transition: background 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

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
  position: relative;
}
.brand-glow {
  position: absolute;
  width: 24px;
  height: 24px;
  background: var(--theme-accent, #38bdf8);
  filter: blur(14px);
  opacity: 0.6;
  transition: background 0.6s ease;
}
.brand-icon {
  width: 22px;
  height: 22px;
  color: var(--theme-accent, #38bdf8);
  transition: color 0.6s ease;
}
.navbar h2 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 900;
  letter-spacing: 1px;
  color: #f8fafc;
}
.brand-accent {
  color: var(--theme-accent, #38bdf8);
  transition: color 0.6s ease;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-sleep-timer {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  padding: 5px 10px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.btn-sleep-timer svg { width: 14px; height: 14px; }
.btn-sleep-timer.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: var(--theme-accent, #38bdf8);
  color: var(--theme-accent, #38bdf8);
  box-shadow: 0 0 10px var(--theme-glow, rgba(56, 189, 248, 0.3));
}
.timer-mini-text {
  font-size: 0.7rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.status-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 5px 10px;
  border-radius: 20px;
}
.status-pill.connected {
  border-color: var(--theme-accent, #38bdf8);
  box-shadow: 0 0 10px var(--theme-glow, rgba(56, 189, 248, 0.15));
}
.status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
}
.status-pill.connected .status-indicator {
  background: var(--theme-accent, #38bdf8);
  box-shadow: 0 0 6px var(--theme-accent, #38bdf8);
}
.status-text {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #94a3b8;
}

.category-toggle {
  display: flex;
  gap: 6px;
  background: rgba(15, 23, 42, 0.7);
  padding: 4px;
  border-radius: 12px;
  margin-bottom: 10px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.toggle-tab {
  flex: 1;
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 6px 0;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.toggle-tab.active {
  background: rgba(255, 255, 255, 0.1);
  color: var(--theme-accent, #38bdf8);
}

.filter-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;
  margin-bottom: 12px;
  scrollbar-width: none;
}
.filter-strip::-webkit-scrollbar { display: none; }
.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  padding: 6px 12px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s ease;
}
.tab-btn small {
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 0.65rem;
}
.tab-btn.active {
  background: var(--theme-accent, #38bdf8);
  color: #060913;
  border-color: var(--theme-accent, #38bdf8);
  font-weight: 800;
  box-shadow: 0 0 12px var(--theme-glow, rgba(56, 189, 248, 0.5));
}
.tab-fav.active {
  background: #dc2626;
  border-color: #ef4444;
  color: #fff;
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.5);
}
.tab-fav-icon { width: 12px; height: 12px; }

.btn-new-pl {
  border-style: dashed;
  border-color: var(--theme-accent, #38bdf8);
  color: var(--theme-accent, #38bdf8);
}
.tab-pl-item {
  position: relative;
  padding-right: 28px;
}
.btn-del-pl {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.65rem;
  color: #ef4444;
  padding: 2px 4px;
  border-radius: 4px;
}

.player-card {
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(25px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.7);
}

.cover-wrapper {
  position: relative;
  width: 170px;
  height: 170px;
  margin: 0 auto 12px auto;
}
.ambient-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, var(--theme-accent, #38bdf8) 0%, transparent 80%);
  filter: blur(24px);
  border-radius: 20px;
  transition: background 0.8s ease, opacity 0.3s ease;
}
.cover-art {
  position: relative;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.cover-placeholder {
  position: relative;
  width: 100%;
  height: 100%;
  background: #090e1a;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(255, 255, 255, 0.15);
}
.cover-placeholder svg {
  width: 50px;
  height: 50px;
  color: var(--theme-accent, #38bdf8);
}

.fav-toggle-btn {
  position: absolute;
  right: -6px;
  bottom: -6px;
  background: #090e1a;
  border: 1px solid rgba(239, 68, 68, 0.4);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  transition: transform 0.15s ease;
}
.fav-toggle-btn:active { transform: scale(1.15); }
.fav-toggle-btn svg { width: 18px; height: 18px; }

.meta-container {
  text-align: center;
  margin-bottom: 12px;
}
.meta-title {
  margin: 0 0 3px 0;
  font-size: 1.1rem;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta-artist {
  margin: 0 0 2px 0;
  font-size: 0.85rem;
  color: var(--theme-accent, #38bdf8);
  font-weight: 600;
  transition: color 0.6s ease;
}
.meta-album {
  font-size: 0.72rem;
  color: #64748b;
}

.progress-container { margin-bottom: 14px; }
.progress-rail {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  position: relative;
}
.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--theme-secondary, #2563eb), var(--theme-accent, #38bdf8));
  border-radius: 2px;
  position: relative;
  transition: width 0.25s linear, background 0.6s ease;
}
.progress-glow-dot {
  position: absolute;
  right: -4px;
  top: -3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--theme-accent, #38bdf8);
  box-shadow: 0 0 8px var(--theme-accent, #38bdf8);
  transition: background 0.6s ease, box-shadow 0.6s ease;
}
.timestamp-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  color: #64748b;
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.control-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 0 8px;
}
.btn-action {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-action:active { transform: scale(0.92); }
.btn-action svg { width: 18px; height: 18px; }
.btn-shuffle.active {
  background: var(--theme-accent, #38bdf8);
  border-color: var(--theme-accent, #38bdf8);
  color: #060913;
  box-shadow: 0 0 12px var(--theme-glow, rgba(56, 189, 248, 0.4));
}

.btn-play-hero {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, var(--theme-accent, #38bdf8) 0%, var(--theme-secondary, #2563eb) 100%);
  color: #060913;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 0 20px var(--theme-glow, rgba(56, 189, 248, 0.4));
  transition: transform 0.1s ease, background 0.6s ease, box-shadow 0.6s ease;
}
.btn-play-hero:active { transform: scale(0.94); }
.btn-play-hero svg { width: 26px; height: 26px; fill: #060913; }
.btn-placeholder { width: 44px; }

.volume-dock {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(9, 14, 26, 0.6);
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.vol-icon {
  width: 16px;
  height: 16px;
  color: #64748b;
}
.vol-slider {
  flex: 1;
  height: 4px;
  accent-color: var(--theme-accent, #38bdf8);
  cursor: pointer;
}
.vol-level {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--theme-accent, #38bdf8);
  width: 14px;
  text-align: right;
  transition: color 0.6s ease;
}

.queue-card {
  flex: 1;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(25px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.queue-title-box {
  display: flex;
  align-items: center;
  gap: 6px;
}
.queue-title-box svg {
  width: 16px;
  height: 16px;
  color: var(--theme-accent, #38bdf8);
  transition: color 0.6s ease;
}
.queue-header h4 {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.5px;
}
.queue-count {
  font-size: 0.7rem;
  color: #64748b;
  font-weight: 600;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(9, 14, 26, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 6px 10px;
  border-radius: 10px;
  margin-bottom: 10px;
}
.search-box svg {
  width: 14px;
  height: 14px;
  color: #64748b;
}
.search-box input {
  flex: 1;
  background: transparent;
  border: none;
  color: #f8fafc;
  font-size: 0.8rem;
  outline: none;
}

.track-queue {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 25vh;
}
.track-queue li {
  background: rgba(9, 14, 26, 0.5);
  padding: 8px 10px;
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}
.track-queue li:active { background: rgba(30, 41, 59, 0.7); }
.track-queue li.is-playing {
  border-color: var(--theme-accent, #38bdf8);
  background: rgba(255, 255, 255, 0.05);
}
.track-queue li.is-top-active {
  background: rgba(56, 189, 248, 0.1);
  box-shadow: 0 0 12px var(--theme-glow, rgba(56, 189, 248, 0.2));
}

.track-meta {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding-right: 8px;
}

.title-badge-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.item-title {
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track-queue li.is-playing .item-title {
  color: var(--theme-accent, #38bdf8);
  transition: color 0.6s ease;
}

.now-playing-badge {
  font-size: 0.58rem;
  font-weight: 800;
  color: #060913;
  background: var(--theme-accent, #38bdf8);
  padding: 1px 5px;
  border-radius: 4px;
  letter-spacing: 0.4px;
  white-space: nowrap;
}

.item-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 1px;
}
.item-artist {
  font-size: 0.7rem;
  color: #64748b;
}
.item-genre-tag {
  font-size: 0.65rem;
  color: var(--theme-accent, #38bdf8);
  font-weight: 600;
  transition: color 0.6s ease;
}

.item-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.item-btn-icon {
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.item-btn-icon:active { color: var(--theme-accent, #38bdf8); }
.item-btn-icon svg { width: 15px; height: 15px; }

.item-fav-btn {
  background: transparent;
  border: none;
  padding: 4px;
  cursor: pointer;
}
.item-fav-btn svg { width: 14px; height: 14px; }

.playing-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}
.playing-bars span {
  width: 2px;
  background: var(--theme-accent, #38bdf8);
  border-radius: 1px;
  animation: bounce 0.8s infinite ease-in-out alternate;
  transition: background 0.6s ease;
}
.playing-bars span:nth-child(1) { height: 40%; animation-delay: 0.1s; }
.playing-bars span:nth-child(2) { height: 100%; animation-delay: 0.3s; }
.playing-bars span:nth-child(3) { height: 60%; animation-delay: 0.2s; }

@keyframes bounce {
  0% { height: 20%; }
  100% { height: 100%; }
}

.empty-state {
  text-align: center;
  color: #64748b;
  font-size: 0.8rem;
  padding: 16px 0;
}
</style>