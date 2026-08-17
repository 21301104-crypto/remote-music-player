<!-- src/components/AudioVisualizer.vue -->
<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps({
  isPlaying: Boolean,
  accentColor: { type: String, default: '#38bdf8' },
  secondaryColor: { type: String, default: '#818cf8' },
  glowColor: { type: String, default: 'rgba(56, 189, 248, 0.4)' }
});

const canvasRef = ref(null);
const currentMode = ref('bars'); // 'bars' | 'wave' | 'vu'
let animationFrameId = null;

// Parámetros de simulación física del motor DSP
const BANDS_COUNT = 32;
const frequencyData = new Float32Array(BANDS_COUNT);
const peakData = new Float32Array(BANDS_COUNT);
let phase = 0;

const toggleMode = () => {
  if (currentMode.value === 'bars') currentMode.value = 'wave';
  else if (currentMode.value === 'wave') currentMode.value = 'vu';
  else currentMode.value = 'bars';
};

const updateFrequencySimulation = () => {
  phase += 0.08;
  for (let i = 0; i < BANDS_COUNT; i++) {
    if (props.isPlaying) {
      const baseFreq = Math.sin(phase + i * 0.25) * 0.4 + 0.5;
      const noise = Math.random() * 0.2;
      const targetHeight = Math.min(1, Math.max(0.08, baseFreq + noise));
      
      // Interpolación suave (Decay/Attack)
      frequencyData[i] += (targetHeight - frequencyData[i]) * 0.25;

      if (frequencyData[i] > peakData[i]) {
        peakData[i] = frequencyData[i];
      } else {
        peakData[i] -= 0.008; // Caída de pico lenta
      }
    } else {
      frequencyData[i] *= 0.88;
      peakData[i] *= 0.90;
    }
  }
};

const render = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  updateFrequencySimulation();

  if (currentMode.value === 'bars') {
    // 1. MODO: ANALIZADOR DE ESPECTRO (32 BANDAS CON PICOS)
    const barWidth = (width / BANDS_COUNT) - 2;

    for (let i = 0; i < BANDS_COUNT; i++) {
      const barHeight = frequencyData[i] * (height - 8);
      const x = i * (barWidth + 2);
      const y = height - barHeight;

      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, props.secondaryColor);
      gradient.addColorStop(1, props.accentColor);

      ctx.fillStyle = gradient;
      ctx.shadowColor = props.glowColor;
      ctx.shadowBlur = props.isPlaying ? 8 : 0;
      ctx.fillRect(x, y, barWidth, barHeight);

      // Dibujar barra de pico flotante (Peak Drop)
      if (peakData[i] > 0.05) {
        const peakY = height - (peakData[i] * (height - 8)) - 2;
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 4;
        ctx.fillRect(x, Math.max(0, peakY), barWidth, 2);
      }
    }
  } else if (currentMode.value === 'wave') {
    // 2. MODO: OSCILOSCOPIO DE ONDA ANALÓGICA HI-FI
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = props.accentColor;
    ctx.shadowColor = props.glowColor;
    ctx.shadowBlur = props.isPlaying ? 12 : 2;

    const sliceWidth = width / BANDS_COUNT;
    let x = 0;

    for (let i = 0; i < BANDS_COUNT; i++) {
      const v = frequencyData[i];
      const y = (height / 2) + ((v - 0.5) * (height * 0.8));

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);

      x += sliceWidth;
    }

    ctx.lineTo(width, height / 2);
    ctx.stroke();
  } else if (currentMode.value === 'vu') {
    // 3. MODO: VÚMETRO DUAL (LEFT / RIGHT STEREO ANALYZER)
    const leftVal = frequencyData[4];
    const rightVal = frequencyData[12];
    const meterHeight = (height / 2) - 4;

    // Canal L
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, 2, width, meterHeight);
    ctx.fillStyle = props.accentColor;
    ctx.fillRect(0, 2, width * leftVal, meterHeight);

    // Canal R
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, (height / 2) + 2, width, meterHeight);
    ctx.fillStyle = props.secondaryColor;
    ctx.fillRect(0, (height / 2) + 2, width * rightVal, meterHeight);
  }

  animationFrameId = requestAnimationFrame(render);
};

const handleResize = () => {
  if (canvasRef.value) {
    canvasRef.value.width = canvasRef.value.offsetWidth * window.devicePixelRatio;
    canvasRef.value.height = canvasRef.value.offsetHeight * window.devicePixelRatio;
    const ctx = canvasRef.value.getContext('2d');
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }
};

onMounted(() => {
  handleResize();
  window.addEventListener('resize', handleResize);
  render();
});

onUnmounted(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  window.removeEventListener('resize', handleResize);
});
</script>

<template>
  <div class="visualizer-container" @click="toggleMode" title="Toca para cambiar de modo visual">
    <canvas ref="canvasRef" class="visualizer-canvas"></canvas>
    <span class="mode-badge">{{ currentMode.toUpperCase() }}</span>
  </div>
</template>

<style scoped>
.visualizer-container {
  position: relative;
  width: 100%;
  height: 48px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  margin-bottom: 12px;
}

.visualizer-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.mode-badge {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 0.55rem;
  font-weight: 900;
  color: var(--theme-accent, #38bdf8);
  background: rgba(15, 23, 42, 0.85);
  padding: 1px 4px;
  border-radius: 4px;
  letter-spacing: 0.5px;
  pointer-events: none;
}
</style>