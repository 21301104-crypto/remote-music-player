<!-- src/components/EqualizerModal.vue -->
<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  isOpen: Boolean,
  eqSettings: {
    type: Object,
    default: () => ({
      enabled: true,
      preset: 'bass_boost',
      bands: []
    })
  }
});

const emit = defineEmits(['close', 'update-eq']);

const localEq = ref(JSON.parse(JSON.stringify(props.eqSettings)));

watch(() => props.eqSettings, (newVal) => {
  localEq.value = JSON.parse(JSON.stringify(newVal));
}, { deep: true });

const PRESETS = {
  bass_boost: {
    name: '🔊 Bass Boost',
    gains: [6.0, 6.0, 4.5, 2.0, 0.5, -2.0, -1.5, -1.0, -1.0, -1.0]
  },
  rock: {
    name: '🎸 Rock / Metal',
    gains: [4.5, 3.5, 2.0, 0.0, -1.0, -0.5, 1.5, 3.0, 4.0, 4.5]
  },
  vocal: {
    name: '🎙️ Vocal / Pop',
    gains: [-1.5, -1.0, 0.0, 1.5, 3.0, 3.5, 2.5, 1.5, 0.5, 0.0]
  },
  flat: {
    name: '⚖️ Flat (0 dB)',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  }
};

const applyPreset = (presetKey) => {
  const p = PRESETS[presetKey];
  if (!p) return;
  localEq.value.preset = presetKey;
  localEq.value.enabled = true;
  localEq.value.bands.forEach((band, idx) => {
    band.gain = p.gains[idx] || 0;
  });
  emit('update-eq', localEq.value);
};

const handleSliderChange = (index, value) => {
  localEq.value.bands[index].gain = parseFloat(value);
  localEq.value.preset = 'custom';
  emit('update-eq', localEq.value);
};

const toggleEqEnabled = () => {
  localEq.value.enabled = !localEq.value.enabled;
  emit('update-eq', localEq.value);
};
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
    <div class="sheet-container">
      <div class="sheet-handle"></div>

      <!-- Header del Ecualizador -->
      <div class="sheet-header">
        <div class="title-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="4" y1="21" x2="4" y2="14"></line>
            <line x1="4" y1="10" x2="4" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12" y2="3"></line>
            <line x1="20" y1="21" x2="20" y2="16"></line>
            <line x1="20" y1="12" x2="20" y2="3"></line>
            <line x1="1" y1="14" x2="7" y2="14"></line>
            <line x1="9" y1="8" x2="15" y2="8"></line>
            <line x1="17" y1="16" x2="23" y2="16"></line>
          </svg>
          <h3>Ecualizador DSP</h3>
        </div>

        <div class="header-controls">
          <button 
            class="btn-toggle-bypass" 
            :class="{ active: localEq.enabled }"
            @click="toggleEqEnabled"
          >
            {{ localEq.enabled ? 'ON' : 'BYPASS' }}
          </button>
          <button class="btn-close" @click="emit('close')">✕</button>
        </div>
      </div>

      <!-- Presets Rápidos -->
      <div class="presets-row">
        <button 
          v-for="(p, key) in PRESETS" 
          :key="key"
          class="preset-chip"
          :class="{ active: localEq.preset === key && localEq.enabled }"
          @click="applyPreset(key)"
        >
          {{ p.name }}
        </button>
      </div>

      <!-- Parrilla de 10 Bandas Verticales -->
      <div class="eq-grid" :class="{ disabled: !localEq.enabled }">
        <div 
          v-for="(band, idx) in localEq.bands" 
          :key="band.freq" 
          class="slider-column"
        >
          <span class="gain-text" :class="{ positive: band.gain > 0, negative: band.gain < 0 }">
            {{ band.gain > 0 ? '+' : '' }}{{ band.gain }}
          </span>

          <div class="slider-wrapper">
            <input 
              type="range" 
              min="-10" 
              max="10" 
              step="0.5"
              :value="band.gain" 
              @input="handleSliderChange(idx, $event.target.value)"
              class="v-slider"
              :disabled="!localEq.enabled"
            />
          </div>

          <span class="freq-label">{{ band.label }}</span>
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
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 28px 28px 0 0;
  padding: 12px 14px 34px 14px;
  box-sizing: border-box;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.8);
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
  margin-bottom: 12px;
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
  font-size: 1rem;
  font-weight: 800;
  color: #f8fafc;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-toggle-bypass {
  background: #334155;
  border: none;
  color: #94a3b8;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.65rem;
  font-weight: 800;
  cursor: pointer;
  letter-spacing: 0.5px;
}
.btn-toggle-bypass.active {
  background: var(--theme-accent, #38bdf8);
  color: #030712;
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

.presets-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 8px;
  margin-bottom: 14px;
  scrollbar-width: none;
}
.presets-row::-webkit-scrollbar { display: none; }
.preset-chip {
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  padding: 5px 10px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
}
.preset-chip.active {
  background: var(--theme-accent, #38bdf8);
  color: #030712;
  border-color: var(--theme-accent, #38bdf8);
}

.eq-grid {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 180px;
  background: rgba(11, 15, 25, 0.7);
  padding: 12px 6px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: opacity 0.2s ease;
}
.eq-grid.disabled {
  opacity: 0.35;
  pointer-events: none;
}

.slider-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  width: 10%;
}
.gain-text {
  font-size: 0.6rem;
  font-weight: 800;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}
.gain-text.positive { color: var(--theme-accent, #38bdf8); }
.gain-text.negative { color: #ef4444; }

.slider-wrapper {
  position: relative;
  width: 20px;
  height: 110px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.v-slider {
  -webkit-appearance: none;
  width: 110px;
  height: 4px;
  background: #1e293b;
  border-radius: 2px;
  outline: none;
  transform: rotate(-90deg);
  accent-color: var(--theme-accent, #38bdf8);
  cursor: pointer;
}
.freq-label {
  font-size: 0.6rem;
  font-weight: 700;
  color: #94a3b8;
  margin-top: 2px;
}
</style>