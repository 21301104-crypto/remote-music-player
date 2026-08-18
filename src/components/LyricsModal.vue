<!-- src/components/LyricsModal.vue -->
<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useLyricsParser } from '../composables/useLyricsParser';

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  currentTrack: { type: Object, default: () => ({}) },
  currentTime: { type: Number, default: 0 },
  coverUrl: { type: String, default: null },
  lyricsData: { type: Object, default: null },
  syncProgress: { type: Object, default: null }
});

const emit = defineEmits(['close', 'seek', 'startSync']);

const { parseLRC, getActiveLineIndex } = useLyricsParser();
const lyricsContainerRef = ref(null);
const autoScrollEnabled = ref(true);

const parsedLines = computed(() => {
  if (!props.lyricsData?.syncedLyrics) return [];
  return parseLRC(props.lyricsData.syncedLyrics);
});

const currentLineIndex = computed(() => {
  if (!parsedLines.value.length) return -1;
  return getActiveLineIndex(parsedLines.value, props.currentTime);
});

// Sincronización automática de scroll al cambiar la línea activa
watch(currentLineIndex, async (newIdx) => {
  if (newIdx === -1 || !autoScrollEnabled.value || !lyricsContainerRef.value) return;

  await nextTick();
  const activeEl = lyricsContainerRef.value.querySelector('.vintage-lyric-line.is-active');
  if (activeEl) {
    activeEl.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }
});

const handleLineClick = (timeSec) => {
  emit('seek', timeSec);
};

const handleUserScroll = () => {
  autoScrollEnabled.value = false;
  setTimeout(() => {
    autoScrollEnabled.value = true;
  }, 4000);
};
</script>

