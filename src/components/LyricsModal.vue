<!-- src/components/LyricsModal.vue -->
<script setup>
import { ref, watch, nextTick } from 'vue';
import { useLyricsParser } from '../composables/useLyricsParser';

const props = defineProps({
  isOpen: Boolean,
  currentTrack: Object,
  currentTime: Number,
  coverUrl: String,
  lyricsData: Object,
  syncProgress: Object
});

const emit = defineEmits(['close', 'seek', 'start-sync']);

const syncedLyricsRef = ref('');
const currentTimeRef = ref(0);
const scrollContainerRef = ref(null);

watch(() => props.lyricsData, (newVal) => {
  syncedLyricsRef.value = newVal?.syncedLyrics || '';
}, { immediate: true });

watch(() => props.currentTime, (newVal) => {
  currentTimeRef.value = newVal || 0;
});

const { parsedLyrics, activeLineIndex } = useLyricsParser(syncedLyricsRef, currentTimeRef);

// Auto-Scroll Suave hacia la línea activa
watch(activeLineIndex, async (newIdx) => {
  if (newIdx === -1 || !props.isOpen) return;
  await nextTick();
  const el = document.getElementById(`lyric-line-${newIdx}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

const handleLineClick = (time) => {
  emit('seek', time);
};
</script>

<template>
  <transition name="lyrics-modal-fade">
    <div v-if="isOpen" class="lyrics-viewport">
      <!-- Fondo Cinemático con Blur Sincronizado -->
      <div class="lyrics-backdrop" v-if="coverUrl">
        <img :src="coverUrl" alt="" class="lyrics-blur-art" />
        <div class="lyrics-overlay-mask"></div>
      </div>

      <!-- Cabecera Superior -->
      <header class="lyrics-header">
        <div class="header-track-info">
          <span class="header-badge">LETRAS EN VIVO</span>
          <h4 class="track-title-head">{{ currentTrack.title }}</h4>
          <span class="track-artist-head">{{ currentTrack.artist }}</span>
        </div>

        <div class="header-buttons">
          <!-- Botón de Sincronización Masiva -->
          <button 
            class="btn-sync-action"
            @click="emit('start-sync')"
            title="Descargar letras para todo el catálogo"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            <span>Sincronizar Todas</span>
          </button>

          <button class="btn-close-lyrics" @click="emit('close')">✕</button>
        </div>
      </header>

      <!-- Banner de Progreso de Sincronización en Lote -->
      <div v-if="syncProgress && syncProgress.percentage < 100" class="sync-progress-banner">
        <div class="sync-text-row">
          <span>Descargando letras... {{ syncProgress.processed }}/{{ syncProgress.total }}</span>
          <span>{{ syncProgress.percentage }}%</span>
        </div>
        <div class="sync-rail">
          <div class="sync-fill" :style="{ width: `${syncProgress.percentage}%` }"></div>
        </div>
      </div>

      <!-- Contenedor Principal de Letras -->
      <div class="lyrics-scroll-box" ref="scrollContainerRef">
        <!-- Caso 1: Letras Sincronizadas (.lrc) -->
        <div v-if="parsedLyrics.length > 0" class="lyrics-stream">
          <p
            v-for="(line, idx) in parsedLyrics"
            :key="line.id"
            :id="`lyric-line-${idx}`"
            class="lyric-line"
            :class="{ 
              'is-active': idx === activeLineIndex,
              'is-passed': idx < activeLineIndex,
              'is-future': idx > activeLineIndex
            }"
            @click="handleLineClick(line.time)"
          >
            {{ line.text }}
          </p>
        </div>

        <!-- Caso 2: Letra Plana (Sin timestamps) -->
        <div v-else-if="lyricsData?.plainLyrics" class="lyrics-plain-box">
          <p v-for="(paragraph, pIdx) in lyricsData.plainLyrics.split('\n')" :key="pIdx">
            {{ paragraph }}
          </p>
        </div>

        <!-- Caso 3: Sin Letras Disponibles -->
        <div v-else class="lyrics-empty-state">
          <div class="empty-icon-ring">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          </div>
          <h3>Letras no disponibles</h3>
          <p>Esta pista no tiene letra en la base de datos local. Conecta el teléfono a Wi-Fi para obtenerla automáticamente o pulsa "Sincronizar Todas".</p>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.lyrics-viewport {
  position: fixed;
  inset: 0;
  background-color: #030712;
  z-index: 250;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: max(14px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom)) 20px;
}

.lyrics-backdrop {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
}
.lyrics-blur-art {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(65px) brightness(0.28) saturate(220%);
  transform: scale(1.4);
}
.lyrics-overlay-mask {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at top, rgba(15, 23, 42, 0.4) 0%, rgba(3, 7, 18, 0.94) 100%);
}

.lyrics-header {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.header-track-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.header-badge {
  font-size: 0.6rem;
  font-weight: 900;
  color: var(--theme-accent, #38bdf8);
  letter-spacing: 0.6px;
  margin-bottom: 2px;
}
.track-title-head {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track-artist-head {
  font-size: 0.75rem;
  color: #94a3b8;
}

.header-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-sync-action {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f8fafc;
  padding: 6px 12px;
  border-radius: 14px;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-sync-action svg { width: 13px; height: 13px; color: var(--theme-accent, #38bdf8); }

.btn-close-lyrics {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #f8fafc;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sync-progress-banner {
  position: relative;
  z-index: 2;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid var(--theme-accent, #38bdf8);
  border-radius: 10px;
  padding: 8px 12px;
  margin-bottom: 10px;
}
.sync-text-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  font-weight: 700;
  color: #f8fafc;
  margin-bottom: 4px;
}
.sync-rail {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}
.sync-fill {
  height: 100%;
  background: var(--theme-accent, #38bdf8);
  border-radius: 2px;
  transition: width 0.2s ease;
}

.lyrics-scroll-box {
  position: relative;
  z-index: 2;
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;
  padding: 40px 0;
}
.lyrics-scroll-box::-webkit-scrollbar { display: none; }

.lyrics-stream {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.lyric-line {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1.35;
  cursor: pointer;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: left center;
}
.lyric-line.is-passed {
  color: rgba(255, 255, 255, 0.22);
  transform: scale(0.95);
  filter: blur(0.6px);
}
.lyric-line.is-active {
  color: #ffffff;
  transform: scale(1.08);
  text-shadow: 0 4px 18px var(--theme-glow, rgba(56, 189, 248, 0.6));
  filter: blur(0);
}
.lyric-line.is-future {
  color: rgba(255, 255, 255, 0.42);
  transform: scale(0.97);
}

.lyrics-plain-box {
  font-size: 1.1rem;
  line-height: 1.8;
  color: #cbd5e1;
  font-weight: 600;
  text-align: center;
}

.lyrics-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;
  color: #94a3b8;
  padding: 0 20px;
}
.empty-icon-ring {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}
.empty-icon-ring svg { width: 28px; height: 28px; color: #64748b; }
.lyrics-empty-state h3 { margin: 0 0 6px 0; color: #f8fafc; font-size: 1.1rem; font-weight: 800; }
.lyrics-empty-state p { margin: 0; font-size: 0.8rem; line-height: 1.5; max-width: 320px; }

.lyrics-modal-fade-enter-active, .lyrics-modal-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.lyrics-modal-fade-enter-from, .lyrics-modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>