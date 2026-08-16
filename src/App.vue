<!-- src/App.vue -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.DEV
  ? `http://${window.location.hostname}:3000`
  : window.location.origin;

const socket = io(BACKEND_URL);

// Estados Sincronizados
const isConnected = ref(false);
const masterLibrary = ref([]);
const queue = ref([]);
const currentTrack = ref({ path: null, title: null, artist: null, album: null, duration: 0 });
const isPlaying = ref(false);
const isShuffle = ref(false);
const selectedArtist = ref(null);
const volume = ref(10);
const searchQuery = ref('');
const imageError = ref(false);

// Variables de Tiempo
const playStartTime = ref(0);
const elapsedOffset = ref(0);
const currentTime = ref(0);
let progressInterval = null;

// Formateador de segundos a mm:ss
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

// Porcentaje de la barra de progreso
const progressPercent = computed(() => {
  if (!currentTrack.value.duration || currentTrack.value.duration === 0) return 0;
  const pct = (currentTime.value / currentTrack.value.duration) * 100;
  return Math.min(Math.max(pct, 0), 100);
});

// URL de la carátula
const coverUrl = computed(() => {
  if (!currentTrack.value.path || imageError.value) return null;
  return `${BACKEND_URL}/api/cover?path=${encodeURIComponent(currentTrack.value.path)}`;
});

const handleImageError = () => {
  imageError.value = true;
};

// Artistas únicos
const uniqueArtists = computed(() => {
  const artists = masterLibrary.value.map(t => t.artist).filter(Boolean);
  return [...new Set(artists)].sort();
});

