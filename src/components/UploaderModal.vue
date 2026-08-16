<!-- src/components/UploaderModal.vue -->
<script setup>
import { ref } from 'vue';

const props = defineProps({
  isOpen: Boolean,
  backendUrl: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['close']);

const isDragging = ref(false);
const selectedFiles = ref([]);
const isUploading = ref(false);
const uploadProgress = ref(0);
const uploadStatusMessage = ref('');
const uploadSuccess = ref(false);
const fileInputRef = ref(null);

const SUPPORTED_EXTS = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg'];

const filterAudioFiles = (files) => {
  const valid = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (SUPPORTED_EXTS.includes(ext) || file.type.startsWith('audio/')) {
      valid.push(file);
    }
  }
  return valid;
};

const handleFileSelect = (event) => {
  const files = event.target.files;
  if (files && files.length > 0) {
    selectedFiles.value = filterAudioFiles(files);
  }
};

const handleDrop = (event) => {
  isDragging.value = false;
  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    selectedFiles.value = filterAudioFiles(files);
  }
};

const formatSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const removeFile = (index) => {
  selectedFiles.value.splice(index, 1);
};

const resetState = () => {
  selectedFiles.value = [];
  isUploading.value = false;
  uploadProgress.value = 0;
  uploadStatusMessage.value = '';
  uploadSuccess.value = false;
  if (fileInputRef.value) fileInputRef.value.value = '';
};

