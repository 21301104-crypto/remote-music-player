<!-- src/components/MusicPlayer.vue -->
<script setup>
import { onMounted, computed, ref } from 'vue'
import { useAudioPlayer } from '../composables/useAudioPlayer'

const {
  allTracks,
  queue,
  currentTrack,
  isPlaying,
  isShuffle,
  selectedArtist,
  setTracks,
  playTrack,
  togglePlay,
  nextTrack,
  prevTrack,
  toggleShuffle,
  filterByArtist
} = useAudioPlayer()

const isLoading = ref(true)
const errorMessage = ref(null)

// Extrae la lista única de artistas del catálogo cargado
const uniqueArtists = computed(() => {
  const artists = allTracks.value
    .map(track => track.artist)
    .filter(Boolean)
  return [...new Set(artists)]
})

// Carga de datos reales desde el backend
onMounted(async () => {
  try {
    isLoading.value = true
    const response = await fetch('/api/library')
    
    if (!response.ok) {
      throw new Error(`Error en el servidor: ${response.statusText}`)
    }

    const data = await response.json()
    
    // Si la API devuelve solo strings de nombres de archivo, mapeamos a objetos { id, title, artist, url }
    // Si ya devuelve objetos completos, pasamos 'data' directamente.
    const formattedTracks = data.map((item, index) => {
      if (typeof item === 'string') {
        // Ejemplo si viene como "Artista - Cancion.mp3" o ruta relativa
        const parts = item.replace(/\.[^/.]+$/, '').split(' - ')
        return {
          id: index + 1,
          title: parts[1] || parts[0] || item,
          artist: parts.length > 1 ? parts[0] : 'Varios',
          url: `/api/stream/${encodeURIComponent(item)}` // o la ruta a tu archivo
        }
      }
      return item
    })

    setTracks(formattedTracks)
  } catch (error) {
    console.error('Fallo al cargar la biblioteca:', error)
    errorMessage.value = 'No se pudo conectar con el catálogo de música.'
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="player-container">
    <!-- Estado de Carga / Error -->
    <div v-if="isLoading" class="feedback-text">Cargando biblioteca...</div>
    <div v-else-if="errorMessage" class="feedback-text error">{{ errorMessage }}</div>

    <template v-else>
      <!-- Filtros por Artista -->
      <section class="artist-chips" v-if="uniqueArtists.length > 0">
        <button 
          :class="{ active: selectedArtist === null }" 
          @click="filterByArtist(null)"
        >
          Todos ({{ allTracks.length }})
        </button>
        <button 
          v-for="artist in uniqueArtists" 
          :key="artist"
          :class="{ active: selectedArtist === artist }"
          @click="filterByArtist(artist)"
        >
          {{ artist }}
        </button>
      </section>

      <!-- Track en Reproducción Actual -->
      <section class="current-info" v-if="currentTrack">
        <span class="badge">{{ isPlaying ? 'Reproduciendo' : 'En pausa' }}</span>
        <h2 class="title">{{ currentTrack.title }}</h2>
        <p class="artist">{{ currentTrack.artist }}</p>
      </section>

      <!-- Controles de Reproducción -->
      <section class="controls">
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
      </section>

      <!-- Cola de Reproducción Activa -->
      <section class="queue-section">
        <h3>Pistas Disponibles ({{ queue.length }})</h3>
        <ul class="track-list" v-if="queue.length > 0">
          <li 
            v-for="(track, index) in queue" 
            :key="track.id"
            :class="{ current: currentTrack?.id === track.id }"
            @click="playTrack(index)"
          >
            <div class="track-meta">
              <span class="track-title">{{ track.title }}</span>
              <span class="track-artist">{{ track.artist }}</span>
            </div>
            <span class="track-indicator" v-if="currentTrack?.id === track.id">
              {{ isPlaying ? '🔊' : '❚❚' }}
            </span>
          </li>
        </ul>
        <p v-else class="feedback-text">No hay canciones para este filtro.</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.player-container {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
  max-width: 440px;
  background: #18181b;
  color: #fafafa;
  border-radius: 16px;
  padding: 1.5rem;
  border: 1px solid #27272a;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.artist-chips {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
  scrollbar-width: thin;
}

.artist-chips button {
  background: #27272a;
  color: #a1a1aa;
  border: 1px solid #3f3f46;
  padding: 0.35rem 0.75rem;
  border-radius: 20px;
  font-size: 0.85rem;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s ease;
}

.artist-chips button.active {
  background: #22c55e;
  color: #09090b;
  border-color: #22c55e;
  font-weight: 600;
}

.current-info {
  text-align: center;
  background: #27272a;
  padding: 1rem;
  border-radius: 12px;
}

.badge {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: #22c55e;
  font-weight: 700;
}

.title {
  margin: 0.3rem 0;
  font-size: 1.25rem;
  word-break: break-word;
}

.artist {
  margin: 0;
  color: #a1a1aa;
  font-size: 0.9rem;
}

.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
}

.btn-icon {
  background: #27272a;
  border: 1px solid #3f3f46;
  color: #fafafa;
  font-size: 1.1rem;
  padding: 0.6rem 0.8rem;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-icon.active {
  background: #22c55e;
  color: #000;
  border-color: #22c55e;
}

.btn-main {
  background: #22c55e;
  border: none;
  color: #09090b;
  font-size: 1.4rem;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.queue-section h3 {
  font-size: 1rem;
  margin-bottom: 0.75rem;
  color: #d4d4d8;
}

.track-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 250px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.track-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 0.8rem;
  background: #27272a;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.track-list li.current {
  background: #3f3f46;
  border-left: 4px solid #22c55e;
}

.track-meta {
  display: flex;
  flex-direction: column;
}

.track-title {
  font-size: 0.9rem;
  font-weight: 500;
}

.track-artist {
  font-size: 0.75rem;
  color: #a1a1aa;
}

.feedback-text {
  text-align: center;
  color: #a1a1aa;
  padding: 1.5rem 0;
}

.feedback-text.error {
  color: #ef4444;
}
</style>