<template>
  <teleport to="body">
    <transition name="vintage-modal-fade">
      <div v-if="isOpen" class="vintage-lyrics-overlay" @click.self="emit('close')">
        <div class="vintage-lyrics-card">
          <!-- Tornillos Decorativos -->
          <span class="chassis-bolt bolt-tl"></span>
          <span class="chassis-bolt bolt-tr"></span>
          <span class="chassis-bolt bolt-bl"></span>
          <span class="chassis-bolt bolt-br"></span>

          <!-- Cabecera -->
          <header class="lyrics-header-panel">
            <div class="header-metadata">
              <span class="vintage-tag">LETRAS EN VIVO • ANALOG SESSION</span>
              <h2 class="vintage-song-title">{{ currentTrack.title || 'Sin Título' }}</h2>
              <p class="vintage-song-artist">
                {{ currentTrack.artist || 'Artista Desconocido' }}
                <span v-if="currentTrack.album" class="album-tag">• {{ currentTrack.album }}</span>
              </p>
            </div>

            <button class="btn-vintage-modal-close" @click="emit('close')" title="Cerrar">✕</button>
          </header>

          <!-- Tira de Control -->
          <div class="lyrics-control-strip">
            <div class="sync-indicator-group">
              <span class="sync-amber-lamp" :class="{ 'is-active-lamp': parsedLines.length > 0 }"></span>
              <span class="sync-status-label">
                {{ parsedLines.length > 0 ? `${parsedLines.length} LÍNEAS SINCRONIZADAS` : (lyricsData?.plainLyrics ? 'LETRA ESTÁTICA' : 'SIN REGISTRO LOCAL') }}
              </span>
            </div>

            <button class="btn-vintage-sync-action" @click="emit('startSync')" title="Sincronizar base de datos SQLite">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
              <span>SINCRONIZAR DB</span>
            </button>
          </div>

          <!-- Barra de Progreso de Sincronización -->
          <div v-if="syncProgress && syncProgress.percentage < 100" class="sync-progress-track">
            <div class="sync-progress-fill" :style="{ width: `${syncProgress.percentage}%` }"></div>
          </div>

          <!-- Cavidad de Lectura -->
          <div 
            class="lyrics-scroll-cavity" 
            ref="lyricsContainerRef" 
            @wheel="handleUserScroll" 
            @touchstart="handleUserScroll"
          >
            <!-- 1. Letras Sincronizadas (.LRC) -->
            <div v-if="parsedLines.length > 0" class="lines-flow-container">
              <p
                v-for="(line, idx) in parsedLines"
                :key="idx"
                class="vintage-lyric-line"
                :class="{
                  'is-active': idx === currentLineIndex,
                  'is-past': idx < currentLineIndex
                }"
                @click="handleLineClick(line.time)"
              >
                {{ line.text || '♪ ♪ ♪' }}
              </p>
            </div>

            <!-- 2. Letras Planas -->
            <div v-else-if="lyricsData?.plainLyrics" class="plain-text-flow">
              <p>{{ lyricsData.plainLyrics }}</p>
            </div>

            <!-- 3. Vacío -->
            <div v-else class="empty-lyrics-notice">
              <span class="empty-glyph">📜</span>
              <p class="empty-headline">Letra no disponible en la base de datos local</p>
              <p class="empty-sub">Presiona "SINCRONIZAR DB" para buscarla automáticamente.</p>
            </div>
          </div>

          <!-- Pie del Modal -->
          <footer class="lyrics-footer-panel">
            <button 
              class="btn-autoscroll-toggle" 
              @click="autoScrollEnabled = true" 
              :class="{ 'is-locked': autoScrollEnabled }"
            >
              <span class="led-marker"></span>
              <span>SEGUIMIENTO AUTOMÁTICO</span>
            </button>

            <span class="tape-timer-readout">POSICIÓN: {{ Math.floor(currentTime) }}s</span>
          </footer>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.vintage-lyrics-overlay {
  position: fixed;
  inset: 0;
  background: rgba(27, 22, 17, 0.82);
  backdrop-filter: blur(5px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
  box-sizing: border-box;
}

.vintage-lyrics-card {
  position: relative;
  width: 100%;
  max-width: 620px;
  background: #ded2be;
  border: 3px solid #baa88f;
  border-radius: 22px;
  box-shadow: 
    0 24px 50px rgba(0, 0, 0, 0.65),
    inset 0 2px 4px rgba(255, 255, 255, 0.5);
  display: flex;
  flex-direction: column;
  padding: 22px 24px;
  box-sizing: border-box;
  color: #1f1c18;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Georgia, serif;
}

.chassis-bolt {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #a89a83;
  border: 1px solid #7d715e;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.5);
}
.bolt-tl { top: 9px; left: 9px; }
.bolt-tr { top: 9px; right: 9px; }
.bolt-bl { bottom: 9px; left: 9px; }
.bolt-br { bottom: 9px; right: 9px; }

.lyrics-header-panel {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1.5px solid #baa88f;
}
.header-metadata { flex: 1; min-width: 0; padding-right: 14px; }
.vintage-tag {
  font-size: 0.64rem;
  font-weight: 900;
  letter-spacing: 0.8px;
  color: #8b2616;
  text-transform: uppercase;
}
.vintage-song-title {
  margin: 2px 0 3px 0;
  font-size: 1.35rem;
  font-weight: 900;
  color: #1f1c18;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vintage-song-artist {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 800;
  color: #5c5346;
}
.album-tag { color: #7d7262; font-weight: 700; }

.btn-vintage-modal-close {
  background: #cfbeaa;
  border: 1.5px solid #baa88f;
  border-radius: 8px;
  color: #1f1c18;
  width: 34px;
  height: 34px;
  font-size: 0.95rem;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 0 #9c8c77;
  transition: all 0.1s ease;
}
.btn-vintage-modal-close:active {
  transform: translateY(2px);
  box-shadow: 0 0 0 #9c8c77;
}

.lyrics-control-strip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #cebeaa;
  border: 1.5px solid #baa88f;
  padding: 8px 12px;
  border-radius: 12px;
  margin-bottom: 12px;
}
.sync-indicator-group { display: flex; align-items: center; gap: 8px; }
.sync-amber-lamp {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #786c5c;
  transition: all 0.3s ease;
}
.sync-amber-lamp.is-active-lamp {
  background: #8b2616;
  box-shadow: 0 0 6px #8b2616;
}
.sync-status-label {
  font-size: 0.72rem;
  font-weight: 900;
  color: #1f1c18;
  letter-spacing: 0.4px;
}

.btn-vintage-sync-action {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #8b2616;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.72rem;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(139, 38, 22, 0.35);
  transition: transform 0.1s ease;
}
.btn-vintage-sync-action svg { width: 13px; height: 13px; }
.btn-vintage-sync-action:active { transform: scale(0.95); }

.sync-progress-track {
  width: 100%;
  height: 4px;
  background: #c5b69f;
  border-radius: 2px;
  margin-bottom: 12px;
  overflow: hidden;
}
.sync-progress-fill {
  height: 100%;
  background: #8b2616;
  transition: width 0.2s linear;
}

.lyrics-scroll-cavity {
  background: #f2eadc;
  border: 2.5px solid #baa88f;
  border-radius: 16px;
  box-shadow: inset 0 4px 10px rgba(0, 0, 0, 0.12);
  height: 380px;
  overflow-y: auto;
  padding: 30px 20px;
  box-sizing: border-box;
  text-align: center;
  scrollbar-width: thin;
  scrollbar-color: #baa88f transparent;
}
.lyrics-scroll-cavity::-webkit-scrollbar { width: 6px; }
.lyrics-scroll-cavity::-webkit-scrollbar-thumb { background: #baa88f; border-radius: 3px; }

.lines-flow-container { display: flex; flex-direction: column; gap: 16px; }
.vintage-lyric-line {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #786c5c;
  cursor: pointer;
  padding: 8px 14px;
  border-radius: 10px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}
.vintage-lyric-line:hover {
  color: #8b2616;
  background: rgba(139, 38, 22, 0.08);
}
.vintage-lyric-line.is-active {
  font-size: 1.35rem;
  font-weight: 900;
  color: #8b2616;
  transform: scale(1.04);
  text-shadow: 0 1px 2px rgba(139, 38, 22, 0.2);
}
.vintage-lyric-line.is-past {
  color: #423c34;
  opacity: 0.88;
}

.plain-text-flow p {
  white-space: pre-line;
  font-size: 1rem;
  line-height: 1.8;
  color: #1f1c18;
  font-weight: 700;
}

.empty-lyrics-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #5c5346;
}
.empty-glyph { font-size: 2.2rem; margin-bottom: 8px; }
.empty-headline { margin: 0 0 4px 0; font-size: 0.95rem; font-weight: 900; color: #1f1c18; }
.empty-sub { margin: 0; font-size: 0.8rem; font-weight: 700; color: #7d7262; }

.lyrics-footer-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1.5px solid #baa88f;
}
.btn-autoscroll-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #cebeaa;
  border: 1.5px solid #baa88f;
  border-radius: 8px;
  color: #1f1c18;
  padding: 6px 12px;
  font-size: 0.7rem;
  font-weight: 900;
  cursor: pointer;
}
.led-marker {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8b2616;
}
.btn-autoscroll-toggle.is-locked {
  background: #efe7d8;
  border-color: #8b2616;
  color: #8b2616;
}
.tape-timer-readout {
  font-size: 0.74rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  color: #4a4237;
}

.vintage-modal-fade-enter-active, .vintage-modal-fade-leave-active { transition: all 0.25s ease-out; }
.vintage-modal-fade-enter-from, .vintage-modal-fade-leave-to { opacity: 0; transform: scale(0.96); }
</style>