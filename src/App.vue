<!-- src/App.vue -->
<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.DEV
  ? `http://${window.location.hostname}:3000`
  : window.location.origin;

const socket = io(BACKEND_URL);

// Estados Sincronizados
const isConnected = ref(false);
const masterLibrary = ref([]);
const queue = ref([]);
const favorites = ref([]);
const currentFilterMode = ref('all');
const selectedArtist = ref(null);
const currentTrack = ref({ path: null, title: null, artist: null, album: null, duration: 0 });
const isPlaying = ref(false);
const isShuffle = ref(false);
const volume = ref(10);
const searchQuery = ref('');
const imageError = ref(false);

// Interpolación de Tiempo en Cliente
const playStartTime = ref(0);
const elapsedOffset = ref(0);
const currentTime = ref(0);
let progressInterval = null;

// URL Absoluta de Carátula HTTP
const coverUrl = computed(() => {
  if (!currentTrack.value.path || imageError.value) return null;
  return `${BACKEND_URL}/api/cover?path=${encodeURIComponent(currentTrack.value.path)}`;
});

const handleImageError = () => {
  imageError.value = true;
};

// Acciones de Control Centralizadas
const playTrack = (track) => {
  imageError.value = false;
  socket.emit('play_track', track.path);
};

const togglePlay = () => {
  socket.emit('toggle_play');
};

const nextTrack = () => {
  imageError.value = false;
  socket.emit('next');
};

const prevTrack = () => {
  imageError.value = false;
  socket.emit('prev');
};

const toggleShuffle = () => socket.emit('toggle_shuffle');

const setFilter = (mode, artist = null) => {
  imageError.value = false;
  socket.emit('set_filter', { mode, artist });
};

const toggleFavorite = (trackPath, event) => {
  if (event) event.stopPropagation();
  socket.emit('toggle_favorite', trackPath);
};

const changeVolume = () => {
  socket.emit('set_volume', volume.value);
};

// Formateador de Tiempo (mm:ss)
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const progressPercent = computed(() => {
  if (!currentTrack.value.duration || currentTrack.value.duration === 0) return 0;
  const pct = (currentTime.value / currentTrack.value.duration) * 100;
  return Math.min(Math.max(pct, 0), 100);
});

const isTrackFavorite = (path) => favorites.value.includes(path);

const uniqueArtists = computed(() => {
  const artists = masterLibrary.value.map(t => t.artist).filter(Boolean);
  return [...new Set(artists)].sort();
});

const displayedQueue = computed(() => {
  if (!searchQuery.value.trim()) return queue.value;
  return queue.value.filter(track =>
    track.title.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    track.artist.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

// Ticker de Tiempo Local
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
    favorites.value = state.favorites || [];
    if (state.currentVolume !== undefined) volume.value = state.currentVolume;

    playStartTime.value = state.playStartTime || 0;
    elapsedOffset.value = state.elapsedOffset || 0;

    if (currentTrack.value.path !== state.currentTrack?.path) {
      imageError.value = false;
      currentTime.value = 0;
    }

    currentTrack.value = state.currentTrack || { duration: 0 };
    queue.value = state.queue || [];
    masterLibrary.value = state.masterLibrary || [];
  });
});

onUnmounted(() => {
  if (progressInterval) clearInterval(progressInterval);
});
</script>

<template>
  <div class="app-viewport">
    <!-- Header Superior -->
    <header class="navbar">
      <div class="brand">
        <div class="brand-glow"></div>
        <svg class="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>
        <h2>SOUND<span class="brand-red">WAVE</span></h2>
      </div>

      <div class="status-pill" :class="{ connected: isConnected }">
        <span class="status-indicator"></span>
        <span class="status-text">{{ isConnected ? 'REMOTE LINK' : 'OFFLINE' }}</span>
      </div>
    </header>

    <!-- Barra de Filtros -->
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

      <button 
        v-for="artist in uniqueArtists" 
        :key="artist"
        class="tab-btn"
        :class="{ active: currentFilterMode === 'artist' && selectedArtist === artist }"
        @click="setFilter('artist', artist)"
      >
        <span>{{ artist }}</span>
      </button>
    </nav>

    <!-- Tarjeta del Reproductor Principal -->
    <section class="player-card">
      <div class="cover-wrapper">
        <div class="ambient-glow" :style="{ opacity: isPlaying ? '0.6' : '0.2' }"></div>
        
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

        <!-- Botón de Favorito Flotante -->
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

      <!-- Metadatos de la Canción -->
      <div class="meta-container">
        <h3 class="meta-title">{{ currentTrack.title || 'Pista no seleccionada' }}</h3>
        <p class="meta-artist">{{ currentTrack.artist || 'Toca una canción de la cola' }}</p>
        <span v-if="currentTrack.album" class="meta-album">{{ currentTrack.album }}</span>
      </div>

      <!-- Barra de Progreso Dinámica -->
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

      <!-- Botonera de Control -->
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

    <!-- Lista y Cola de Reproducción -->
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

      <!-- Input de Búsqueda -->
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="M21 21l-4.35-4.35"></path>
        </svg>
        <input 
          type="text" 
          v-model="searchQuery" 
          placeholder="Buscar canciones o artistas..." 
        />
      </div>

      <!-- Items de la Lista -->
      <ul v-if="displayedQueue.length > 0" class="track-queue">
        <li 
          v-for="track in displayedQueue" 
          :key="track.id" 
          @click="playTrack(track)"
          :class="{ 'is-playing': currentTrack.path === track.path }"
        >
          <div class="track-meta">
            <span class="item-title">{{ track.title }}</span>
            <span class="item-artist">{{ track.artist }}</span>
          </div>

          <div class="item-controls">
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
        <p>No hay canciones disponibles.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ==========================================================================
   ESTILOS GENERALES (Dark Blue & Neon Red Theme)
   ========================================================================== */
