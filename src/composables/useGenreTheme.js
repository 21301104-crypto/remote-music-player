// src/composables/useGenreTheme.js
import { computed } from 'vue';

const THEME_PRESETS = {
  rock: {
    name: 'Rock / Metal',
    accent: '#ef4444',     // Crimson Red
    secondary: '#991b1b',
    glow: 'rgba(239, 68, 68, 0.45)',
    bgGradient: 'radial-gradient(circle at top, #200a0e 0%, #060913 100%)'
  },
  pop: {
    name: 'Pop / Dance',
    accent: '#ec4899',     // Hot Pink
    secondary: '#a855f7',
    glow: 'rgba(236, 72, 153, 0.45)',
    bgGradient: 'radial-gradient(circle at top, #260c23 0%, #060913 100%)'
  },
  electronic: {
    name: 'Electronic / EDM',
    accent: '#06b6d4',     // Cyan
    secondary: '#7c3aed',
    glow: 'rgba(6, 182, 212, 0.45)',
    bgGradient: 'radial-gradient(circle at top, #08212e 0%, #060913 100%)'
  },
  latin: {
    name: 'Latino / Bachata',
    accent: '#f97316',     // Sunset Orange
    secondary: '#eab308',
    glow: 'rgba(249, 115, 22, 0.45)',
    bgGradient: 'radial-gradient(circle at top, #2b1406 0%, #060913 100%)'
  },
  hiphop: {
    name: 'Hip-Hop / Rap',
    accent: '#10b981',     // Emerald Green
    secondary: '#059669',
    glow: 'rgba(16, 185, 129, 0.45)',
    bgGradient: 'radial-gradient(circle at top, #072418 0%, #060913 100%)'
  },
  jazz: {
    name: 'Jazz / Lo-Fi',
    accent: '#818cf8',     // Lavender Purple
    secondary: '#4f46e5',
    glow: 'rgba(129, 140, 248, 0.45)',
    bgGradient: 'radial-gradient(circle at top, #141332 0%, #060913 100%)'
  },
  default: {
    name: 'Default Blue',
    accent: '#38bdf8',     // Electric Blue
    secondary: '#2563eb',
    glow: 'rgba(56, 189, 248, 0.45)',
    bgGradient: 'radial-gradient(circle at top, #0f172a 0%, #060913 100%)'
  }
};

export function useGenreTheme(currentGenreRef) {
  const currentTheme = computed(() => {
    const raw = (currentGenreRef.value || '').toLowerCase();

    if (raw.includes('rock') || raw.includes('metal') || raw.includes('punk') || raw.includes('grunge') || raw.includes('heavy')) {
      return THEME_PRESETS.rock;
    }
    if (raw.includes('pop') || raw.includes('dance') || raw.includes('disco') || raw.includes('k-pop')) {
      return THEME_PRESETS.pop;
    }
    if (raw.includes('electro') || raw.includes('edm') || raw.includes('techno') || raw.includes('house') || raw.includes('synth') || raw.includes('trance')) {
      return THEME_PRESETS.electronic;
    }
    if (raw.includes('latin') || raw.includes('bachata') || raw.includes('salsa') || raw.includes('reggaeton') || raw.includes('cumbia') || raw.includes('urbano')) {
      return THEME_PRESETS.latin;
    }
    if (raw.includes('hip') || raw.includes('rap') || raw.includes('trap') || raw.includes('r&b')) {
      return THEME_PRESETS.hiphop;
    }
    if (raw.includes('jazz') || raw.includes('blues') || raw.includes('lo-fi') || raw.includes('acoustic') || raw.includes('classic') || raw.includes('indie')) {
      return THEME_PRESETS.jazz;
    }

    return THEME_PRESETS.default;
  });

  const themeStyleObject = computed(() => ({
    '--theme-accent': currentTheme.value.accent,
    '--theme-secondary': currentTheme.value.secondary,
    '--theme-glow': currentTheme.value.glow,
    '--theme-bg': currentTheme.value.bgGradient
  }));

  return {
    currentTheme,
    themeStyleObject
  };
}