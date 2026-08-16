// src/composables/useAudioPlayer.js
import { ref, computed } from 'vue'

const audio = new Audio()
audio.preload = 'auto'

const allTracks = ref([])
const queue = ref([])
const currentIndex = ref(0)
const isPlaying = ref(false)
const isShuffle = ref(false)
const selectedArtist = ref(null)

// Algoritmo Fisher-Yates para un aleatorio real sin repeticiones inmediatas
const shuffleArray = (array) => {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export function useAudioPlayer() {
  const currentTrack = computed(() => queue.value[currentIndex.value] || null)

  // Carga inicial del catálogo
  const setTracks = (tracks) => {
    allTracks.value = tracks
    buildQueue()
  }

  // Construye la cola según artista seleccionado y estado de shuffle
  const buildQueue = (startTrackId = null) => {
    let list = selectedArtist.value
      ? allTracks.value.filter(t => t.artist === selectedArtist.value)
      : [...allTracks.value]

    if (isShuffle.value) {
      list = shuffleArray(list)
    }

    queue.value = list

    if (startTrackId) {
      currentIndex.value = queue.value.findIndex(t => t.id === startTrackId)
    } else {
      currentIndex.value = 0
    }
  }

  const playTrack = (index = currentIndex.value) => {
    if (!queue.value.length) return
    currentIndex.value = index
    audio.src = queue.value[currentIndex.value].url
    audio.play()
      .then(() => { isPlaying.value = true })
      .catch(err => console.error('Error al reproducir audio:', err))
  }

  const togglePlay = () => {
    if (isPlaying.value) {
      audio.pause()
      isPlaying.value = false
    } else {
      if (!audio.src && queue.value.length) {
        playTrack(0)
      } else {
        audio.play()
        isPlaying.value = true
      }
    }
  }

  const nextTrack = () => {
    if (currentIndex.value < queue.value.length - 1) {
      currentIndex.value++
      playTrack(currentIndex.value)
    } else {
      // Fin de la cola: reinicia o detiene
      currentIndex.value = 0
      playTrack(0)
    }
  }

  const prevTrack = () => {
    if (currentIndex.value > 0) {
      currentIndex.value--
      playTrack(currentIndex.value)
    }
  }

  const toggleShuffle = () => {
    isShuffle.value = !isShuffle.value
    const currentId = currentTrack.value?.id
    buildQueue(currentId)
  }

  const filterByArtist = (artistName) => {
    selectedArtist.value = artistName === selectedArtist.value ? null : artistName
    buildQueue()
    playTrack(0)
  }

  // Transición automática e inmediata a la siguiente pista
  audio.onended = () => {
    nextTrack()
  }

  return {
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
  }
}