.app-viewport {
  width: 100%;
  max-width: 390px; /* Ancho nativo iPhone 12 */
  margin: 0 auto;
  min-height: 100vh;
  background: radial-gradient(circle at top, #0f172a 0%, #060913 100%);
  color: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
  display: flex;
  flex-direction: column;
  padding: max(16px, env(safe-area-inset-top)) 16px max(20px, env(safe-area-inset-bottom)) 16px;
  box-sizing: border-box;
}

/* Header */
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
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
  background: #38bdf8;
  filter: blur(12px);
  opacity: 0.5;
}
.brand-icon {
  width: 22px;
  height: 22px;
  color: #38bdf8;
}
.navbar h2 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 900;
  letter-spacing: 1px;
  color: #38bdf8;
}
.brand-red { color: #ef4444; }

.status-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 4px 10px;
  border-radius: 20px;
}
.status-pill.connected {
  border-color: rgba(56, 189, 248, 0.4);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.15);
}
.status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
}
.status-pill.connected .status-indicator {
  background: #38bdf8;
  box-shadow: 0 0 6px #38bdf8;
}
.status-text {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #94a3b8;
}

/* Filtros Strip */
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
  border: 1px solid rgba(56, 189, 248, 0.15);
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
  background: #2563eb;
  color: #ffffff;
  border-color: #38bdf8;
  box-shadow: 0 0 12px rgba(37, 99, 235, 0.5);
}
.tab-fav.active {
  background: #dc2626;
  border-color: #ef4444;
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.5);
}
.tab-fav-icon { width: 12px; height: 12px; }

/* Reproductor Hero */
.player-card {
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(25px);
  border: 1px solid rgba(56, 189, 248, 0.15);
  border-radius: 24px;
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.05);
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
  background: radial-gradient(circle, #38bdf8 0%, #ef4444 80%);
  filter: blur(20px);
  border-radius: 20px;
  transition: opacity 0.3s ease;
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
  border: 1px dashed rgba(56, 189, 248, 0.2);
}
.cover-placeholder svg {
  width: 50px;
  height: 50px;
  color: #38bdf8;
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

/* Metadata */
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
  color: #f8fafc;
}
.meta-artist {
  margin: 0 0 2px 0;
  font-size: 0.85rem;
  color: #38bdf8;
  font-weight: 600;
}
.meta-album {
  font-size: 0.72rem;
  color: #64748b;
}

/* Timeline */
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
  background: linear-gradient(90deg, #2563eb, #38bdf8);
  border-radius: 2px;
  position: relative;
  transition: width 0.25s linear;
}
.progress-glow-dot {
  position: absolute;
  right: -4px;
  top: -3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 8px #38bdf8;
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

/* Controles */
.control-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 0 8px;
}
.btn-action {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(56, 189, 248, 0.1);
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
  background: #ef4444;
  border-color: #ef4444;
  color: #ffffff;
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
}

.btn-play-hero {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #38bdf8 0%, #2563eb 100%);
  color: #060913;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
  transition: transform 0.1s ease;
}
.btn-play-hero:active { transform: scale(0.94); }
.btn-play-hero svg { width: 26px; height: 26px; fill: #060913; }
.btn-placeholder { width: 44px; }

/* Volumen */
.volume-dock {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(9, 14, 26, 0.6);
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(56, 189, 248, 0.08);
}
.vol-icon {
  width: 16px;
  height: 16px;
  color: #64748b;
}
.vol-slider {
  flex: 1;
  height: 4px;
  accent-color: #38bdf8;
  cursor: pointer;
}
.vol-level {
  font-size: 0.75rem;
  font-weight: 800;
  color: #38bdf8;
  width: 14px;
  text-align: right;
}

/* Cola Card */
.queue-card {
  flex: 1;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(25px);
  border: 1px solid rgba(56, 189, 248, 0.15);
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
  color: #38bdf8;
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
  border: 1px solid rgba(56, 189, 248, 0.1);
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
  transition: all 0.15s ease;
}
.track-queue li:active { background: rgba(30, 41, 59, 0.7); }
.track-queue li.is-playing {
  border-color: rgba(56, 189, 248, 0.4);
  background: rgba(37, 99, 235, 0.15);
}
.track-meta {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding-right: 8px;
}
.item-title {
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track-queue li.is-playing .item-title { color: #38bdf8; }
.item-artist {
  font-size: 0.7rem;
  color: #64748b;
}

.item-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.item-fav-btn {
  background: transparent;
  border: none;
  padding: 4px;
  cursor: pointer;
}
.item-fav-btn svg { width: 14px; height: 14px; }

/* Ecualizador de Barras en Pista Activa */
.playing-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}
.playing-bars span {
  width: 2px;
  background: #38bdf8;
  border-radius: 1px;
  animation: bounce 0.8s infinite ease-in-out alternate;
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