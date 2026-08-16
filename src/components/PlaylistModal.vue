<!-- src/components/PlaylistModal.vue -->
<script setup>
import { ref } from 'vue';

const props = defineProps({
  isOpen: Boolean,
  mode: {
    type: String,
    default: 'create' // 'create' | 'add_track'
  },
  trackToAdd: {
    type: Object,
    default: null
  },
  playlists: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['close', 'create-playlist', 'add-to-playlist']);

const newPlaylistName = ref('');

const handleCreate = () => {
  if (!newPlaylistName.value.trim()) return;
  emit('create-playlist', newPlaylistName.value.trim());
  newPlaylistName.value = '';
  emit('close');
};

const handleSelectPlaylist = (playlistId) => {
  if (props.trackToAdd) {
    emit('add-to-playlist', { playlistId, trackPath: props.trackToAdd.path });
    emit('close');
  }
};
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
    <div class="sheet-container">
      <div class="sheet-handle"></div>

      <!-- MODO: Crear Playlist -->
      <div v-if="mode === 'create'" class="modal-body">
        <div class="sheet-header">
          <h3>➕ Nueva Playlist</h3>
          <button class="btn-close" @click="emit('close')">✕</button>
        </div>

        <p class="subtitle">Escribe un nombre para tu lista de reproducción:</p>
        <input 
          type="text" 
          v-model="newPlaylistName" 
          placeholder="Ej. Para el gym, Noche, Rock 90s..." 
          class="name-input"
          @keyup.enter="handleCreate"
          autofocus
        />

        <div class="actions-row">
          <button class="btn-action btn-cancel" @click="emit('close')">Cancelar</button>
          <button class="btn-action btn-submit" @click="handleCreate">Crear Lista</button>
        </div>
      </div>

      <!-- MODO: Agregar Canción a Playlist -->
      <div v-else class="modal-body">
        <div class="sheet-header">
          <h3>📁 Agregar a Playlist</h3>
          <button class="btn-close" @click="emit('close')">✕</button>
        </div>

        <div v-if="trackToAdd" class="target-track-info">
          <span class="track-name">{{ trackToAdd.title }}</span>
          <span class="track-artist">{{ trackToAdd.artist }}</span>
        </div>

        <div v-if="playlists.length > 0" class="playlists-picker-list">
          <button 
            v-for="pl in playlists" 
            :key="pl.id"
            class="playlist-pick-item"
            @click="handleSelectPlaylist(pl.id)"
          >
            <div class="pl-meta">
              <span class="pl-name">{{ pl.name }}</span>
              <span class="pl-count">{{ pl.tracks.length }} canciones</span>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
        <div v-else class="empty-state">
          <p>No tienes listas creadas.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 200;
}

.sheet-container {
  width: 100%;
  max-width: 390px;
  background: rgba(15, 23, 42, 0.95);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 28px 28px 0 0;
  padding: 12px 18px 36px 18px;
  box-sizing: border-box;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.8);
}

.sheet-handle {
  width: 36px;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  margin: 0 auto 14px auto;
}

.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.sheet-header h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #f8fafc;
}
.btn-close {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: #94a3b8;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
}

.subtitle {
  font-size: 0.8rem;
  color: #94a3b8;
  margin: 0 0 12px 0;
}

.name-input {
  width: 100%;
  background: rgba(9, 14, 26, 0.8);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 12px;
  padding: 12px 14px;
  color: #f8fafc;
  font-size: 0.9rem;
  box-sizing: border-box;
  outline: none;
  margin-bottom: 16px;
}
.name-input:focus { border-color: var(--theme-accent, #38bdf8); }

.actions-row {
  display: flex;
  gap: 10px;
}
.btn-action {
  flex: 1;
  padding: 12px;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  border: none;
}
.btn-cancel {
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
}
.btn-submit {
  background: var(--theme-accent, #38bdf8);
  color: #060913;
}

.target-track-info {
  display: flex;
  flex-direction: column;
  background: rgba(56, 189, 248, 0.08);
  border-left: 3px solid var(--theme-accent, #38bdf8);
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 14px;
}
.track-name { font-size: 0.85rem; font-weight: 700; color: #f8fafc; }
.track-artist { font-size: 0.72rem; color: var(--theme-accent, #38bdf8); }

.playlists-picker-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 35vh;
  overflow-y: auto;
}
.playlist-pick-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.05);
  color: #f8fafc;
  padding: 12px 14px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.playlist-pick-item:active { background: rgba(56, 189, 248, 0.15); }
.pl-meta { display: flex; flex-direction: column; text-align: left; }
.pl-name { font-size: 0.85rem; font-weight: 700; }
.pl-count { font-size: 0.7rem; color: #64748b; margin-top: 2px; }
.playlist-pick-item svg { width: 14px; height: 14px; color: #64748b; }

.empty-state { text-align: center; color: #64748b; font-size: 0.85rem; padding: 16px 0; }
</style>