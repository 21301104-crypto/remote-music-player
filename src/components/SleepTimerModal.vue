<!-- src/components/SleepTimerModal.vue -->
<script setup>
import { computed } from 'vue';

const props = defineProps({
  isOpen: Boolean,
  sleepTimer: {
    type: Object,
    default: () => ({ active: false, remainingSeconds: 0 })
  }
});

const emit = defineEmits(['close', 'set-timer', 'cancel-timer']);

const presets = [
  { label: '15 Minutos', value: 15 },
  { label: '30 Minutos', value: 30 },
  { label: '45 Minutos', value: 45 },
  { label: '60 Minutos', value: 60 }
];

const formatCountdown = (seconds) => {
  if (!seconds || seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const selectPreset = (minutes) => {
  emit('set-timer', minutes);
  emit('close');
};

const handleCancel = () => {
  emit('cancel-timer');
  emit('close');
};
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
    <div class="timer-sheet">
      <div class="sheet-handle"></div>

      <div class="sheet-header">
        <div class="sheet-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
          <h3>Temporizador de Apagado</h3>
        </div>
        <button class="btn-close" @click="emit('close')">✕</button>
      </div>

      <!-- Estado Activo -->
      <div v-if="sleepTimer.active" class="active-status-card">
        <div class="status-info">
          <span class="pulse-dot"></span>
          <span class="status-msg">Apagado automático en:</span>
        </div>
        <span class="countdown-badge">{{ formatCountdown(sleepTimer.remainingSeconds) }}</span>
      </div>

      <!-- Opciones -->
      <div class="presets-list">
        <button 
          v-for="preset in presets" 
          :key="preset.value"
          class="btn-preset-option"
          @click="selectPreset(preset.value)"
        >
          <span>{{ preset.label }}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>

        <button 
          v-if="sleepTimer.active"
          class="btn-cancel-timer" 
          @click="handleCancel"
        >
          Desactivar Temporizador
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
  z-index: 200;
}

.timer-sheet {
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
  margin-bottom: 16px;
}
.sheet-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sheet-title svg {
  width: 18px;
  height: 18px;
  color: var(--theme-accent, #38bdf8);
}
.sheet-title h3 {
  margin: 0;
  font-size: 1rem;
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

.active-status-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid var(--theme-accent, #38bdf8);
  padding: 10px 14px;
  border-radius: 14px;
  margin-bottom: 14px;
}
.status-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--theme-accent, #38bdf8);
  box-shadow: 0 0 8px var(--theme-accent, #38bdf8);
  animation: pulse 1.5s infinite;
}
.status-msg {
  font-size: 0.8rem;
  font-weight: 600;
  color: #f8fafc;
}
.countdown-badge {
  font-size: 1.1rem;
  font-weight: 900;
  color: var(--theme-accent, #38bdf8);
  font-variant-numeric: tabular-nums;
}

@keyframes pulse {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.2); }
  100% { opacity: 1; transform: scale(1); }
}

.presets-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.btn-preset-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.05);
  color: #f8fafc;
  padding: 14px 16px;
  border-radius: 14px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-preset-option:active {
  background: rgba(56, 189, 248, 0.15);
  border-color: var(--theme-accent, #38bdf8);
}
.btn-preset-option svg {
  width: 16px;
  height: 16px;
  color: #64748b;
}

.btn-cancel-timer {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #ef4444;
  padding: 12px;
  border-radius: 14px;
  font-size: 0.85rem;
  font-weight: 800;
  cursor: pointer;
  margin-top: 4px;
  transition: background 0.15s ease;
}
.btn-cancel-timer:active { background: rgba(239, 68, 68, 0.3); }
</style>