const startUpload = () => {
  if (selectedFiles.value.length === 0 || isUploading.value) return;

  isUploading.value = true;
  uploadProgress.value = 0;
  uploadStatusMessage.value = 'Enviando archivos a la MicroSD...';
  uploadSuccess.value = false;

  const formData = new FormData();
  selectedFiles.value.forEach((file) => {
    formData.append('audioFiles', file);
  });

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${props.backendUrl}/api/upload`);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      uploadProgress.value = Math.round((e.loaded / e.total) * 100);
      if (uploadProgress.value === 100) {
        uploadStatusMessage.value = 'Indexando metadatos ID3 en el servidor...';
      }
    }
  };

  xhr.onload = () => {
    isUploading.value = false;
    if (xhr.status >= 200 && xhr.status < 300) {
      uploadSuccess.value = true;
      uploadStatusMessage.value = `¡${selectedFiles.value.length} pista(s) subida(s) e indexada(s)!`;
      setTimeout(() => {
        resetState();
        emit('close');
      }, 1600);
    } else {
      uploadStatusMessage.value = `Error en el servidor: ${xhr.statusText || 'No se pudo subir'}`;
    }
  };

  xhr.onerror = () => {
    isUploading.value = false;
    uploadStatusMessage.value = 'Error de red al intentar transferir archivos.';
  };

  xhr.send(formData);
};

const closeModal = () => {
  if (!isUploading.value) {
    resetState();
    emit('close');
  }
};
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="closeModal">
    <div class="sheet-container">
      <div class="sheet-handle"></div>

      <div class="sheet-header">
        <div class="title-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <h3>Subir Música a la MicroSD</h3>
        </div>
        <button class="btn-close" :disabled="isUploading" @click="closeModal">✕</button>
      </div>

      <!-- Zona de Drag & Drop -->
      <div 
        class="dropzone"
        :class="{ active: isDragging, disabled: isUploading }"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleDrop"
        @click="!isUploading && fileInputRef.click()"
      >
        <input 
          ref="fileInputRef" 
          type="file" 
          multiple 
          accept="audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg" 
          style="display: none;" 
          @change="handleFileSelect"
        />

        <div class="dropzone-inner">
          <div class="icon-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          </div>
          <p class="dropzone-main-text">Arrastra canciones aquí o <span>toca para explorar</span></p>
          <span class="dropzone-sub">Formatos: MP3, FLAC, WAV, M4A, AAC, OGG</span>
        </div>
      </div>

      <!-- Lista de Archivos Seleccionados -->
      <div v-if="selectedFiles.length > 0" class="files-preview-box">
        <div class="preview-header">
          <span>Archivos listos ({{ selectedFiles.length }})</span>
          <button v-if="!isUploading" class="btn-clear" @click="selectedFiles = []">Limpiar</button>
        </div>

        <ul class="files-list">
          <li v-for="(file, index) in selectedFiles" :key="file.name + index">
            <div class="file-info">
              <span class="file-name">{{ file.name }}</span>
              <span class="file-size">{{ formatSize(file.size) }}</span>
            </div>
            <button v-if="!isUploading" class="btn-remove-file" @click="removeFile(index)">✕</button>
          </li>
        </ul>
      </div>

      <!-- Barra de Progreso y Mensaje -->
      <div v-if="isUploading || uploadStatusMessage" class="upload-progress-card">
        <div class="progress-info-row">
          <span class="status-msg" :class="{ success: uploadSuccess }">{{ uploadStatusMessage }}</span>
          <span v-if="isUploading" class="percent-val">{{ uploadProgress }}%</span>
        </div>
        <div class="upload-bar-rail">
          <div class="upload-bar-fill" :style="{ width: `${uploadProgress}%` }"></div>
        </div>
      </div>

      <!-- Botón de Acción -->
      <div class="actions-footer">
        <button 
          class="btn-upload-submit"
          :disabled="selectedFiles.length === 0 || isUploading"
          @click="startUpload"
        >
          <span v-if="!isUploading">Subir {{ selectedFiles.length > 0 ? `(${selectedFiles.length})` : '' }}</span>
          <span v-else>Transfiriendo... {{ uploadProgress }}%</span>
        </button>
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
  z-index: 210;
}

.sheet-container {
  width: 100%;
  max-width: 390px;
  background: rgba(15, 23, 42, 0.96);
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 28px 28px 0 0;
  padding: 12px 16px 34px 16px;
  box-sizing: border-box;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.85);
}

.sheet-handle {
  width: 36px;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  margin: 0 auto 12px auto;
}

.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.title-box {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title-box svg {
  width: 18px;
  height: 18px;
  color: var(--theme-accent, #38bdf8);
}
.title-box h3 {
  margin: 0;
  font-size: 0.95rem;
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

.dropzone {
  background: rgba(11, 15, 25, 0.6);
  border: 2px dashed rgba(56, 189, 248, 0.3);
  border-radius: 16px;
  padding: 18px 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 12px;
}
.dropzone.active {
  background: rgba(56, 189, 248, 0.1);
  border-color: var(--theme-accent, #38bdf8);
  transform: scale(0.99);
}
.dropzone.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.dropzone-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.icon-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-circle svg {
  width: 20px;
  height: 20px;
  color: var(--theme-accent, #38bdf8);
}

.dropzone-main-text {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #f8fafc;
}
.dropzone-main-text span {
  color: var(--theme-accent, #38bdf8);
  text-decoration: underline;
}
.dropzone-sub {
  font-size: 0.65rem;
  color: #64748b;
}

.files-preview-box {
  background: rgba(11, 15, 25, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 14px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.72rem;
  font-weight: 700;
  color: #94a3b8;
  margin-bottom: 8px;
}
.btn-clear {
  background: transparent;
  border: none;
  color: #ef4444;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
}

.files-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 18vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.files-list li {
  background: rgba(30, 41, 59, 0.6);
  padding: 6px 10px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.file-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding-right: 6px;
}
.file-name {
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #f8fafc;
}
.file-size {
  font-size: 0.62rem;
  color: #64748b;
}
.btn-remove-file {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 2px 4px;
}

.upload-progress-card {
  margin-bottom: 12px;
}
.progress-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  margin-bottom: 4px;
}
.status-msg { color: #38bdf8; }
.status-msg.success { color: #34d399; }
.percent-val { color: #f8fafc; font-variant-numeric: tabular-nums; }
.upload-bar-rail {
  width: 100%;
  height: 5px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
}
.upload-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--theme-secondary, #2563eb), var(--theme-accent, #38bdf8));
  border-radius: 3px;
  transition: width 0.15s ease;
}

.actions-footer {
  display: flex;
}
.btn-upload-submit {
  flex: 1;
  background: var(--theme-accent, #38bdf8);
  color: #030712;
  border: none;
  padding: 12px;
  border-radius: 14px;
  font-size: 0.85rem;
  font-weight: 800;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.btn-upload-submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>