// Filtrado de búsqueda
const displayedQueue = computed(() => {
  if (!searchQuery.value.trim()) return queue.value;
  return queue.value.filter(track =>
    track.title.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    track.artist.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

// Loop de interpolación en el cliente (cada 250ms)
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

// Acciones de control
const playTrack = (track) => {
  imageError.value = false;
  socket.emit('play_track', track.path);
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

const filterByArtist = (artist) => {
  imageError.value = false;
  const newArtist = selectedArtist.value === artist ? null : artist;
  socket.emit('filter_artist', newArtist);
};

const changeVolume = () => {
  socket.emit('set_volume', volume.value);
};

onMounted(() => {
  startProgressTicker();

  socket.on('connect', () => { isConnected.value = true; });
  socket.on('disconnect', () => { isConnected.value = false; });

  socket.on('state_changed', (state) => {
    isPlaying.value = state.isPlaying;
    isShuffle.value = state.isShuffle;
    selectedArtist.value = state.selectedArtist;
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
  <main class="app-container">
    <header class="header">
      <h1>🎵 Remote Music</h1>
      <div class="status-badge" :class="{ online: isConnected }">
        <span class="status-dot"></span>
        {{ isConnected ? 'Enlace Directo Activo' : 'Reconectando...' }}
      </div>
    </header>

    <!-- Filtro de Artistas -->
    <section class="artist-section" v-if="uniqueArtists.length > 0">
      <button 
        class="chip" 
        :class="{ active: selectedArtist === null }" 
        @click="filterByArtist(null)"
      >
        Todos ({{ masterLibrary.length }})
      </button>
      <button 
        v-for="artist in uniqueArtists" 
        :key="artist"
        class="chip"
        :class="{ active: selectedArtist === artist }"
        @click="filterByArtist(artist)"
      >
        {{ artist }}
      </button>
    </section>

    <!-- Tarjeta Principal del Reproductor -->
    <section class="player-card">
      <div class="cover-box">
        <img 
          v-if="coverUrl" 
          :src="coverUrl" 
          alt="Carátula" 
          class="album-cover"
          @error="handleImageError"
        />
        <div v-else class="placeholder-cover">
          <span>🎧</span>
        </div>
      </div>

      <div class="track-details">
        <h2 class="title">{{ currentTrack.title || 'Ninguna pista en reproducción' }}</h2>
        <p class="artist">{{ currentTrack.artist || 'Selecciona una canción' }}</p>
        <p v-if="currentTrack.album" class="album">💽 {{ currentTrack.album }}</p>
      </div>

      <!-- Barra de Progreso Dinámica -->
      <div class="progress-section">
        <div class="progress-bar-wrapper">
          <div class="progress-bar-fill" :style="{ width: `${progressPercent}%` }"></div>
        </div>
        <div class="time-row">
          <span class="time-text">{{ formatTime(currentTime) }}</span>
          <span class="time-text">{{ formatTime(currentTrack.duration) }}</span>
        </div>
      </div>

      <!-- Controles de Reproducción -->
      <div class="controls-row">
        <button 
          class="btn-icon" 
          :class="{ active: isShuffle }" 
          @click="toggleShuffle" 
          title="Modo Aleatorio"
        >
          🔀
        </button>
        <button class="btn-icon" @click="prevTrack" title="Anterior">⏮</button>
        <button class="btn-main" @click="togglePlay">
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <button class="btn-icon" @click="nextTrack" title="Siguiente">⏭</button>
      </div>

      <!-- Slider de Volumen -->
      <div class="volume-box">
        <span class="vol-icon">🔈</span>
        <input 
          type="range" 
          min="0" 
          max="15" 
          v-model.number="volume" 
          @input="changeVolume"
          class="slider"
        />
        <span class="vol-icon">🔊</span>
        <span class="vol-badge">{{ volume }}</span>
      </div>
    </section>

    <!-- Cola Activa -->
    <section class="library-card">
      <div class="library-header">
        <h3>Cola Activa ({{ displayedQueue.length }})</h3>
        <input 
          type="text" 
          v-model="searchQuery" 
          placeholder="Buscar pista o artista..." 
          class="search-input"
        />
      </div>

      <ul v-if="displayedQueue.length > 0" class="track-list">
        <li 
          v-for="track in displayedQueue" 
          :key="track.id" 
          @click="playTrack(track)"
          :class="{ active: currentTrack.path === track.path }"
        >
          <div class="meta">
            <span class="t-title">{{ track.title }}</span>
            <span class="t-artist">{{ track.artist }}</span>
          </div>
          <span class="indicator" v-if="currentTrack.path === track.path">
            {{ isPlaying ? '🔊' : '❚❚' }}
          </span>
        </li>
      </ul>
      <p v-else class="empty">No hay canciones disponibles.</p>
    </section>
  </main>
</template>

<style scoped>
.app-container {
  max-width: 440px;
  margin: 0 auto;
  padding: 16px;
  min-height: 100vh;
  background-color: #0b0f19;
  color: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  box-sizing: border-box;
}

.header { text-align: center; margin-bottom: 12px; }
.header h1 { margin: 0; font-size: 1.5rem; color: #38bdf8; }
.status-badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.8rem; color: #94a3b8; margin-top: 4px;
}
.status-dot { width: 8px; height: 8px; border-radius: 50%; background-color: #ef4444; }
.status-badge.online { color: #34d399; }
.status-badge.online .status-dot { background-color: #10b981; box-shadow: 0 0 8px #10b981; }

.artist-section {
  display: flex; gap: 8px; overflow-x: auto;
  padding-bottom: 10px; margin-bottom: 12px; scrollbar-width: none;
}
.artist-section::-webkit-scrollbar { display: none; }
.chip {
  background: #1e293b; color: #94a3b8; border: 1px solid #334155;
  padding: 6px 14px; border-radius: 20px; font-size: 0.85rem;
  white-space: nowrap; cursor: pointer; transition: all 0.2s ease;
}
.chip.active { background: #38bdf8; color: #0b0f19; border-color: #38bdf8; font-weight: bold; }

.player-card {
  background: #1e293b; border-radius: 16px; padding: 20px;
  margin-bottom: 16px; border: 1px solid #334155;
  box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
}

.cover-box { display: flex; justify-content: center; margin-bottom: 14px; }
.album-cover {
  width: 170px; height: 170px; object-fit: cover;
  border-radius: 12px; border: 1px solid #475569;
  box-shadow: 0 8px 16px rgba(0,0,0,0.4);
}
.placeholder-cover {
  width: 170px; height: 170px; background: #0f172a;
  border-radius: 12px; display: flex; align-items: center;
  justify-content: center; font-size: 3.5rem; border: 1px dashed #334155;
}

.track-details { text-align: center; margin-bottom: 14px; }
.title { margin: 0 0 4px 0; font-size: 1.15rem; font-weight: 700; word-break: break-word; }
.artist { margin: 0 0 4px 0; font-size: 0.95rem; color: #38bdf8; font-weight: 500; }
.album { margin: 0; font-size: 0.8rem; color: #94a3b8; }

/* Estilos de la Barra de Progreso */
.progress-section { margin-bottom: 16px; }
.progress-bar-wrapper {
  width: 100%; height: 6px; background-color: #0f172a;
  border-radius: 3px; overflow: hidden; position: relative;
}
.progress-bar-fill {
  height: 100%; background: linear-gradient(90deg, #38bdf8, #818cf8);
  border-radius: 3px; transition: width 0.25s linear;
}
.time-row {
  display: flex; justify-content: space-between;
  margin-top: 6px; font-size: 0.75rem; color: #94a3b8; font-variant-numeric: tabular-nums;
}

.controls-row {
  display: flex; justify-content: center; align-items: center;
  gap: 16px; margin-bottom: 16px;
}
.btn-icon {
  background: #0f172a; border: 1px solid #334155; color: #f8fafc;
  font-size: 1.2rem; width: 44px; height: 44px; border-radius: 50%;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.btn-icon.active { background: #38bdf8; color: #0b0f19; border-color: #38bdf8; }
.btn-main {
  background: #38bdf8; border: none; color: #0b0f19;
  font-size: 1.5rem; width: 56px; height: 56px; border-radius: 50%;
  cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold;
}

.volume-box {
  display: flex; align-items: center; gap: 10px;
  background: #0f172a; padding: 10px 14px; border-radius: 10px;
}
.vol-icon { font-size: 1rem; }
.slider { flex: 1; accent-color: #38bdf8; cursor: pointer; }
.vol-badge { font-size: 0.85rem; font-weight: bold; color: #38bdf8; width: 18px; text-align: right; }

.library-card { background: #1e293b; border-radius: 16px; padding: 16px; border: 1px solid #334155; }
.library-header h3 { margin: 0 0 10px 0; font-size: 1rem; color: #e2e8f0; }
.search-input {
  width: 100%; padding: 10px 12px; background: #0f172a;
  border: 1px solid #334155; border-radius: 8px; color: #f8fafc;
  font-size: 0.9rem; box-sizing: border-box; outline: none; margin-bottom: 12px;
}
.search-input:focus { border-color: #38bdf8; }

.track-list {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 8px;
  max-height: 38vh; overflow-y: auto;
}
.track-list li {
  background: #0f172a; padding: 12px 14px; border-radius: 8px;
  display: flex; justify-content: space-between; align-items: center;
  cursor: pointer; transition: background-color 0.15s ease;
}
.track-list li:active { background: #334155; }
.track-list li.active {
  border-left: 4px solid #38bdf8; background: #1a2234; color: #38bdf8; font-weight: 600;
}
.meta { display: flex; flex-direction: column; }
.t-title { font-size: 0.9rem; word-break: break-all; }
.t-artist { font-size: 0.75rem; color: #94a3b8; margin-top: 2px; }
.indicator { font-size: 0.85rem; color: #38bdf8; }
.empty { text-align: center; color: #64748b; font-size: 0.9rem; margin: 16px 0; }
</style>